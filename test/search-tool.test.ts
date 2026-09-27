import { TavilySearchAPIWrapper } from "@langchain/tavily";
import {
	createSearchTool,
	normalizeSearchQuery,
} from "@src/features/search/tool.js";
import { describe, expect, it } from "vitest";

/**
 * The Tavily API answers a query built purely from `site:` operators with a
 * 400. TavilySearch turns that 400 into an `{ error }` tool result rather than
 * throwing, so the model reads the failure as data and re-issues another
 * site-only query. Each retry costs two supersteps in the agent's own Pregel
 * loop, so the run used to end in GraphRecursionError rather than a report.
 * These tests pin the rewrite that stops the loop from starting.
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
 * The rewrite is the only reason this subclass exists, so these tests assert
 * what reaches Tavily rather than what the function returns.
 *
 * The fake is injected through TavilySearch's own `apiWrapper` seam, so the
 * real _call runs. Only the HTTP boundary is replaced.
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
