import { SENTIMENT_USER_MESSAGE } from "@src/features/sentiment/prompt.js";
import { runResearch } from "@src/features/sentiment/research.js";
import type { SentimentData } from "@src/features/sentiment/schema.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { scoreSentimentSources } from "@src/features/sentiment/score.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

/** A total failure of the orchestrator, with no per-branch detail to keep. */
function failedSentiment(ticker: string, error: string): SentimentData {
	return {
		ticker,
		overallSentiment: "unknown",
		sentimentScore: null,
		sentimentSources: [],
		geopoliticalRisks: [],
		geopoliticalSummary: "Sentiment research failed.",
		researchStatus: { news: "failed", geopolitical: "failed" },
		researchErrors: [error],
		dateChecked: new Date().toISOString().slice(0, 10),
		sourceUrls: [],
		notes: null,
	};
}

function createSentimentNode(agent: ReactAgent, researchAttempts?: number) {
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
			sentimentSchema,
			researchAttempts,
		);

		if (outcome.error !== null) {
			return { sentiment: failedSentiment(state.ticker, outcome.error) };
		}

		// The model picks the sources; the score is recomputed here so identical
		// sources always score identically regardless of what the model emitted.
		return {
			sentiment: {
				...outcome.data,
				...scoreSentimentSources(outcome.data.sentimentSources),
				sourceUrls: [...new Set(outcome.data.sourceUrls)],
			},
		};
	};
}

export { createSentimentNode };
