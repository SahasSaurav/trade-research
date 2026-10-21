import { createSentimentNode } from "@src/features/sentiment/node.js";
import type {
	SentimentData,
	SentimentResearchData,
} from "@src/features/sentiment/schema.js";
import { scoreSentimentSources } from "@src/features/sentiment/score.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";
import { describe, expect, it } from "vitest";

type NewsSources = SentimentData["newsSentimentSources"];
type GeopoliticalEvent = SentimentData["geopoliticalRisks"][number];

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 86_400_000).toISOString();
}

function source(overrides: Partial<NewsSources[number]> = {}) {
	return {
		source: "Reuters",
		sentiment: "positive" as const,
		confidence: "high" as const,
		date: daysAgo(1),
		summary: "s",
		sourceUrl: "https://example.com/news",
		...overrides,
	};
}

function event(overrides: Partial<GeopoliticalEvent> = {}) {
	return {
		event: "tariff",
		affectedRegion: "US",
		eventDate: TODAY,
		sourceUrl: "https://example.com/geo",
		publisher: "Reuters",
		publicationDate: TODAY,
		companyConnection: "suppliers" as const,
		impact: "negative" as const,
		timeHorizon: "short_term" as const,
		confidence: "medium" as const,
		confidenceEvidence: "e",
		status: "confirmed" as const,
		...overrides,
	};
}

function research(
	overrides: Partial<SentimentResearchData> = {},
): SentimentResearchData {
	return {
		newsSentimentSources: [],
		newsSentimentSummary: null,
		geopoliticalRisks: [],
		geopoliticalSummary: null,
		researchStatus: { news: "complete", geopolitical: "complete" },
		...overrides,
	};
}

function agentReturning(response: unknown): ReactAgent<AgentTypeConfig<never>> {
	return {
		invoke: async () => ({ structuredResponse: response }),
	} as unknown as ReactAgent<AgentTypeConfig<never>>;
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

	it("reads a balanced fight as mixed, not neutral", () => {
		// The score is the same 0 either way, but the band has to say which
		// finding it is: two loud sides cancelling, or a quiet tape.
		const result = scoreSentimentSources([
			source({ sentiment: "positive" }),
			source({ sentiment: "negative" }),
		]);

		expect(result.sentimentScore).toBe(0);
		expect(result.overallSentiment).toBe("mixed");
	});

	it("keeps neutral for sources that are genuinely quiet", () => {
		const result = scoreSentimentSources([
			source({ sentiment: "neutral" }),
			source({ sentiment: "neutral" }),
		]);

		expect(result.sentimentScore).toBe(0);
		expect(result.overallSentiment).toBe("neutral");
	});

	it("weights evidence strength, so a low-confidence source moves the score less", () => {
		const result = scoreSentimentSources([
			source({ sentiment: "positive", confidence: "high" }),
			source({ sentiment: "negative", confidence: "low" }),
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
	// differing strength lands on a spread of reachable scores. A tie inside
	// the band where both sides still carry weight reads as "mixed". The
	// +/-0.15 boundary itself is not reachable from this weight table, so it is
	// not pinned here.
	it.each([
		{ pos: "high", neg: "low", score: 0.48, label: "positive" },
		{ pos: "medium", neg: "low", score: 0.3, label: "positive" },
		{ pos: "high", neg: "medium", score: 0.21, label: "positive" },
		{ pos: "medium", neg: "medium", score: 0, label: "mixed" },
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
				source({ sentiment: "positive", confidence: pos }),
				source({ sentiment: "negative", confidence: neg }),
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

	it("labels confidence from the weight of the evidence", () => {
		// Two fresh high-confidence sources reach "high", one reaches
		// "medium", and a single weak source stays "low".
		expect(
			scoreSentimentSources([
				source({ sentiment: "positive" }),
				source({ sentiment: "positive" }),
			]).sentimentConfidence,
		).toBe("high");
		expect(scoreSentimentSources([source()]).sentimentConfidence).toBe(
			"medium",
		);
		expect(
			scoreSentimentSources([source({ confidence: "low" })])
				.sentimentConfidence,
		).toBe("low");
	});

	it("treats a stale-only read as low confidence, not confident", () => {
		// A 200-day-old source decays to weight 0, so there is nothing to be
		// confident about: the band is unknown and the confidence is low.
		const result = scoreSentimentSources([source({ date: daysAgo(200) })]);

		expect(result.overallSentiment).toBe("unknown");
		expect(result.sentimentConfidence).toBe("low");
	});
});

describe("sentiment node", () => {
	it("stamps the ticker and date and recomputes the score from the sources", async () => {
		const node = createSentimentNode(
			agentReturning(
				research({
					newsSentimentSources: [source({ sentiment: "positive" })],
				}),
			),
		);

		const update = await node(state());

		expect(update.sentiment?.ticker).toBe("AAPL");
		expect(update.sentiment?.dateChecked).toBe(TODAY);
		expect(update.sentiment?.sentimentScore).toBe(1);
		expect(update.sentiment?.overallSentiment).toBe("positive");
		expect(update.sentiment?.sentimentConfidence).toBe("medium");
	});

	it("derives the source URLs from the news sources and geopolitical events", async () => {
		const node = createSentimentNode(
			agentReturning(
				research({
					newsSentimentSources: [
						source({ sourceUrl: "https://example.com/a" }),
						source({ sourceUrl: "https://example.com/a" }),
						source({ sourceUrl: "https://example.com/b" }),
					],
					geopoliticalRisks: [
						event({ sourceUrl: "https://example.com/b" }),
						event({ sourceUrl: "https://example.com/c" }),
					],
				}),
			),
		);

		const update = await node(state());

		expect(update.sentiment?.sourceUrls).toEqual([
			"https://example.com/a",
			"https://example.com/b",
			"https://example.com/c",
		]);
	});

	it("re-runs the orchestrator once when both subagents failed", async () => {
		let calls = 0;
		const agent = {
			invoke: async () => {
				calls += 1;
				return {
					structuredResponse:
						calls === 1
							? research({
									researchStatus: { news: "failed", geopolitical: "failed" },
								})
							: research({ newsSentimentSources: [source()] }),
				};
			},
		} as unknown as ReactAgent<AgentTypeConfig<SentimentResearchData>>;

		const update = await createSentimentNode(agent)(state());

		// Both branches failing is a silent failure otherwise: the artifact is
		// valid, so the debate would run with no sentiment evidence at all.
		expect(calls).toBe(2);
		expect(update.sentiment?.overallSentiment).toBe("positive");
	});

	it("accepts partial research without a second run", async () => {
		let calls = 0;
		const agent = {
			invoke: async () => {
				calls += 1;
				return {
					structuredResponse: research({
						newsSentimentSources: [source()],
						researchStatus: { news: "complete", geopolitical: "failed" },
					}),
				};
			},
		} as unknown as ReactAgent<AgentTypeConfig<SentimentResearchData>>;

		await createSentimentNode(agent)(state());

		// One failed branch is a designed outcome, not a reason to pay for
		// another orchestrator run.
		expect(calls).toBe(1);
	});

	it("accepts an empty artifact when the second run is empty too", async () => {
		const empty = research({
			researchStatus: { news: "failed", geopolitical: "failed" },
		});
		let calls = 0;
		const agent = {
			invoke: async () => {
				calls += 1;
				return { structuredResponse: empty };
			},
		} as unknown as ReactAgent<AgentTypeConfig<SentimentResearchData>>;

		const update = await createSentimentNode(agent)(state());

		// Exactly one extra attempt, then the branch degrades rather than
		// looping: a ticker with no news looks identical to one whose search
		// failed, so a third attempt would not be better informed.
		expect(calls).toBe(2);
		expect(update.sentiment?.overallSentiment).toBe("unknown");
		expect(update.sentiment?.researchStatus).toEqual({
			news: "failed",
			geopolitical: "failed",
		});
	});

	it("returns a failed sentiment when the orchestrator errors", async () => {
		const agent = {
			invoke: async () => {
				// A 400 is a provider error but not transient, so runResearch
				// reports it without retrying.
				throw Object.assign(new Error("boom"), { status: 400 });
			},
		} as unknown as ReactAgent<AgentTypeConfig<SentimentResearchData>>;
		const node = createSentimentNode(agent);

		const update = await node(state());

		expect(update.sentiment?.overallSentiment).toBe("unknown");
		expect(update.sentiment?.sentimentScore).toBeNull();
		expect(update.sentiment?.sentimentConfidence).toBe("low");
		expect(update.sentiment?.researchStatus).toEqual({
			news: "failed",
			geopolitical: "failed",
		});
	});
});
