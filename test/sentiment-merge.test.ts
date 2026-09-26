import type { NewsSentimentResearch } from "@src/features/sentiment/subagents/news-sentiment/schema.js";
import { createSentimentGraph } from "@src/features/sentiment/workflow/graph.js";
import type { ReactAgent } from "langchain";
import { afterEach, describe, expect, it, vi } from "vitest";

type SentimentSources = NewsSentimentResearch["sentimentSources"];

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 86_400_000).toISOString();
}

function source(overrides: Partial<SentimentSources[number]> = {}) {
	return {
		source: "Reuters",
		sentiment: "positive" as const,
		evidenceStrength: "high" as const,
		date: daysAgo(1),
		summary: "s",
		sourceUrl: "https://example.com/a",
		...overrides,
	};
}

/** An agent stub that returns a fixed structuredResponse. */
function agentReturning(response: unknown): ReactAgent {
	return {
		invoke: async () => ({ structuredResponse: response }),
	} as unknown as ReactAgent;
}

function agentThatFails(error: unknown): ReactAgent {
	return {
		invoke: async () => {
			throw error;
		},
	} as unknown as ReactAgent;
}

/**
 * LangGraph's return value is the final state spread alongside the input, so
 * `sentiment` sits at the top level. Read defensively: a wrong assumption
 * here would surface as `undefined to be 1` rather than a useful message.
 */
async function merge(news: unknown, geopolitical: unknown) {
	const graph = createSentimentGraph(
		agentReturning(news),
		agentReturning(geopolitical),
	);
	const result = await graph.invoke({ ticker: "AAPL" });
	return (result as { sentiment: Record<string, unknown> }).sentiment;
}

afterEach(() => {
	vi.useRealTimers();
});

const goodNews = {
	ticker: "AAPL",
	sentimentSources: [source()],
	sourceUrls: ["https://example.com/news"],
	notes: "n",
};

const goodGeopolitical = {
	ticker: "AAPL",
	geopoliticalRisks: [],
	geopoliticalSummary: "No material risks.",
	sourceUrls: ["https://example.com/geo"],
	notes: "g",
};

describe("sentiment merge", () => {
	it("scores a single positive high-evidence source near 1", async () => {
		const sentiment = await merge(goodNews, goodGeopolitical);

		expect(sentiment.sentimentScore).toBe(1);
		expect(sentiment.overallSentiment).toBe("positive");
	});

	it("averages opposing sources toward neutral", async () => {
		const sentiment = await merge(
			{
				...goodNews,
				sentimentSources: [
					source({ sentiment: "positive" }),
					source({ sentiment: "negative" }),
				],
			},
			goodGeopolitical,
		);

		expect(sentiment.sentimentScore).toBe(0);
		expect(sentiment.overallSentiment).toBe("neutral");
	});

	it("weights evidence strength, so a low-confidence source moves the score less", async () => {
		const result = await merge(
			{
				...goodNews,
				sentimentSources: [
					source({ sentiment: "positive", evidenceStrength: "high" }),
					source({ sentiment: "negative", evidenceStrength: "low" }),
				],
			},
			goodGeopolitical,
		);

		// weights 1 and 0.35 -> (1 - 0.35) / 1.35 = 0.4815 -> 0.48
		expect(result.sentimentScore).toBe(0.48);
	});

	it("decays the weight of older sources", async () => {
		const result = await merge(
			{
				...goodNews,
				sentimentSources: [
					source({ sentiment: "positive", date: daysAgo(1) }),
					source({ sentiment: "negative", date: daysAgo(200) }),
				],
			},
			goodGeopolitical,
		);

		// The 200-day source has recency weight 0, so it contributes
		// nothing at all and the score stays at the recent source's +1.
		expect(result.sentimentScore).toBe(1);
	});

	it("returns a null score and 'unknown' when there are no sources", async () => {
		const sentiment = await merge(
			{ ...goodNews, sentimentSources: [] },
			goodGeopolitical,
		);

		expect(sentiment.sentimentScore).toBeNull();
		expect(sentiment.overallSentiment).toBe("unknown");
	});

	it("treats an unparseable source date as weakly weighted, not as fresh", async () => {
		const result = await merge(
			{
				...goodNews,
				sentimentSources: [
					source({ sentiment: "positive" }),
					source({ sentiment: "negative", date: "not a date" }),
				],
			},
			goodGeopolitical,
		);

		// The bad date gets the 0.25 fallback, so the negative source counts
		// for something. Treated as weight 0 the answer would be 1; as
		// weight 1 it would be 0.
		expect(result.sentimentScore).toBe(0.6);
	});

	it("merges and dedupes sourceUrls from both subagents", async () => {
		const sentiment = await merge(
			{
				...goodNews,
				sourceUrls: ["https://example.com/shared", "https://example.com/news"],
			},
			{
				...goodGeopolitical,
				sourceUrls: ["https://example.com/shared", "https://example.com/geo"],
			},
		);

		expect([...(sentiment.sourceUrls as string[])].sort()).toEqual([
			"https://example.com/geo",
			"https://example.com/news",
			"https://example.com/shared",
		]);
	});

	it("concatenates notes from both subagents", async () => {
		const sentiment = await merge(
			{ ...goodNews, notes: "news note" },
			{ ...goodGeopolitical, notes: "geo note" },
		);

		expect(sentiment.notes).toContain("news note");
		expect(sentiment.notes).toContain("geo note");
	});

	describe("partial failure", () => {
		it("still produces sentiment when geopolitical research fails", async () => {
			// This is the point of runResearch: one subagent dying must not
			// discard the other half's work.
			const graph = createSentimentGraph(
				agentReturning(goodNews),
				agentThatFails(
					Object.assign(new Error("quota exceeded"), { status: 429 }),
				),
			);

			const result = (await graph.invoke({ ticker: "AAPL" })) as {
				sentiment: {
					overallSentiment: string;
					researchStatus: { news: string; geopolitical: string };
					researchErrors: string[];
					geopoliticalSummary: string;
					sentimentSources: unknown[];
				};
			};

			expect(result.sentiment.overallSentiment).toBe("positive");
			expect(result.sentiment.sentimentSources).toHaveLength(1);
			expect(result.sentiment.researchStatus).toEqual({
				news: "complete",
				geopolitical: "failed",
			});
			expect(result.sentiment.researchErrors[0]).toMatch(/quota/i);
			expect(result.sentiment.geopoliticalSummary).toMatch(/failed/i);
		});

		it("still produces sentiment when news research fails", async () => {
			const graph = createSentimentGraph(
				agentThatFails(new Error("network down")),
				agentReturning(goodGeopolitical),
			);

			const result = (await graph.invoke({ ticker: "AAPL" })) as {
				sentiment: {
					sentimentScore: number | null;
					overallSentiment: string;
					researchStatus: { news: string; geopolitical: string };
					geopoliticalSummary: string;
				};
			};

			expect(result.sentiment.sentimentScore).toBeNull();
			expect(result.sentiment.overallSentiment).toBe("unknown");
			expect(result.sentiment.researchStatus).toEqual({
				news: "failed",
				geopolitical: "complete",
			});
			// Geopolitical research succeeded, so its summary is used rather
			// than the failure placeholder.
			expect(result.sentiment.geopoliticalSummary).toBe("No material risks.");
		});

		it("records both failures and stays 'unknown' when both subagents fail", async () => {
			const graph = createSentimentGraph(
				agentThatFails(Object.assign(new Error("news down"), { status: 500 })),
				agentThatFails(Object.assign(new Error("geo down"), { status: 500 })),
			);

			const result = (await graph.invoke({ ticker: "AAPL" })) as {
				sentiment: {
					overallSentiment: string;
					researchStatus: { news: string; geopolitical: string };
					researchErrors: string[];
					sourceUrls: string[];
				};
			};

			expect(result.sentiment.overallSentiment).toBe("unknown");
			expect(result.sentiment.researchStatus).toEqual({
				news: "failed",
				geopolitical: "failed",
			});
			expect(result.sentiment.researchErrors).toHaveLength(2);
			expect(result.sentiment.sourceUrls).toEqual([]);
		});
	});
});
