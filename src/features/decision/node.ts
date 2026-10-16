import { DECISION_USER_MESSAGE } from "@src/features/decision/prompt.js";
import type { DecisionData } from "@src/features/decision/schema.js";
import type { AgentRunnable } from "@src/workflows/agent.js";
import type { GraphState } from "@src/workflows/state.js";

function createDecisionNode(agent: AgentRunnable<DecisionData>) {
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
