import {
	TavilyExtractAPIWrapper,
	TavilySearchAPIWrapper,
} from "@langchain/tavily";
import {
	createExtractTool,
	createSearchTool,
	normalizeSearchQuery,
} from "@src/agents/search/tool.js";
import { describe, expect, it } from "vitest";

/**
 * The Tavily API answers a query built purely from `site:` operators with a
 * 400. TavilySearch turns that 400 into an `{ error }` tool result rather than
 * throwing, so the model reads the failure as data and re-issues another
 * site-only query until the model-call budget runs out. These tests pin the
 * rewrite that stops the loop from starting.
 */

describe("normalizeSearchQuery", () => {
	it("splits a site-only query into search terms plus a domain filter", () => {
		// The exact query Gemini emitted during the failing run.
		expect(
			normalizeSearchQuery("site:tipranks.com/stocks/aapl/forecast"),
		).toEqual({
			query: "stocks aapl forecast",
			includeDomains: ["tipranks.com"],
		});
	});

	it("keeps the model's own terms and moves only the operator across", () => {
		expect(normalizeSearchQuery("AAPL earnings site:reuters.com")).toEqual({
			query: "AAPL earnings",
			includeDomains: ["reuters.com"],
		});
	});

	it("never returns an empty query", () => {
		// Tavily rejects an empty query too, so a bare site: has to become
		// something searchable rather than "".
		for (const query of ["site:reuters.com", "site:www.sec.gov", "site:"]) {
			const result = normalizeSearchQuery(query);
			expect(result.query.length, query).toBeGreaterThan(0);
		}
	});

	it("strips a www prefix so the domain filter matches Tavily's format", () => {
		expect(normalizeSearchQuery("site:www.reuters.com markets")).toEqual({
			query: "markets",
			includeDomains: ["reuters.com"],
		});
	});

	it("de-duplicates repeated domains and preserves token spacing", () => {
		expect(
			normalizeSearchQuery("site:reuters.com site:reuters.com AAPL"),
		).toEqual({ query: "AAPL", includeDomains: ["reuters.com"] });
	});

	it("leaves an ordinary query untouched", () => {
		// The happy path must not be rewritten, or every search would gain a
		// spurious domain filter.
		expect(normalizeSearchQuery("AAPL stock price today")).toEqual({
			query: "AAPL stock price today",
			includeDomains: [],
		});
	});

	it("does not treat a word merely starting with 'site' as an operator", () => {
		expect(normalizeSearchQuery("sitewalk holdings")).toEqual({
			query: "sitewalk holdings",
			includeDomains: [],
		});
	});
});

/**
 * These tests assert what reaches Tavily rather than what the function returns.
 * The fake is injected through TavilySearch's own `apiWrapper` seam, so the
 * real _call runs and only the HTTP boundary is replaced.
 */
describe("search request", () => {
	type RawResultsArgs = Record<string, unknown>;

	/**
	 * Subclasses the real wrapper because convertCamelToSnakeCase is
	 * protected, so only a subclass satisfies TavilySearchAPIWrapper.
	 */
	class FakeWrapper extends TavilySearchAPIWrapper {
		readonly calls: RawResultsArgs[] = [];

		constructor() {
			super({ tavilyApiKey: "k" });
		}

		override async rawResults(params: never) {
			const args = params as unknown as RawResultsArgs;
			this.calls.push(args);
			return {
				query: String(args.query),
				response_time: 0.01,
				results: [
					{
						title: "t",
						url: "https://example.com",
						content: "c",
						score: 0.9,
						raw_content: null,
					},
				],
			};
		}
	}

	it("sends a recovered site: domain as a domain filter", async () => {
		const apiWrapper = new FakeWrapper();
		const search = createSearchTool({ tavilyApiKey: "k", apiWrapper });

		await search.invoke({ query: "AMZN analyst rating site:tipranks.com" });

		// The whole point of the rewrite: a site: operator that reaches Tavily
		// verbatim is what earns the 400 and starts the retry loop.
		expect(apiWrapper.calls[0]).toMatchObject({
			query: "AMZN analyst rating",
			includeDomains: ["tipranks.com"],
		});
		expect(String(apiWrapper.calls[0].query)).not.toContain("site:");
	});

	it("keeps the path segments of a site-only query as search terms", async () => {
		const apiWrapper = new FakeWrapper();
		const search = createSearchTool({ tavilyApiKey: "k", apiWrapper });

		// A bare site: is the case that used to kill the whole run, so it has
		// to degrade to something specific rather than to an empty query.
		await search.invoke({ query: "site:tipranks.com/stocks/aapl/forecast" });

		expect(apiWrapper.calls[0]).toMatchObject({
			query: "stocks aapl forecast",
			includeDomains: ["tipranks.com"],
		});
	});

	it("forwards the search sizing to Tavily", async () => {
		const apiWrapper = new FakeWrapper();
		const search = createSearchTool({
			tavilyApiKey: "k",
			apiWrapper,
			maxResults: 5,
			chunksPerSource: 1,
			searchDepth: "advanced",
		});

		await search.invoke({ query: "AMZN price" });

		expect(apiWrapper.calls[0]).toMatchObject({
			maxResults: 5,
			chunksPerSource: 1,
			searchDepth: "advanced",
		});
	});
});

/**
 * The page reader is shared by all four research branches, and they overlap on
 * the same sources. These tests pin the caching that makes the second read free
 * — and, just as important, that a failure is never cached as if it were a
 * page.
 */
describe("open_url request", () => {
	type ExtractArgs = { urls: string[] };

	/**
	 * Subclasses the real wrapper because its helpers are protected, and
	 * because the real _call then runs: only the HTTP boundary is replaced.
	 * A URL containing "blocked" comes back as a per-URL failure.
	 */
	class FakeExtractWrapper extends TavilyExtractAPIWrapper {
		readonly calls: ExtractArgs[] = [];

		constructor() {
			super({ tavilyApiKey: "k" });
		}

		override async rawResults(params: never) {
			const { urls } = params as unknown as ExtractArgs;
			this.calls.push({ urls });

			return {
				results: urls
					.filter((url) => !url.includes("blocked"))
					.map((url) => ({ url, raw_content: `body of ${url}`, images: [] })),
				failed_results: urls
					.filter((url) => url.includes("blocked"))
					.map((url) => ({ url, error: "paywalled" })),
				response_time: 0.01,
			};
		}
	}

	const ALPHA = "https://example.com/alpha";
	const BETA = "https://example.com/beta";
	const GAMMA = "https://example.com/gamma";
	const BLOCKED = "https://example.com/blocked";

	it("serves a page it has already read without asking again", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		await extract.invoke({ urls: [ALPHA] });
		const second = await extract.invoke({ urls: [ALPHA] });

		expect(apiWrapper.calls).toHaveLength(1);
		expect(second).toContain(`body of ${ALPHA}`);
	});

	it("fetches only the URLs a partially cached request is missing", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		await extract.invoke({ urls: [ALPHA, BETA] });
		const second = await extract.invoke({ urls: [ALPHA, GAMMA] });

		// One batched request for the miss, not one per URL: Tavily bills per
		// request, so splitting would cost more than the cache saves.
		expect(apiWrapper.calls[1].urls).toEqual([GAMMA]);
		expect(second).toContain(`body of ${ALPHA}`);
		expect(second).toContain(`body of ${GAMMA}`);
	});

	it("treats a different extract depth as a different page", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		await extract.invoke({ urls: [ALPHA] });
		await extract.invoke({ urls: [ALPHA], extractDepth: "advanced" });

		// The depth changes the content, so a cached basic read must not
		// satisfy an advanced one.
		expect(apiWrapper.calls).toHaveLength(2);
	});

	it("keeps the requested URL order when part of the request is cached", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		await extract.invoke({ urls: [BETA] });
		const output = await extract.invoke({ urls: [ALPHA, BETA] });

		expect(output.indexOf(ALPHA)).toBeLessThan(output.indexOf(BETA));
	});

	it("reads a repeated URL once", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		await extract.invoke({ urls: [ALPHA, ALPHA] });

		expect(apiWrapper.calls[0].urls).toEqual([ALPHA]);
	});

	it("reports a per-URL failure and does not cache it", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		const first = await extract.invoke({ urls: [BLOCKED] });
		await extract.invoke({ urls: [BLOCKED] });

		expect(first).toContain("EXTRACTION_FAILED");
		// The whole batch failed, so Tavily answered with one error rather
		// than per-URL failures; the sentinel still has to be actionable.
		expect(first).toContain(BLOCKED);
		// A failure is a "not now", not a "never": the next call tries again.
		expect(apiWrapper.calls).toHaveLength(2);
	});

	it("serves a cached page even when the rest of the request fails", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		await extract.invoke({ urls: [ALPHA] });
		const output = await extract.invoke({ urls: [ALPHA, BLOCKED] });

		expect(apiWrapper.calls[1].urls).toEqual([BLOCKED]);
		expect(output).toContain(`body of ${ALPHA}`);
		expect(output).toContain("EXTRACTION_FAILED");
	});

	it("returns the failure sentinel for an empty URL list", async () => {
		const apiWrapper = new FakeExtractWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		const output = await extract.invoke({ urls: [] });

		expect(output).toContain("EXTRACTION_FAILED");
		expect(apiWrapper.calls).toHaveLength(0);
	});

	it("attributes a rewritten URL to the one that was requested", async () => {
		// A redirect makes Tavily answer with the final URL. The page still
		// belongs to the URL the agent asked for — and to the cache key it
		// will ask with next time.
		class RewritingWrapper extends FakeExtractWrapper {
			override async rawResults(params: never) {
				const { urls } = params as unknown as ExtractArgs;
				this.calls.push({ urls });
				return {
					results: urls.map((url) => ({
						url: "https://example.com/canonical",
						raw_content: `body of ${url}`,
						images: [],
					})),
					failed_results: [],
					response_time: 0.01,
				};
			}
		}

		const apiWrapper = new RewritingWrapper();
		const extract = createExtractTool({ tavilyApiKey: "k", apiWrapper });

		const output = await extract.invoke({ urls: [ALPHA] });
		await extract.invoke({ urls: [ALPHA] });

		expect(output).toContain(`### ${ALPHA}`);
		expect(output).toContain(`body of ${ALPHA}`);
		expect(apiWrapper.calls).toHaveLength(1);
	});

	/**
	 * Every tool result is re-sent on each later turn, so a page longer than the
	 * window is handed over in slices. These tests pin the two things that make
	 * paging cheap: the cut is local (one fetch covers every slice) and the
	 * common case of a page that fits is unchanged.
	 */
	describe("paging a long page", () => {
		const LONG = "https://example.com/10-k";
		// Distinct thirds, so a slice can be told from the text it left behind.
		const BODY = `${"a".repeat(12_000)}${"b".repeat(12_000)}${"c".repeat(6_000)}`;

		class LongPageWrapper extends FakeExtractWrapper {
			override async rawResults(params: never) {
				const { urls } = params as unknown as ExtractArgs;
				this.calls.push({ urls });
				return {
					results: urls.map((url) => ({
						url,
						raw_content: BODY,
						images: [],
					})),
					failed_results: [],
					response_time: 0.01,
				};
			}
		}

		function reader() {
			const apiWrapper = new LongPageWrapper();
			return {
				apiWrapper,
				extract: createExtractTool({ tavilyApiKey: "k", apiWrapper }),
			};
		}

		it("returns one window and names the offset that continues it", async () => {
			const { extract } = reader();

			const output = await extract.invoke({ urls: [LONG] });

			expect(output).toContain("characters 0-12000 of 30000");
			expect(output).toContain("offset 12000");
			expect(output).toContain("a".repeat(100));
			expect(output).not.toContain("b".repeat(100));
		});

		it("reads the next window from the cached page, not from Tavily", async () => {
			const { apiWrapper, extract } = reader();

			await extract.invoke({ urls: [LONG] });
			const second = await extract.invoke({ urls: [LONG], offset: 12_000 });

			// The offset must survive schema parsing or the second call would
			// silently return the first window again.
			expect(second).toContain("characters 12000-24000 of 30000");
			expect(second).toContain("b".repeat(100));
			expect(apiWrapper.calls).toHaveLength(1);
		});

		it("returns a page that fits the window exactly as before", async () => {
			const extract = createExtractTool({
				tavilyApiKey: "k",
				apiWrapper: new FakeExtractWrapper(),
			});

			const output = await extract.invoke({ urls: [ALPHA] });

			// No range line: the paging affordance only appears where it is
			// needed, so an ordinary read costs nothing extra.
			expect(output).toBe(`### ${ALPHA}\n\nbody of ${ALPHA}`);
		});

		it("absorbs a short remainder rather than forcing another call", async () => {
			class TailWrapper extends FakeExtractWrapper {
				override async rawResults(params: never) {
					const { urls } = params as unknown as ExtractArgs;
					this.calls.push({ urls });
					return {
						results: urls.map((url) => ({
							url,
							// 12k window plus a 1k tail: no second call is worth it.
							raw_content: `${"a".repeat(12_000)}${"z".repeat(1_000)}`,
							images: [],
						})),
						failed_results: [],
						response_time: 0.01,
					};
				}
			}

			const extract = createExtractTool({
				tavilyApiKey: "k",
				apiWrapper: new TailWrapper(),
			});

			const output = await extract.invoke({ urls: [LONG] });

			expect(output).toContain("z".repeat(1_000));
			expect(output).not.toContain("offset");
		});

		it("says so when the offset is past the end of the page", async () => {
			const { extract } = reader();

			const output = await extract.invoke({ urls: [LONG], offset: 99_999 });

			// Silence here would look like an empty page; the agent has to know
			// it over-read, not that the source went blank.
			expect(output).toContain("past the end of this page");
			expect(output).toContain("30000 characters");
		});
	});
});
