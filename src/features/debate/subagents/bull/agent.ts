import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
	BULL_SUBAGENT_DESCRIPTION,
	BULL_SYSTEM_PROMPT,
} from "@src/features/debate/subagents/bull/prompt.js";
import { bullCaseSchema } from "@src/features/debate/subagents/bull/schema.js";
import type { CompiledSubAgent } from "deepagents";
import { createAgent, toolStrategy } from "langchain";

/**
 * Bull subagent, complete with its own identity, prompt and schema, ready to
 * hand to the orchestrator's `subagents` list. Built as a compiled runnable
 * (not a declarative spec) to keep the structured `responseFormat`, which a
 * declarative spec does not support. It has no tools: it argues over the
 * dossier the orchestrator passes in the task.
 */
function createBullSubagent(deps: { model: BaseChatModel }): CompiledSubAgent {
	return {
		name: "bull",
		description: BULL_SUBAGENT_DESCRIPTION,
		runnable: createAgent({
			model: deps.model,
			tools: [],
			systemPrompt: BULL_SYSTEM_PROMPT,
			responseFormat: toolStrategy(bullCaseSchema),
		}),
	};
}

export { createBullSubagent };
