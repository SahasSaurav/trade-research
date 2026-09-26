import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { NEWS_SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/news-sentiment/prompt.js";
import { newsSentimentResearchSchema } from "@src/features/sentiment/subagents/news-sentiment/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createNewsSentimentAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}) {
	return createAgent({
		model: deps.model,
		tools: [deps.search],
		systemPrompt: NEWS_SENTIMENT_SYSTEM_PROMPT,
		responseFormat: toolStrategy(newsSentimentResearchSchema),
	});
}

export { createNewsSentimentAgent };
