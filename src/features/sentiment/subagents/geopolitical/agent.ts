import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import {
	GEOPOLITICAL_SUBAGENT_DESCRIPTION,
	GEOPOLITICAL_SYSTEM_PROMPT,
} from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import { geopoliticalResearchSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
} from "@src/workflows/agent-guard.js";
import type { CompiledSubAgent } from "deepagents";
import { createAgent, toolStrategy } from "langchain";

/**
 * Geopolitical subagent, complete with its own identity, prompt, schema and
 * guard middleware, ready to hand to the orchestrator's `subagents` list. Built
 * as a compiled runnable (not a declarative spec) so it does not inherit
 * deepagents' default filesystem and summarization middleware.
 */
function createGeopoliticalSubagent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}): CompiledSubAgent {
	return {
		name: "geopolitical",
		description: GEOPOLITICAL_SUBAGENT_DESCRIPTION,
		runnable: createAgent({
			model: deps.model,
			tools: [deps.search],
			systemPrompt: GEOPOLITICAL_SYSTEM_PROMPT,
			responseFormat: toolStrategy(geopoliticalResearchSchema),
			middleware: agentGuardMiddleware(),
		}).withConfig(AGENT_GUARD_CONFIG),
	};
}

export { createGeopoliticalSubagent };
