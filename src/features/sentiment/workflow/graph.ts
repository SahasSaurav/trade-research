import { END, START, StateGraph } from "@langchain/langgraph";
import { createGeopoliticalNode } from "@src/features/sentiment/subagents/geopolitical/node.js";
import type { GeopoliticalResearch } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import { createNewsSentimentNode } from "@src/features/sentiment/subagents/news/node.js";
import type { NewsSentimentResearch } from "@src/features/sentiment/subagents/news/schema.js";
import { SentimentResearchState } from "@src/features/sentiment/workflow/state.js";
import type { SentimentResearchStateType } from "@src/features/sentiment/workflow/state.js";
import type { ReactAgent } from "langchain";

function createSentimentGraph(
	newsAgent: ReactAgent,
	geopoliticalAgent: ReactAgent,
) {
	const graph = new StateGraph(SentimentResearchState)
		.addNode("newsSentimentSubagent", createNewsSentimentNode(newsAgent))
		.addNode("geopoliticalSubagent", createGeopoliticalNode(geopoliticalAgent))
		.addNode("mergeSentimentResearch", (state: SentimentResearchStateType) => {
			const news: NewsSentimentResearch | undefined = state.newsResearch;
			const geopolitical: GeopoliticalResearch | undefined =
				state.geopoliticalResearch;
			const sources = news?.sentimentSources ?? [];
			const sentimentValues = { positive: 1, neutral: 0, negative: -1 };
			const evidenceWeights = { high: 1, medium: 0.65, low: 0.35 };
			const weightedSentiment = sources.reduce(
				(total, source) => {
					const publishedAt = Date.parse(source.date);
					const ageDays = Number.isNaN(publishedAt)
						? null
						: Math.max(0, (Date.now() - publishedAt) / 86_400_000);
					const recencyWeight =
						ageDays === null
							? 0.25
							: ageDays <= 7
								? 1
								: ageDays <= 30
									? 0.75
									: ageDays <= 90
										? 0.4
										: 0;
					const weight =
						evidenceWeights[source.evidenceStrength] * recencyWeight;
					return {
						weightedScore:
							total.weightedScore + sentimentValues[source.sentiment] * weight,
						totalWeight: total.totalWeight + weight,
					};
				},
				{ weightedScore: 0, totalWeight: 0 },
			);
			const sentimentScore =
				weightedSentiment.totalWeight > 0
					? Number(
							(
								weightedSentiment.weightedScore / weightedSentiment.totalWeight
							).toFixed(2),
						)
					: null;
			const overallSentiment =
				sentimentScore === null
					? "unknown"
					: sentimentScore > 0.15
						? "positive"
						: sentimentScore < -0.15
							? "negative"
							: "neutral";
			const notes = [news?.notes, geopolitical?.notes]
				.filter((note): note is string => Boolean(note))
				.join(" ");

			return {
				sentiment: {
					ticker: state.ticker,
					overallSentiment,
					sentimentScore,
					sentimentSources: sources,
					geopoliticalRisks: geopolitical?.geopoliticalRisks ?? [],
					geopoliticalSummary:
						geopolitical?.geopoliticalSummary ??
						"No verified geopolitical summary was returned.",
					dateChecked: new Date().toISOString().slice(0, 10),
					sourceUrls: [
						...new Set([
							...(news?.sourceUrls ?? []),
							...(geopolitical?.sourceUrls ?? []),
						]),
					],
					notes: notes || null,
				},
			};
		})
		.addEdge(START, "newsSentimentSubagent")
		.addEdge(START, "geopoliticalSubagent")
		.addEdge(
			["newsSentimentSubagent", "geopoliticalSubagent"],
			"mergeSentimentResearch",
		)
		.addEdge("mergeSentimentResearch", END);

	return graph.compile();
}

export { createSentimentGraph };
