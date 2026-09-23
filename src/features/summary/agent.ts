import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SUMMARY_SYSTEM_PROMPT } from "@src/features/summary/prompt.js";
import { summarySchema } from "@src/features/summary/schema.js";
import { createAgent } from "langchain";

function createSummaryAgent(model: BaseChatModel) {
	// Don't use responseFormat for Gemini - it has schema validation issues
	// Instead, let the model respond naturally and parse JSON from text
	return createAgent({
		model,
		systemPrompt: SUMMARY_SYSTEM_PROMPT + "\n\nAlways respond with valid JSON only.",
	});
}

export { createSummaryAgent };
