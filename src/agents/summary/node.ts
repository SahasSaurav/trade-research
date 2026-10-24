import { SUMMARY_USER_MESSAGE } from "@src/agents/summary/prompt.js";
import type { SummaryData } from "@src/agents/summary/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

function createSummaryNode(agent: ReactAgent<AgentTypeConfig<SummaryData>>) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: SUMMARY_USER_MESSAGE(
						state.ticker,
						state.financials,
						state.analyst,
						state.sentiment,
						state.decision,
						state.market,
					),
				},
			],
		});
		return {
			summary: result.structuredResponse,
		};
	};
}

export { createSummaryNode };
