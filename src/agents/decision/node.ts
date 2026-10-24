import { DECISION_USER_MESSAGE } from "@src/agents/decision/prompt.js";
import type { DecisionData } from "@src/agents/decision/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

function createDecisionNode(agent: ReactAgent<AgentTypeConfig<DecisionData>>) {
	return async (state: GraphState) => {
		const context = {
			ticker: state.ticker,
			financials: state.financials,
			analyst: state.analyst,
			sentiment: state.sentiment,
			market: state.market,
			// The debate is evidence, not a vote: the arguments are weighed on
			// the data, and the decision still owns the call and the levels.
			debate: state.debate,
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
