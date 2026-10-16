import { VALUATION_USER_MESSAGE } from "@src/features/valuation/prompt.js";
import type { ValuationData } from "@src/features/valuation/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

function createValuationNode(
	agent: ReactAgent<AgentTypeConfig<ValuationData>>,
) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: VALUATION_USER_MESSAGE(state.ticker),
				},
			],
		});
		return {
			valuation: result.structuredResponse,
		};
	};
}

export { createValuationNode };
