import { NEWS_SENTIMENT_USER_MESSAGE } from "@src/features/sentiment/subagents/news-sentiment/prompt.js";
import { newsSentimentResearchSchema } from "@src/features/sentiment/subagents/news-sentiment/schema.js";
import { runResearch } from "@src/features/sentiment/workflow/research.js";
import type { SentimentResearchStateType } from "@src/features/sentiment/workflow/state.js";
import type { ReactAgent } from "langchain";

function createNewsSentimentNode(agent: ReactAgent, researchAttempts?: number) {
	return async (state: SentimentResearchStateType) => {
		const outcome = await runResearch(
			async () =>
				(
					await agent.invoke({
						messages: [
							{
								role: "user",
								content: NEWS_SENTIMENT_USER_MESSAGE(state.ticker),
							},
						],
					})
				).structuredResponse,
			newsSentimentResearchSchema,
			researchAttempts,
		);
		return outcome.error
			? { newsResearch: undefined, newsError: outcome.error }
			: { newsResearch: outcome.data, newsError: undefined };
	};
}

export { createNewsSentimentNode };
