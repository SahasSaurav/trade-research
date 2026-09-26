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

	// The recency ladder in graph.ts is 1 / 0.75 / 0.4 / 0 at 7 / 30 / 90 days.
	// Each band is a place the weights could silently drift, so pin all four.
	//
	// Ages sit just inside each band rather than exactly on the boundary:
	// daysAgo() and the merge node each call Date.now() separately, so a source
	// placed at exactly 90.0 days can measure as 90.0000001 and drop a band.
	const RECENCY_LADDER = [
		{ days: 3, recencyWeight: 1, label: "a 3-day-old" },
		{ days: 20, recencyWeight: 0.75, label: "a 20-day-old" },
		{ days: 60, recencyWeight: 0.4, label: "a 60-day-old" },
		{ days: 200, recencyWeight: 0, label: "a 200-day-old" },
	];

	for (const { days, recencyWeight, label } of RECENCY_LADDER) {
		it(`weights ${label} source at ${recencyWeight}`, async () => {
			const result = await merge(
				{
					...goodNews,
					sentimentSources: [
						// The +1 anchor is fresh, so totalWeight is 1 + w.
						source({ sentiment: "positive", date: daysAgo(0) }),
						source({ sentiment: "negative", date: daysAgo(days) }),
					],
				},
				goodGeopolitical,
			);

			// Both high evidence, so (1 - w) / (1 + w).
			const expected = Number(
				((1 - recencyWeight) / (1 + recencyWeight)).toFixed(2),
			);
			expect(result.sentimentScore).toBe(expected);
		});
	}

	// The overall label uses +/-0.15 bands on the raw score, independently of
	// the score itself. Evidence strength picks the weights (high 1, medium
	// 0.65, low 0.35), so pairing one positive with one negative source of
	// differing strength lands on a spread of reachable scores. The +/-0.15
	// boundary itself is not reachable from this weight table, so it is not
	// pinned here.
	it.each([
		{ pos: "high", neg: "low", score: 0.48, label: "positive" },
		{ pos: "medium", neg: "low", score: 0.3, label: "positive" },
		{ pos: "high", neg: "medium", score: 0.21, label: "positive" },
		{ pos: "medium", neg: "medium", score: 0, label: "neutral" },
		{ pos: "low", neg: "medium", score: -0.3, label: "negative" },
		{ pos: "low", neg: "high", score: -0.48, label: "negative" },
	] as Array<{
		pos: "high" | "medium" | "low";
		neg: "high" | "medium" | "low";
		score: number;
		label: string;
	}>)(
		"scores $pos vs $neg as $score, labelled $label",
		async ({ pos, neg, score, label }) => {
			const result = await merge(
				{
					...goodNews,
					sentimentSources: [
						source({ sentiment: "positive", evidenceStrength: pos }),
						source({ sentiment: "negative", evidenceStrength: neg }),
					],
				},
				goodGeopolitical,
			);

			expect(result.sentimentScore).toBe(score);
			expect(result.overallSentiment).toBe(label);
		},
	);

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

	it("defaults notes to null when neither subagent has any", async () => {
		const sentiment = await merge(
			{ ...goodNews, notes: "" },
			{ ...goodGeopolitical, notes: "" },
		);

		expect(sentiment.notes).toBeNull();
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
