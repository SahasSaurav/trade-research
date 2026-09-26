import { normalizeSearchQuery } from "@src/features/search/tool.js";
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
