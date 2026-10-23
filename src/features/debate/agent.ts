import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { DEBATE_SYSTEM_PROMPT } from "@src/features/debate/prompt.js";
import { debateSchema } from "@src/features/debate/schema.js";
import { createBearSubagent } from "@src/features/debate/subagents/bear/agent.js";
import { createBullSubagent } from "@src/features/debate/subagents/bull/agent.js";
import { createDeepAgent } from "deepagents";
import { toolStrategy } from "langchain";

/**
 * One orchestrator over two native subagents. Each subagent owns its identity,
 * prompt and schema, so the orchestrator only dispatches them and returns the
 * two cases. It deliberately has no tools and no skill: arguing is the
 * subagents' job, and the graph still owns this stage's place in the run.
 */
function createDebateAgent(deps: { model: BaseChatModel }) {
	return createDeepAgent({
		model: deps.model,
		systemPrompt: DEBATE_SYSTEM_PROMPT,
		responseFormat: toolStrategy(debateSchema),
		subagents: [createBullSubagent(deps), createBearSubagent(deps)],
	});
}

export { createDebateAgent };
