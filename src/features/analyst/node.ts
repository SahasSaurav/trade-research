import { ANALYST_USER_MESSAGE } from "@src/features/analyst/prompt.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

function createAnalystNode(agent: ReactAgent) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: ANALYST_USER_MESSAGE(state.ticker),
				},
			],
		});
		return {
			analyst: result.structuredResponse,
		};
	};
}

export { createAnalystNode };
