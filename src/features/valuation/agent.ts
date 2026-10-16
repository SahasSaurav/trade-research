import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { VALUATION_SYSTEM_PROMPT } from "@src/features/valuation/prompt.js";
import { valuationSchema } from "@src/features/valuation/schema.js";
import { computeValuationMultiples } from "@src/features/valuation/tool.js";
import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
} from "@src/workflows/agent-guard.js";
import { createDeepAgent } from "deepagents";
import { toolStrategy } from "langchain";

function createValuationAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}) {
	return createDeepAgent({
		model: deps.model,
		tools: [deps.search, computeValuationMultiples],
		systemPrompt: VALUATION_SYSTEM_PROMPT,
		responseFormat: toolStrategy(valuationSchema),
		middleware: agentGuardMiddleware(),
	}).withConfig(AGENT_GUARD_CONFIG);
}

export { createValuationAgent };
