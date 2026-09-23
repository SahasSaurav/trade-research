import { SENTIMENT_USER_MESSAGE } from "@src/features/sentiment/prompt.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
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

		// Handle response from both structured (Google) and raw (Ollama) models
		// For structured output: result.structuredResponse
		// For raw text: we need to extract the content from the response
		const responseContent = (result as any).structuredResponse || (result as any).content;

		return {
			sentiment: sentimentSchema.parse(responseContent),
		};
	};
}

export { createSentimentNode };
