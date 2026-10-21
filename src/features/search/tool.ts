import type {
	TavilyExtractAPIRetrieverFields,
	TavilySearchAPIRetrieverFields,
} from "@langchain/tavily";
import { TavilyExtract, TavilySearch } from "@langchain/tavily";
import { createUrlCache, type UrlCache } from "@src/utils/url-cache.js";

/**
 * The two ways an agent reaches the web.
 *
 * `search` finds pages; `open_url` reads one. The split matters because every
 * skill grades the agent on reading the body of a source before citing it, and
 * a search result is a snippet: with `chunksPerSource: 1` it is one ~500
 * character chunk of the page, not the page. An agent told to "open the article
 * and read the body" with only a search tool either cannot comply or claims a
 * body it never read, which is the failure every skill's own "never cite a
 * snippet" rule exists to prevent.
 */

/** The names the prompts and the skills refer to. */
const SEARCH_TOOL_NAME = "search";
const EXTRACT_TOOL_NAME = "open_url";

/**
 * Tavily answers a query made up entirely of `site:` operators with a 400:
 * "Query cannot consist only of site: operators."
 *
 * `TavilySearch._call` swallows that failure and hands the model an
 * `{ error }` object as a normal tool result, so the model treats it as data,
 * re-issues another site-only query, and gets another error. The loop runs
 * until the agent's recursion limit trips, losing the whole invocation to a
 * query the API would never accept.
 *
 * Rewriting the operator into Tavily's own include_domains parameter keeps the
 * model's intent and gives the API something it accepts, so the loop never
 * starts.
 */
const SITE_OPERATOR = /(^|\s)site:(\S+)/gi;
const FALLBACK_QUERY = "stock market analysis";

type NormalizedQuery = { query: string; includeDomains: string[] };

/**
 * Turns `site:tipranks.com/stocks/aapl/forecast` into
 * `{ query: "stocks aapl forecast", includeDomains: ["tipranks.com"] }` and
 * `AAPL earnings site:reuters.com` into
 * `{ query: "AAPL earnings", includeDomains: ["reuters.com"] }`.
 *
 * A query that is nothing but `site:operators` still leaves the path segments
 * behind as search terms, so the search stays specific instead of degrading to
 * a generic one.
 */
function normalizeSearchQuery(raw: string): NormalizedQuery {
	const domains: string[] = [];
	const pathTerms: string[] = [];

	const remainder = raw.replace(
		SITE_OPERATOR,
		(_match, lead: string, target: string) => {
			const [host = "", ...segments] = target.split("/");
			const domain = host.toLowerCase().replace(/^www\./, "");
			if (domain) domains.push(domain);
			for (const segment of segments) {
				const term = segment.replace(/[-_.]+/g, " ").trim();
				if (term) pathTerms.push(term);
			}
			// Preserve the original whitespace so "AAPL site:x.com" does not
			// collapse into "AAPLs".
			return lead;
		},
	);

	const terms = [...remainder.split(/\s+/), ...pathTerms].filter(Boolean);

	return {
		query: terms.length > 0 ? terms.join(" ") : FALLBACK_QUERY,
		includeDomains: [...new Set(domains)],
	};
}

type TavilySearchInput = Parameters<TavilySearch["_call"]>[0];
type TavilySearchOutput = Awaited<ReturnType<TavilySearch["_call"]>>;

/**
 * TavilySearch with the query rewrite applied before every request.
 *
 * The rewrite is an own property shadowing the prototype method, so the
 * original is bound first and called from inside the wrapper. _call is the
 * only place the query exists, which makes it the only seam for this.
 *
 * The configured `timeRange` is a fallback, not a ceiling: Tavily resolves
 * `this.timeRange ?? timeRange`, so a range set on the instance silently
 * overrides the one the model passes per call. The news skill tells the agent
 * to widen the window when the coverage is thin, so the window has to be the
 * model's to choose — otherwise "expand the date range" is not a thing it can
 * do.
 */
function createSearchTool(
	params: TavilySearchAPIRetrieverFields,
): TavilySearch {
	const { timeRange: fallbackTimeRange, ...searchParams } = params;
	const search = new TavilySearch({
		...searchParams,
		name: SEARCH_TOOL_NAME,
	});
	const call = search._call.bind(search);

	search._call = async (
		input: TavilySearchInput,
	): Promise<TavilySearchOutput> => {
		const { query, includeDomains, timeRange, ...rest } = input;
		const normalized = normalizeSearchQuery(query);
		// The model's own includeDomains wins over the constructor's, so the
		// domain recovered from `site:` is merged in here rather than set on
		// the instance, where the base class would ignore it.
		const domains = [
			...new Set([...(includeDomains ?? []), ...normalized.includeDomains]),
		];

		return call({
			...rest,
			query: normalized.query,
			includeDomains: domains.length > 0 ? domains : undefined,
			timeRange: timeRange ?? fallbackTimeRange,
		});
	};

	return search;
}

type TavilyExtractInput = Parameters<TavilyExtract["_call"]>[0];

const EXTRACT_FAILED =
	"EXTRACTION_FAILED: no page could be read. The URL may be paywalled, blocked by robots, or gone. Do not cite it from a search snippet — find another source, or report the figure as unverified.";

/**
 * How many read pages the shared reader keeps, and for how long.
 *
 * One run is one process, and the branches overlap within it; the window only
 * has to be longer than that overlap. Beyond it a cached page is dropped rather
 * than served stale.
 */
const EXTRACT_CACHE_MAX_ENTRIES = 64;
const EXTRACT_CACHE_TTL_MS = 30 * 60 * 1000;

/** A successfully read page, in the shape formatExtractResults renders. */
type ExtractedPage = {
	url: string;
	raw_content: string;
};

type ExtractOutcome =
	| { ok: true; page: ExtractedPage }
	| { ok: false; error: string };

/** Everything that changes what a URL returns, and so belongs in its key. */
type ExtractScope = {
	depth: string;
	query: string;
	includeImages: boolean;
};

/**
 * The same URL can come back with different content: Tavily's extract depth,
 * its rerank query and its image flag all change the result. Anything that
 * changes the page belongs in the key, or a cheap read would satisfy an
 * expensive one.
 */
function extractCacheKey(url: string, scope: ExtractScope): string {
	const images = scope.includeImages ? "images" : "text";
	return `${scope.depth}|${scope.query}|${images}|${url}`;
}

/**
 * Maps the API's answer back onto the URLs that were asked for.
 *
 * Tavily echoes the requested URL in both its results and its failures, so the
 * mapping is normally a lookup. When it rewrites the URL — a redirect, or a
 * canonicalised link — the entry is matched by position instead, so the page is
 * still attributed to the URL the agent asked for, and the cache is keyed the
 * way the agent will ask for it again.
 *
 * A batch in which every URL failed comes back as one `{ error }` rather than
 * as per-URL failures. That is still attributed to every requested URL: the
 * agent has to know each of them is unreadable, not merely that the call
 * failed.
 */
function attributeExtractions(
	fetched: unknown,
	requested: string[],
): Map<string, ExtractOutcome> {
	const outcomes = new Map<string, ExtractOutcome>();

	if (fetched && typeof fetched === "object" && "error" in fetched) {
		const error = String((fetched as { error: unknown }).error);
		for (const url of requested) outcomes.set(url, { ok: false, error });
		return outcomes;
	}

	const { results, failed_results: failures } = (fetched ?? {}) as {
		results?: { url?: string; raw_content?: string | null }[];
		failed_results?: { url?: string; error?: string }[];
	};

	const unmatchedPages: ExtractedPage[] = [];
	for (const result of results ?? []) {
		if (!result?.url) continue;
		const page = { url: result.url, raw_content: result.raw_content ?? "" };
		if (requested.includes(page.url))
			outcomes.set(page.url, { ok: true, page });
		else unmatchedPages.push(page);
	}

	const unmatchedErrors: { url: string; error: string }[] = [];
	for (const failure of failures ?? []) {
		if (!failure?.url) continue;
		const error = failure.error ?? "the page could not be read";
		if (requested.includes(failure.url)) {
			outcomes.set(failure.url, { ok: false, error });
		} else {
			unmatchedErrors.push({ url: failure.url, error });
		}
	}

	for (const url of requested) {
		if (outcomes.has(url)) continue;

		const page = unmatchedPages.shift();
		if (page) {
			// Re-keyed to the URL that was asked for: the section heading, the
			// cache key and the agent's own citation then all agree, even after
			// a redirect.
			outcomes.set(url, { ok: true, page: { ...page, url } });
			continue;
		}

		const failure = unmatchedErrors.shift();
		outcomes.set(url, {
			ok: false,
			error: failure?.error ?? "the page could not be read",
		});
	}

	return outcomes;
}

/**
 * Renders an extract response as markdown, one section per URL.
 *
 * A failed extraction is stated, never hidden: the agent has to know the page
 * could not be read, because a source it did not read is a source it must not
 * cite.
 */
function formatExtractResults(payload: unknown): string {
	if (!payload || typeof payload !== "object") return EXTRACT_FAILED;

	const { results, failed_results: failed } = payload as {
		results?: { url?: string; raw_content?: string | null }[];
		failed_results?: { url?: string; error?: string }[];
	};

	const sections: string[] = [];

	for (const result of results ?? []) {
		const url = result.url ?? "(unknown url)";
		const content = result.raw_content?.trim();
		sections.push(
			content
				? [`### ${url}`, "", content].join("\n")
				: [
						`### ${url}`,
						"",
						"EXTRACTION_EMPTY: the page was fetched but returned no readable text.",
					].join("\n"),
		);
	}

	for (const failure of failed ?? []) {
		sections.push(
			[
				`### ${failure.url ?? "(unknown url)"}`,
				"",
				`EXTRACTION_FAILED: ${failure.error ?? "the page could not be read"}.`,
			].join("\n"),
		);
	}

	return sections.length > 0 ? sections.join("\n\n") : EXTRACT_FAILED;
}

/**
 * Opens web pages and returns their text.
 *
 * Search locates a page; this reads it. The agent is expected to call it on a
 * URL before citing that URL, because the skill rules require reading the body
 * — and a rating, a filing line or a policy date quoted from a snippet is a
 * guess wearing a citation.
 *
 * Reads are cached per URL. The four branches run in parallel and overlap on
 * the same pages, and this tool instance is shared by all of them, so the
 * second branch to ask for a page gets it without a request. A partially cached
 * request fetches only the URLs it is missing, in one batch, because Tavily
 * bills per request rather than per URL.
 */
function createExtractTool(
	params: TavilyExtractAPIRetrieverFields & {
		/** A cache to share with another reader; one is created when omitted. */
		cache?: UrlCache<ExtractedPage>;
	},
): TavilyExtract {
	const { cache: providedCache, ...toolParams } = params;
	const extract = new TavilyExtract({
		...toolParams,
		name: EXTRACT_TOOL_NAME,
		description:
			"Open one or more web pages and return their full text. Use it to read a source before citing it: search finds the page, this returns the body you verify the claim against. Pass only the URLs you actually need — each one is billed and re-sent on every later model call. A URL already opened in this run is served from cache.",
	});
	const call = extract._call.bind(extract);

	const cache =
		providedCache ??
		createUrlCache<ExtractedPage>({
			maxEntries: EXTRACT_CACHE_MAX_ENTRIES,
			ttlMs: EXTRACT_CACHE_TTL_MS,
		});

	// The wrapper answers in markdown, so its return type is wider than the
	// one _call is declared with — hence the cast on the assignment rather
	// than on every value.
	extract._call = (async (input: TavilyExtractInput): Promise<string> => {
		// Tavily resolves the instance's values over the model's, so the cache
		// key has to follow the same precedence or two different reads collide.
		const scope: ExtractScope = {
			depth: extract.extractDepth ?? input.extractDepth ?? "",
			query: extract.query ?? input.query ?? "",
			includeImages: extract.includeImages ?? input.includeImages ?? false,
		};

		// The generated schema types the URL array as `unknown[]`; narrow it once
		// here rather than threading `unknown` through the cache calls.
		const requested = [...new Set(input.urls as string[])];
		if (requested.length === 0) return EXTRACT_FAILED;

		const resolved = new Map<string, ExtractOutcome>();
		const misses: string[] = [];

		for (const url of requested) {
			const cached = cache.get(extractCacheKey(url, scope));
			if (cached) resolved.set(url, { ok: true, page: cached });
			else misses.push(url);
		}

		if (misses.length > 0) {
			const fetched = await call({ ...input, urls: misses });

			for (const [url, outcome] of attributeExtractions(fetched, misses)) {
				resolved.set(url, outcome);
				// Failures are not cached: a page that failed once may be read
				// on a later try, and a cached failure would hide that.
				if (outcome.ok) cache.set(extractCacheKey(url, scope), outcome.page);
			}
		}

		const payload = {
			results: [] as ExtractedPage[],
			failed_results: [] as { url: string; error: string }[],
		};

		for (const url of requested) {
			const outcome = resolved.get(url);
			if (outcome?.ok) payload.results.push(outcome.page);
			else {
				payload.failed_results.push({
					url,
					error: outcome?.error ?? "the page could not be read",
				});
			}
		}

		return formatExtractResults(payload);
	}) as unknown as TavilyExtract["_call"];

	return extract;
}

export type { ExtractedPage };
export {
	createExtractTool,
	createSearchTool,
	EXTRACT_TOOL_NAME,
	formatExtractResults,
	normalizeSearchQuery,
	SEARCH_TOOL_NAME,
};
