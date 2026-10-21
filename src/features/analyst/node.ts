import {
	ANALYST_REPAIR_USER_MESSAGE,
	ANALYST_USER_MESSAGE,
} from "@src/features/analyst/prompt.js";
import type { AnalystReportData } from "@src/features/analyst/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

function createAnalystNode(
	agent: ReactAgent<AgentTypeConfig<AnalystReportData>>,
) {
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

function createAnalystRepairNode(
	agent: ReactAgent<AgentTypeConfig<AnalystReportData>>,
) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: ANALYST_REPAIR_USER_MESSAGE(
						state.ticker,
						state.validation?.analystIssues ?? [],
					),
				},
			],
		});
		return {
			analyst: result.structuredResponse,
			analystAttempts: (state.analystAttempts ?? 0) + 1,
			// The router compares this with the next validation's issues: an
			// identical set means the round made no progress, and another
			// identical round would be a third full analyst run for nothing.
			analystRepairIssues: state.validation?.analystIssues ?? [],
		};
	};
}

export { createAnalystNode, createAnalystRepairNode };
