import { FINANCIALS_USER_MESSAGE } from "@src/agents/financials/prompt.js";
import type { FinancialsData } from "@src/agents/financials/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

function createFinancialsNode(
	agent: ReactAgent<AgentTypeConfig<FinancialsData>>,
) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: FINANCIALS_USER_MESSAGE(state.ticker),
				},
			],
		});
		return {
			financials: result.structuredResponse,
		};
	};
}

export { createFinancialsNode };
