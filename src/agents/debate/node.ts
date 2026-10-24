import { researchBlock } from "@src/agents/debate/context.js";
import { DEBATE_USER_MESSAGE } from "@src/agents/debate/prompt.js";
import type { DebateData } from "@src/agents/debate/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

function createDebateNode(agent: ReactAgent<AgentTypeConfig<DebateData>>) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: DEBATE_USER_MESSAGE(state.ticker, researchBlock(state)),
				},
			],
		});
		return {
			debate: result.structuredResponse,
		};
	};
}

export { createDebateNode };
