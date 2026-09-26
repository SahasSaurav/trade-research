import type { TavilySearch } from "@langchain/tavily";
import {
	checkTickerShape,
	normalizeTicker,
	validateTicker,
} from "@src/features/ticker/validate.js";
import { describe, expect, it, vi } from "vitest";

function fakeSearch(response: unknown) {
	return {
		invoke: vi.fn().mockResolvedValue(response),
	} as unknown as TavilySearch;
}

describe("ticker validation", () => {
	it("normalizes and accepts common US ticker shapes", () => {
		expect(normalizeTicker("  brk.b ")).toBe("BRK.B");
		expect(checkTickerShape("BRK.B")).toEqual({ ok: true, ticker: "BRK.B" });
	});

	it("rejects empty and malformed symbols before searching", async () => {
		expect(checkTickerShape(" ").ok).toBe(false);
		expect(checkTickerShape("AAPL! ").ok).toBe(false);
		const search = fakeSearch({ results: [] });
		await expect(validateTicker("AA PL", search)).resolves.toMatchObject({
			ok: false,
			reason: "malformed",
		});
		expect(search.invoke).not.toHaveBeenCalled();
	});

	it("confirms an exact symbol from an exchange or SEC result", async () => {
		const search = fakeSearch({
			results: [
				{
					title: "Apple Inc. (AAPL) Stock Quote & News",
					url: "https://www.nasdaq.com/market-activity/stocks/aapl",
					content: "Apple Inc. common stock Nasdaq symbol AAPL",
				},
			],
		});

		await expect(validateTicker("aapl", search)).resolves.toEqual({
			ok: true,
			ticker: "AAPL",
			name: "Apple Inc. (AAPL) Stock Quote & News",
			sourceUrl: "https://www.nasdaq.com/market-activity/stocks/aapl",
		});
		expect(search.invoke).toHaveBeenCalledWith(
			expect.objectContaining({ query: expect.stringContaining("AAPL") }),
		);
	});

	it("rejects an unconfirmed symbol", async () => {
		const search = fakeSearch({
			results: [
				{
					title: "Apple news",
					url: "https://www.nasdaq.com/market-activity/stocks/aapl",
					content: "Apple shares rose today",
				},
			],
		});

		await expect(validateTicker("ZZZZ", search)).resolves.toMatchObject({
			ok: false,
			reason: "not_found",
		});
	});

	it("returns a lookup failure when Tavily errors", async () => {
		const search = fakeSearch(Promise.reject(new Error("offline")));
		await expect(validateTicker("AAPL", search)).resolves.toMatchObject({
			ok: false,
			reason: "lookup_failed",
		});
	});
});
