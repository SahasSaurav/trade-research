import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { VALUATION_SYSTEM_PROMPT } from "@src/features/valuation/prompt.js";
import { valuationSchema } from "@src/features/valuation/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createValuationAgent(model: BaseChatModel, search: TavilySearch) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: VALUATION_SYSTEM_PROMPT,
		responseFormat: toolStrategy(valuationSchema),
	});
}

export { createValuationAgent };
