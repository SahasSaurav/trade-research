import { SUMMARY_USER_MESSAGE } from "@src/features/summary/prompt.js";
import type { SummaryData } from "@src/features/summary/schema.js";
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
						state.valuation,
						state.analyst,
						state.sentiment,
						state.decision,
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
