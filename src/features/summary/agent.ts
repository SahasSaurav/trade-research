import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SUMMARY_SYSTEM_PROMPT } from "@src/features/summary/prompt.js";
import { summarySchema } from "@src/features/summary/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createSummaryAgent(model: BaseChatModel) {
	return createAgent({
		model,
		systemPrompt: SUMMARY_SYSTEM_PROMPT,
		responseFormat: toolStrategy(summarySchema),
	});
}

export { createSummaryAgent };
