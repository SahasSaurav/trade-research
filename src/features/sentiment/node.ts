import { createSentimentGraph } from "@src/features/sentiment/workflow/graph.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

function createSentimentNode(
	newsAgent: ReactAgent,
	geopoliticalAgent: ReactAgent,
	researchAttempts?: number,
) {
	const graph = createSentimentGraph(
		newsAgent,
		geopoliticalAgent,
		researchAttempts,
	);
	return async (state: GraphState) => {
		const result = await graph.invoke({ ticker: state.ticker });
		return { sentiment: result.sentiment };
	};
}

export { createSentimentNode };
