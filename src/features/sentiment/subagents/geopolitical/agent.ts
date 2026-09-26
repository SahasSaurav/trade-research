import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { GEOPOLITICAL_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import { geopoliticalResearchSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
} from "@src/workflows/agent-guard.js";
import { createAgent, toolStrategy } from "langchain";

function createGeopoliticalAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}) {
	return createAgent({
		model: deps.model,
		tools: [deps.search],
		systemPrompt: GEOPOLITICAL_SYSTEM_PROMPT,
		responseFormat: toolStrategy(geopoliticalResearchSchema),
		middleware: agentGuardMiddleware(),
	}).withConfig(AGENT_GUARD_CONFIG);
}

export { createGeopoliticalAgent };
