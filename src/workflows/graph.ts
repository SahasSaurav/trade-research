import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createAnalystNode } from "@src/features/analyst/node.js";

import { createAnalystRepairNode } from "@src/features/analyst/repairNode.js";
import { createDecisionNode } from "@src/features/decision/node.js";
import { createSentimentNode } from "@src/features/sentiment/node.js";
import { createSummaryNode } from "@src/features/summary/node.js";
import { createValidationNode } from "@src/features/validation/node.js";
import type { ValidationResult } from "@src/features/validation/validate.js";
import { createValuationNode } from "@src/features/valuation/node.js";
import type { GraphState } from "@src/workflows/state.js";
import { WorkflowState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

const MAX_ANALYST_ATTEMPTS = 2;
const NODE_TIMEOUT_MS = 99_999;

type Route = "decisionAgent" | "analystRepair" | "summaryAgent" | "__end__";

function createGraph(
	valuationAgent: ReactAgent,
	analystAgent: ReactAgent,
	sentimentAgent: ReactAgent,
	decisionAgent: ReactAgent,
	summaryAgent: ReactAgent,
) {
	const graphBuilder = new StateGraph(WorkflowState)
		.addNode("valuationAgent", createValuationNode(valuationAgent), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("analystAgent", createAnalystNode(analystAgent), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("sentimentAgent", createSentimentNode(sentimentAgent), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("dataValidation", createValidationNode())
		.addNode("analystRepair", createAnalystRepairNode(analystAgent), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("decisionAgent", createDecisionNode(decisionAgent), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("summaryAgent", createSummaryNode(summaryAgent), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addEdge(START, "valuationAgent")
		.addEdge(START, "analystAgent")
		.addEdge(START, "sentimentAgent")
		.addEdge("valuationAgent", "dataValidation")
		.addEdge("analystAgent", "dataValidation")
		.addEdge("sentimentAgent", "dataValidation")
		.addEdge("analystRepair", "dataValidation")
		.addConditionalEdges("dataValidation", (state: GraphState): Route => {
			const validation = state.validation as ValidationResult | undefined;
			if (!validation?.pass) return "summaryAgent";
			if ((state.analystAttempts ?? 0) < MAX_ANALYST_ATTEMPTS) {
				return "analystRepair";
			}
			return "decisionAgent";
		})
		.addConditionalEdges("decisionAgent", (state: GraphState): Route => {
			const status = state.workflowStatus as string;
			if (status === "insufficient_data") return "summaryAgent";
			return END;
		})
		.addEdge("summaryAgent", END);

	return graphBuilder.compile({
		checkpointer: new MemorySaver(),
	});
}

export { createGraph };
