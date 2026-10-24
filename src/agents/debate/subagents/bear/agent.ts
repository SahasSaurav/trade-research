import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
	BEAR_SUBAGENT_DESCRIPTION,
	BEAR_SYSTEM_PROMPT,
} from "@src/agents/debate/subagents/bear/prompt.js";
import { bearCaseSchema } from "@src/agents/debate/subagents/bear/schema.js";
import type { CompiledSubAgent } from "deepagents";
import { createAgent, toolStrategy } from "langchain";

/**
 * Bear subagent, complete with its own identity, prompt and schema, ready to
 * hand to the orchestrator's `subagents` list. Built as a compiled runnable
 * (not a declarative spec) to keep the structured `responseFormat`, which a
 * declarative spec does not support. It has no tools: it argues over the
 * dossier the orchestrator passes in the task, plus the bull's returned case.
 */
function createBearSubagent(deps: { model: BaseChatModel }): CompiledSubAgent {
	return {
		name: "bear",
		description: BEAR_SUBAGENT_DESCRIPTION,
		runnable: createAgent({
			model: deps.model,
			tools: [],
			systemPrompt: BEAR_SYSTEM_PROMPT,
			responseFormat: toolStrategy(bearCaseSchema),
		}),
	};
}

export { createBearSubagent };
