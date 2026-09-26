import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { ANALYST_SYSTEM_PROMPT } from "@src/features/analyst/prompt.js";
import { analystReportSchema } from "@src/features/analyst/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createAnalystAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}) {
	return createAgent({
		model: deps.model,
		tools: [deps.search],
		systemPrompt: ANALYST_SYSTEM_PROMPT,
		responseFormat: toolStrategy(analystReportSchema),
	});
}

export { createAnalystAgent };
