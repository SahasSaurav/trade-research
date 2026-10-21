import { SENTIMENT_USER_MESSAGE } from "@src/features/sentiment/prompt.js";
import { runResearch } from "@src/features/sentiment/research.js";
import type {
	SentimentData,
	SentimentResearchData,
} from "@src/features/sentiment/schema.js";
import { sentimentResearchSchema } from "@src/features/sentiment/schema.js";
import { scoreSentimentSources } from "@src/features/sentiment/score.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

/** A total failure of the orchestrator: an empty artifact, marked failed. */
function failedSentiment(ticker: string): SentimentData {
	return {
		ticker,
		dateChecked: new Date().toISOString().slice(0, 10),
		overallSentiment: "unknown",
		sentimentScore: null,
		sentimentConfidence: "low",
		newsSentimentSources: [],
		newsSentimentSummary: null,
		geopoliticalRisks: [],
		geopoliticalSummary: null,
		sourceUrls: [],
		researchStatus: { news: "failed", geopolitical: "failed" },
	};
}

/** Every cited URL, from both the news sources and the geopolitical events. */
function sourceUrlsOf(research: SentimentResearchData): string[] {
	return [
		...new Set([
			...research.newsSentimentSources.map((source) => source.sourceUrl),
			...research.geopoliticalRisks.map((event) => event.sourceUrl),
		]),
	];
}

/**
 * Whether the artifact carries anything the debate can use.
 *
 * An orchestrator that lost both subagents still returns a valid, empty
 * artifact: the schema passes, validation passes, and the debate then argues
 * with no sentiment evidence at all — indistinguishable from a genuinely quiet
 * ticker. That is a silent failure, so it is the one case worth a second
 * orchestrator run. Partial research is a designed outcome, and must not buy
 * one.
 */
function hasUsableResearch(research: SentimentResearchData): boolean {
	return (
		research.researchStatus.news === "complete" ||
		research.researchStatus.geopolitical === "complete"
	);
}

function createSentimentNode(
	agent: ReactAgent<AgentTypeConfig<SentimentResearchData>>,
	researchAttempts?: number,
) {
	return async (state: GraphState) => {
		const outcome = await runResearch(
			async () =>
				(
					await agent.invoke({
						messages: [
							{
								role: "user",
								content: SENTIMENT_USER_MESSAGE(state.ticker),
							},
						],
					})
				).structuredResponse,
			sentimentResearchSchema,
			researchAttempts,
			hasUsableResearch,
		);

		if (outcome.error !== null) {
			console.error(`sentiment research failed: ${outcome.error}`);
			return { sentiment: failedSentiment(state.ticker) };
		}

		const research = outcome.data;

		// Log one source at a time so a long sentiment run shows the evidence it
		// collected as it is merged, not just as one opaque blob at the end.
		for (const source of research.newsSentimentSources) {
			console.log(
				`sentiment source: ${source.source} — ${source.sentiment} (${source.confidence}) ${source.date}`,
			);
		}

		// The model collects the evidence; the node stamps the identity, the
		// date, the score and the consolidated URLs so none can be invented.
		return {
			sentiment: {
				...research,
				ticker: state.ticker,
				dateChecked: new Date().toISOString().slice(0, 10),
				...scoreSentimentSources(research.newsSentimentSources),
				sourceUrls: sourceUrlsOf(research),
			},
		};
	};
}

export { createSentimentNode };
