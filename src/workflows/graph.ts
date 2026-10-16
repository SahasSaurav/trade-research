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

const NODE_TIMEOUT_MS = 99_999;

type Route = "decisionAgent" | "analystRepair" | "summaryAgent";

type GraphAgents = {
	valuation: ReactAgent<any>;
	analyst: ReactAgent<any>;
	sentiment: ReactAgent<any>;
	decision: ReactAgent<any>;
	summary: ReactAgent<any>;
	tickerSearch?: TavilySearch;
};

/**
 * Each round is a complete re-invocation of the analyst, so this multiplies
 * one of the most expensive branches rather than adding to it. 0 disables
 * repair.
 */
const DEFAULT_MAX_ANALYST_ATTEMPTS = 2;

type GraphOptions = {
	maxAnalystAttempts?: number;
	researchAttempts?: number;
};

function createGraph(agents: GraphAgents, options: GraphOptions = {}) {
	const maxAnalystAttempts =
		options.maxAnalystAttempts ?? DEFAULT_MAX_ANALYST_ATTEMPTS;

	const graphBuilder = new StateGraph(WorkflowState)
		.addNode(
			// Not "tickerValidation": addNode throws when a node name matches a
			// state channel. Nodes take the job name, channels the value.
			"tickerCheck",
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
			createSentimentNode(agents.sentiment, options.researchAttempts),
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
		.addEdge(START, "tickerCheck")
		.addConditionalEdges("tickerCheck", (state: GraphState) =>
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
				(state.analystAttempts ?? 0) < maxAnalystAttempts
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
