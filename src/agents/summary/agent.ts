import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SUMMARY_SYSTEM_PROMPT } from "@src/agents/summary/prompt.js";
import { summarySchema } from "@src/agents/summary/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createSummaryAgent(deps: { model: BaseChatModel }) {
	return createAgent({
		model: deps.model,
		tools: [],
		systemPrompt: SUMMARY_SYSTEM_PROMPT,
		responseFormat: toolStrategy(summarySchema),
	});
}

export { createSummaryAgent };
