import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/prompt.js";
import { createAgent } from "langchain";

function createSentimentAgent(model: BaseChatModel) {
	return createAgent({
		model,
		tools: [],
		systemPrompt: SENTIMENT_SYSTEM_PROMPT + "\n\nAlways respond with valid JSON only.",
	});
}

export { createSentimentAgent };
