import { FINANCIALS_USER_MESSAGE } from "@src/features/financials/prompt.js";
import type { FinancialsData } from "@src/features/financials/schema.js";
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
