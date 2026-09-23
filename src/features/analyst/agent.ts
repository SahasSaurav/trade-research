import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { ANALYST_SYSTEM_PROMPT } from "@src/features/analyst/prompt.js";
import { createAgent } from "langchain";

function createAnalystAgent(model: BaseChatModel, search: TavilySearch) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: ANALYST_SYSTEM_PROMPT + "\n\nAlways respond with valid JSON only.",
	});
}

export { createAnalystAgent };
