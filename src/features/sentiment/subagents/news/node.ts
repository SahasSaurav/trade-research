import { NEWS_SENTIMENT_USER_MESSAGE } from "@src/features/sentiment/subagents/news/prompt.js";
import type { SentimentResearchStateType } from "@src/features/sentiment/workflow/state.js";
import type { ReactAgent } from "langchain";

function createNewsSentimentNode(agent: ReactAgent) {
	return async (state: SentimentResearchStateType) => {
		const result = await agent.invoke({
			messages: [
				{ role: "user", content: NEWS_SENTIMENT_USER_MESSAGE(state.ticker) },
			],
		});
		return { newsResearch: result.structuredResponse };
	};
}

export { createNewsSentimentNode };
