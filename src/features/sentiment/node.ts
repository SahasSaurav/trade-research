import { SENTIMENT_USER_MESSAGE } from "@src/features/sentiment/prompt.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

function createSentimentNode(agent: ReactAgent) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: SENTIMENT_USER_MESSAGE(state.ticker),
				},
			],
		});

		return {
			sentiment: result.structuredResponse,
		};
	};
}

export { createSentimentNode };
