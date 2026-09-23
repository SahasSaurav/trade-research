import type { GraphState } from "@src/workflows/state.js";
import { createSentimentGraph } from "@src/features/sentiment/graph.js";
import type { ReactAgent } from "langchain";

function createSentimentNode(
	newsAgent: ReactAgent,
	geopoliticalAgent: ReactAgent,
) {
	const graph = createSentimentGraph(newsAgent, geopoliticalAgent);
	return async (state: GraphState) => {
		const result = await graph.invoke({ ticker: state.ticker });
		return { sentiment: result.sentiment };
	};
}

export { createSentimentNode };
