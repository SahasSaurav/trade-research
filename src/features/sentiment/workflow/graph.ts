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
			const sentimentScore = sources.length
				? Number(
						(
							sources.reduce(
								(total, source) => total + sentimentValues[source.sentiment],
								0,
							) / sources.length
						).toFixed(2),
					)
				: 0;
			const overallSentiment =
				sentimentScore > 0.15
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
