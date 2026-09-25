import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import { NEWS_SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/news-sentiment/prompt.js";
import { newsJsonSchema } from "@src/features/sentiment/subagents/news-sentiment/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createNewsSentimentAgent(deps: {
	model: BaseChatModel;
	search: StructuredTool;
}) {
	return createAgent({
		model: deps.model,
		tools: [deps.search],
		systemPrompt: NEWS_SENTIMENT_SYSTEM_PROMPT,
		responseFormat: toolStrategy(newsJsonSchema),
	});
}

export { createNewsSentimentAgent };
