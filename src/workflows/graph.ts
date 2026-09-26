import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { TavilySearch } from "@langchain/tavily";
import {
	createAnalystNode,
	createAnalystRepairNode,
} from "@src/features/analyst/node.js";
import { createDecisionNode } from "@src/features/decision/node.js";
import { createSentimentNode } from "@src/features/sentiment/node.js";
import { createSummaryNode } from "@src/features/summary/node.js";
import { createTickerValidationNode } from "@src/features/ticker/node.js";
import { createValidationNode } from "@src/features/validation/node.js";
import { createValuationNode } from "@src/features/valuation/node.js";
import type { GraphState } from "@src/workflows/state.js";
import { WorkflowState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

const MAX_ANALYST_ATTEMPTS = 2;
const NODE_TIMEOUT_MS = 99_999;

type Route = "decisionAgent" | "analystRepair" | "summaryAgent";

type GraphAgents = {
	valuation: ReactAgent;
	analyst: ReactAgent;
	newsSentiment: ReactAgent;
	geopolitical: ReactAgent;
	decision: ReactAgent;
	summary: ReactAgent;
	tickerSearch?: TavilySearch;
};

function createGraph(agents: GraphAgents) {
	const graphBuilder = new StateGraph(WorkflowState)
		.addNode(
			"tickerValidation",
			agents.tickerSearch
				? createTickerValidationNode(agents.tickerSearch)
				: async () => ({ workflowStatus: "running" as const }),
		)
		.addNode("valuationAgent", createValuationNode(agents.valuation), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("analystAgent", createAnalystNode(agents.analyst), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode(
			"sentimentAgent",
			createSentimentNode(agents.newsSentiment, agents.geopolitical),
			{
				timeout: NODE_TIMEOUT_MS,
			},
		)
		.addNode("dataValidation", createValidationNode())
		.addNode("analystRepair", createAnalystRepairNode(agents.analyst), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("decisionAgent", createDecisionNode(agents.decision), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("summaryAgent", createSummaryNode(agents.summary), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addEdge(START, "tickerValidation")
		.addConditionalEdges("tickerValidation", (state: GraphState) =>
			state.workflowStatus === "invalid_ticker"
				? END
				: ["valuationAgent", "analystAgent", "sentimentAgent"],
		)
		.addEdge(
			["valuationAgent", "analystAgent", "sentimentAgent"],
			"dataValidation",
		)
		.addEdge("analystRepair", "dataValidation")
		.addConditionalEdges("dataValidation", (state: GraphState): Route => {
			const validation = state.validation;
			if (!validation) return "summaryAgent";
			if (
				validation.analystIssues.length > 0 &&
				(state.analystAttempts ?? 0) < MAX_ANALYST_ATTEMPTS
			) {
				return "analystRepair";
			}
			if (!validation.pass) return "summaryAgent";
			return "decisionAgent";
		})
		.addEdge("decisionAgent", "summaryAgent")
		.addEdge("summaryAgent", END);

	return graphBuilder.compile({
		checkpointer: new MemorySaver(),
	});
}

export type { GraphAgents };
export { createGraph };
