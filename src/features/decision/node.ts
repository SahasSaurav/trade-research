import { DECISION_USER_MESSAGE } from "@src/features/decision/prompt.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

function createDecisionNode(agent: ReactAgent) {
	return async (state: GraphState) => {
		const context = {
			ticker: state.ticker,
			valuation: state.valuation,
			analyst: state.analyst,
			sentiment: state.sentiment,
		};

		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: DECISION_USER_MESSAGE(
						state.ticker,
						JSON.stringify(context, null, 2),
					),
				},
			],
		});

		return {
			decision: result.structuredResponse,
			workflowStatus: "complete",
		};
	};
}

export { createDecisionNode };
