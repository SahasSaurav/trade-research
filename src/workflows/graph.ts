import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { TavilySearch } from "@langchain/tavily";
import {
	createAnalystNode,
	createAnalystRepairNode,
} from "@src/features/analyst/node.js";
import type { AnalystReportData } from "@src/features/analyst/schema.js";
import { createDebateNode } from "@src/features/debate/node.js";
import type { DebateData } from "@src/features/debate/schema.js";
import { createDecisionNode } from "@src/features/decision/node.js";
import type { DecisionData } from "@src/features/decision/schema.js";
import { createFinancialsNode } from "@src/features/financials/node.js";
import type { FinancialsData } from "@src/features/financials/schema.js";
import { createMarketNode } from "@src/features/market/node.js";
import type { MarketData } from "@src/features/market/schema.js";
import { createSentimentNode } from "@src/features/sentiment/node.js";
import type { SentimentResearchData } from "@src/features/sentiment/schema.js";
import { createSummaryNode } from "@src/features/summary/node.js";
import type { SummaryData } from "@src/features/summary/schema.js";
import { createTickerValidationNode } from "@src/features/ticker/node.js";
import { createValidationNode } from "@src/features/validation/node.js";
import type { GraphState } from "@src/workflows/state.js";
import { WorkflowState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

const NODE_TIMEOUT_MS = 99_999;

/** Where the validation router sends a passing run, and where repair loops end. */
type Route = "debateAgent" | "analystRepair" | "summaryAgent";

type GraphAgents = {
	financials: ReactAgent<AgentTypeConfig<FinancialsData>>;
	analyst: ReactAgent<AgentTypeConfig<AnalystReportData>>;
	sentiment: ReactAgent<AgentTypeConfig<SentimentResearchData>>;
	market: ReactAgent<AgentTypeConfig<MarketData>>;
	debate: ReactAgent<AgentTypeConfig<DebateData>>;
	decision: ReactAgent<AgentTypeConfig<DecisionData>>;
	summary: ReactAgent<AgentTypeConfig<SummaryData>>;
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

/** The four research branches that run in parallel after ticker validation. */
const RESEARCH_BRANCHES = [
	"financialsAgent",
	"analystAgent",
	"sentimentAgent",
	"marketAgent",
] as const;

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
		.addNode("financialsAgent", createFinancialsNode(agents.financials), {
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
		.addNode("marketAgent", createMarketNode(agents.market), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("dataValidation", createValidationNode())
		.addNode("analystRepair", createAnalystRepairNode(agents.analyst), {
			timeout: NODE_TIMEOUT_MS,
		})
		.addNode("debateAgent", createDebateNode(agents.debate), {
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
			state.workflowStatus === "invalid_ticker" ? END : [...RESEARCH_BRANCHES],
		)
		.addEdge([...RESEARCH_BRANCHES], "dataValidation")
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
			return "debateAgent";
		})
		// The debate orchestrator dispatches the bull, then the bear that
		// rebuts it, then the decision that weighs both. The graph still owns
		// the stage's place in the run: research → debate → decision → summary.
		.addEdge("debateAgent", "decisionAgent")
		.addEdge("decisionAgent", "summaryAgent")
		.addEdge("summaryAgent", END);

	return graphBuilder.compile({
		checkpointer: new MemorySaver(),
	});
}

export type { GraphAgents };
export { createGraph };
