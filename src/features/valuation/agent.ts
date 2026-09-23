import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { VALUATION_SYSTEM_PROMPT } from "@src/features/valuation/prompt.js";
import { createAgent } from "langchain";

function createValuationAgent(model: BaseChatModel, search: TavilySearch) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: VALUATION_SYSTEM_PROMPT + "\n\nAlways respond with valid JSON only.",
	});
}

export { createValuationAgent };
