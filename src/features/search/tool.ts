import type { TavilySearchAPIRetrieverFields } from "@langchain/tavily";
import { TavilySearch } from "@langchain/tavily";

/**
 * Tavily answers a query made up entirely of `site:` operators with a 400:
 * "Query cannot consist only of site: operators."
 *
 * `TavilySearch._call` swallows that failure and hands the model an
 * `{ error }` object as a normal tool result, so the model treats it as data,
 * re-issues another site-only query, gets another error, and the
 * model/tools cycle repeats. Each cycle costs two supersteps, so the agent's
 * own Pregel loop eventually trips LangGraph's default recursion limit of 25
 * and the whole workflow dies with GraphRecursionError instead of degrading to
 * insufficient_data.
 *
 * Rewriting the operator into Tavily's own include_domains parameter keeps the
 * model's intent (that domain, those terms) and gives the API something it
 * accepts, so the loop never starts.
 */
const SITE_OPERATOR = /(^|\s)site:(\S+)/gi;
const FALLBACK_QUERY = "stock market analysis";
const DEFAULT_SEARCH_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_SEARCH_CACHE_MAX_ENTRIES = 100;

/**
 * Cache sizing, kept out of TavilySearchAPIRetrieverFields because these are
 * properties of this wrapper rather than of the Tavily API, and passing them
 * through to super() would send unknown keys in the request body.
 */
type SearchCacheOptions = {
	ttlMs?: number;
	maxEntries?: number;
};

type NormalizedTavilySearchParams = TavilySearchAPIRetrieverFields &
	SearchCacheOptions;

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
 */
class NormalizedTavilySearch extends TavilySearch {
	private readonly cache = new Map<
		string,
		{ expiresAt: number; response: Promise<TavilySearchOutput> }
	>();
	private readonly cacheTtlMs: number;
	private readonly cacheMaxEntries: number;

	constructor(params: NormalizedTavilySearchParams) {
		const { ttlMs, maxEntries, ...tavilyParams } = params;
		super(tavilyParams);
		this.cacheTtlMs = ttlMs ?? DEFAULT_SEARCH_CACHE_TTL_MS;
		this.cacheMaxEntries = maxEntries ?? DEFAULT_SEARCH_CACHE_MAX_ENTRIES;
	}

	async _call(input: TavilySearchInput): Promise<TavilySearchOutput> {
		const { query, includeDomains, ...rest } = input;
		const normalized = normalizeSearchQuery(query);
		// The model's own includeDomains wins over the constructor's, so the
		// domain recovered from `site:` is merged in here rather than set on
		// the instance, where the base class would ignore it.
		const domains = [
			...new Set([...(includeDomains ?? []), ...normalized.includeDomains]),
		];

		const normalizedInput = {
			...rest,
			query: normalized.query,
			includeDomains: domains.length > 0 ? domains : undefined,
		};
		const key = JSON.stringify(normalizedInput);
		const cached = this.cache.get(key);
		if (cached && cached.expiresAt > Date.now()) return cached.response;
		if (cached) this.cache.delete(key);

		const response = super._call(normalizedInput);
		this.cache.set(key, {
			expiresAt: Date.now() + this.cacheTtlMs,
			response,
		});
		while (this.cache.size > this.cacheMaxEntries) {
			const oldest = this.cache.keys().next().value;
			if (oldest === undefined) break;
			this.cache.delete(oldest);
		}

		try {
			const result = await response;
			if ("error" in result) this.cache.delete(key);
			return result;
		} catch (error) {
			this.cache.delete(key);
			throw error;
		}
	}
}

function createSearchTool(params: NormalizedTavilySearchParams): TavilySearch {
	return new NormalizedTavilySearch(params);
}

export type { SearchCacheOptions };
export { createSearchTool, normalizeSearchQuery };
