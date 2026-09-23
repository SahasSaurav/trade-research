import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import { GEOPOLITICAL_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import { geopoliticalResearchSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createGeopoliticalAgent(model: BaseChatModel, search: StructuredTool) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: GEOPOLITICAL_SYSTEM_PROMPT,
		responseFormat: toolStrategy(geopoliticalResearchSchema),
	});
}

export { createGeopoliticalAgent };
