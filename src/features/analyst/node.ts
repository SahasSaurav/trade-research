import {
	ANALYST_REPAIR_USER_MESSAGE,
	ANALYST_USER_MESSAGE,
} from "@src/features/analyst/prompt.js";
import type { AnalystReportData } from "@src/features/analyst/schema.js";
import type { AgentRunnable } from "@src/workflows/agent.js";
import type { GraphState } from "@src/workflows/state.js";

function createAnalystNode(agent: AgentRunnable<AnalystReportData>) {
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

function createAnalystRepairNode(agent: AgentRunnable<AnalystReportData>) {
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
		};
	};
}

export { createAnalystNode, createAnalystRepairNode };
