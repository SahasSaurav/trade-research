import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/prompt.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createSentimentAgent(model: BaseChatModel) {
	return createAgent({
		model,
		tools: [],
		systemPrompt: SENTIMENT_SYSTEM_PROMPT,
		responseFormat: toolStrategy(sentimentSchema),
	});
}

export { createSentimentAgent };
