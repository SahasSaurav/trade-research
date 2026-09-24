import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import { NEWS_SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/news/prompt.js";
import { newsJsonSchema } from "@src/features/sentiment/subagents/news/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createNewsSentimentAgent(
	model: BaseChatModel,
	search: StructuredTool,
) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: NEWS_SENTIMENT_SYSTEM_PROMPT,
		responseFormat: toolStrategy(newsJsonSchema),
	});
}

export { createNewsSentimentAgent };
