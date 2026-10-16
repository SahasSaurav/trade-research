import { createSentimentNode } from "@src/features/sentiment/node.js";
import type { SentimentData } from "@src/features/sentiment/schema.js";
import { scoreSentimentSources } from "@src/features/sentiment/score.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";
import { describe, expect, it } from "vitest";

type SentimentSources = SentimentData["sentimentSources"];

const TODAY = new Date().toISOString().slice(0, 10);

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
		...overrides,
	};
}

function sentiment(overrides: Partial<SentimentData> = {}): SentimentData {
	return {
		ticker: "AAPL",
		overallSentiment: "neutral",
		sentimentScore: 0,
		sentimentSources: [],
		geopoliticalRisks: [],
		geopoliticalSummary: null,
		researchStatus: { news: "complete", geopolitical: "complete" },
		researchErrors: [],
		dateChecked: TODAY,
		sourceUrls: [],
		notes: null,
		...overrides,
	};
}

function agentReturning(response: unknown): ReactAgent {
	return {
		invoke: async () => ({ structuredResponse: response }),
	} as unknown as ReactAgent;
}

function state(ticker = "AAPL"): GraphState {
	return { ticker } as GraphState;
}

describe("scoreSentimentSources", () => {
	it("scores a single positive high-evidence source near 1", () => {
		const result = scoreSentimentSources([source()]);

		expect(result.sentimentScore).toBe(1);
		expect(result.overallSentiment).toBe("positive");
	});

	it("averages opposing sources toward neutral", () => {
		const result = scoreSentimentSources([
			source({ sentiment: "positive" }),
			source({ sentiment: "negative" }),
		]);

		expect(result.sentimentScore).toBe(0);
		expect(result.overallSentiment).toBe("neutral");
	});

	it("weights evidence strength, so a low-confidence source moves the score less", () => {
		const result = scoreSentimentSources([
			source({ sentiment: "positive", evidenceStrength: "high" }),
			source({ sentiment: "negative", evidenceStrength: "low" }),
		]);

		// weights 1 and 0.35 -> (1 - 0.35) / 1.35 = 0.4815 -> 0.48
		expect(result.sentimentScore).toBe(0.48);
	});

	it("decays the weight of older sources", () => {
		const result = scoreSentimentSources([
			source({ sentiment: "positive", date: daysAgo(1) }),
			source({ sentiment: "negative", date: daysAgo(200) }),
		]);

		// The 200-day source has recency weight 0, so it contributes
		// nothing at all and the score stays at the recent source's +1.
		expect(result.sentimentScore).toBe(1);
	});

	// The recency ladder is 1 / 0.75 / 0.4 / 0 at 7 / 30 / 90 days. Each band
	// is a place the weights could silently drift, so pin all four. Ages sit
	// just inside each band because daysAgo() and the scorer call Date.now()
	// separately, so an age of exactly 90.0 can measure as 90.0000001.
	const RECENCY_LADDER = [
		{ days: 3, recencyWeight: 1, label: "a 3-day-old" },
		{ days: 20, recencyWeight: 0.75, label: "a 20-day-old" },
		{ days: 60, recencyWeight: 0.4, label: "a 60-day-old" },
		{ days: 200, recencyWeight: 0, label: "a 200-day-old" },
	];

	for (const { days, recencyWeight, label } of RECENCY_LADDER) {
		it(`weights ${label} source at ${recencyWeight}`, () => {
			const result = scoreSentimentSources([
				// The +1 anchor is fresh, so totalWeight is 1 + w.
				source({ sentiment: "positive", date: daysAgo(0) }),
				source({ sentiment: "negative", date: daysAgo(days) }),
			]);

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
		({ pos, neg, score, label }) => {
			const result = scoreSentimentSources([
				source({ sentiment: "positive", evidenceStrength: pos }),
				source({ sentiment: "negative", evidenceStrength: neg }),
			]);

			expect(result.sentimentScore).toBe(score);
			expect(result.overallSentiment).toBe(label);
		},
	);

	it("returns a null score and 'unknown' when there are no sources", () => {
		const result = scoreSentimentSources([]);

		expect(result.sentimentScore).toBeNull();
		expect(result.overallSentiment).toBe("unknown");
	});

	it("treats an unparseable source date as weakly weighted, not as fresh", () => {
		const result = scoreSentimentSources([
			source({ sentiment: "positive" }),
			source({ sentiment: "negative", date: "not a date" }),
		]);

		// The bad date gets the 0.25 fallback, so the negative source counts
		// for something. Treated as weight 0 the answer would be 1; as
		// weight 1 it would be 0.
		expect(result.sentimentScore).toBe(0.6);
	});
});

describe("sentiment node", () => {
	it("recomputes the score from the sources, ignoring the model's number", async () => {
		const node = createSentimentNode(
			agentReturning(
				sentiment({
					sentimentSources: [source({ sentiment: "positive" })],
					sentimentScore: -0.9,
					overallSentiment: "negative",
				}),
			),
		);

		const update = await node(state());

		expect(update.sentiment?.sentimentScore).toBe(1);
		expect(update.sentiment?.overallSentiment).toBe("positive");
	});

	it("dedupes the source URLs the orchestrator returns", async () => {
		const node = createSentimentNode(
			agentReturning(
				sentiment({
					sourceUrls: [
						"https://example.com/a",
						"https://example.com/a",
						"https://example.com/b",
					],
				}),
			),
		);

		const update = await node(state());

		expect(update.sentiment?.sourceUrls).toEqual([
			"https://example.com/a",
			"https://example.com/b",
		]);
	});

	it("returns a failed sentiment when the orchestrator errors", async () => {
		const agent = {
			invoke: async () => {
				// A 400 is a provider error but not transient, so runResearch
				// reports it without retrying.
				throw Object.assign(new Error("boom"), { status: 400 });
			},
		} as unknown as ReactAgent;
		const node = createSentimentNode(agent);

		const update = await node(state());

		expect(update.sentiment?.overallSentiment).toBe("unknown");
		expect(update.sentiment?.sentimentScore).toBeNull();
		expect(update.sentiment?.researchStatus).toEqual({
			news: "failed",
			geopolitical: "failed",
		});
		expect(update.sentiment?.researchErrors?.[0]).toMatch(/boom/);
	});
});
