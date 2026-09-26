import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SUMMARY_SYSTEM_PROMPT } from "@src/features/summary/prompt.js";
import { summarySchema } from "@src/features/summary/schema.js";
import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
} from "@src/workflows/agent-guard.js";
import { createAgent, toolStrategy } from "langchain";

function createSummaryAgent(deps: { model: BaseChatModel }) {
	return createAgent({
		model: deps.model,
		tools: [],
		systemPrompt: SUMMARY_SYSTEM_PROMPT,
		responseFormat: toolStrategy(summarySchema),
		middleware: agentGuardMiddleware(),
	}).withConfig(AGENT_GUARD_CONFIG);
}

export { createSummaryAgent };
