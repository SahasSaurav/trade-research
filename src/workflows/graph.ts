import {
	END,
	MemorySaver,
	START,
	StateGraph,
	type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type { TavilySearch } from "@langchain/tavily";
import {
	createAnalystNode,
	createAnalystRepairNode,
} from "@src/agents/analyst/node.js";
import type { AnalystReportData } from "@src/agents/analyst/schema.js";
import { createDebateNode } from "@src/agents/debate/node.js";
import type { DebateData } from "@src/agents/debate/schema.js";
import { createDecisionNode } from "@src/agents/decision/node.js";
import type { DecisionData } from "@src/agents/decision/schema.js";
import { createFinancialsNode } from "@src/agents/financials/node.js";
import type { FinancialsData } from "@src/agents/financials/schema.js";
import { createMarketNode } from "@src/agents/market/node.js";
import type { MarketData } from "@src/agents/market/schema.js";
import { createSentimentNode } from "@src/agents/sentiment/node.js";
import type { SentimentResearchData } from "@src/agents/sentiment/schema.js";
import { createSummaryNode } from "@src/agents/summary/node.js";
import type { SummaryData } from "@src/agents/summary/schema.js";
import { createTickerValidationNode } from "@src/agents/ticker/node.js";
import { createValidationNode } from "@src/agents/validation/node.js";
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
 * repair, and a round that would repeat the issues it was given is not
 * attempted at all (see shouldRepairAnalyst).
 */
const DEFAULT_MAX_ANALYST_ATTEMPTS = 2;

type GraphOptions = {
	maxAnalystAttempts?: number;
	researchAttempts?: number;
	/**
	 * Where a thread's checkpoints go. Defaults to an in-memory saver: state is
	 * threaded across invocations, but nothing survives the process — so a
	 * crash costs the whole run. The context store swaps in a file-backed one.
	 */
	checkpointer?: BaseCheckpointSaver;
};

/** The four research branches that run in parallel after ticker validation. */
const RESEARCH_BRANCHES = [
	"financialsAgent",
	"analystAgent",
	"sentimentAgent",
	"marketAgent",
] as const;

/** Set equality; the issue order is stable, but sets are what is compared. */
function sameIssues(left: string[], right: string[]): boolean {
	return (
		left.length === right.length && left.every((issue) => right.includes(issue))
	);
}

/**
 * Whether another analyst round is worth a full agent invocation.
 *
 * The repair is conditional on four things, because each of them makes the
 * re-run free of value:
 *
 * - the analyst is the only failing branch — if the financials, sentiment or
 *   market artifact is also bad, the run still ends at the summary, so fixing
 *   the analyst changes nothing;
 * - the issues are repairable — a schema blob names no firm, field or expected
 *   value, so there is nothing for the model to act on;
 * - the attempt budget is not spent;
 * - the last repair made progress — the same instruction produced the same
 *   failure, so a third identical round is the most expensive way to learn
 *   nothing.
 */
function shouldRepairAnalyst(state: GraphState, maxAttempts: number): boolean {
	const validation = state.validation;
	if (!validation) return false;
	if (!validation.analystRepairable) return false;

	const onlyAnalystFailing =
		validation.issues.length === validation.analystIssues.length;
	if (!onlyAnalystFailing) return false;

	if ((state.analystAttempts ?? 0) >= maxAttempts) return false;

	return !sameIssues(validation.analystIssues, state.analystRepairIssues ?? []);
}

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
			if (!state.validation) return "summaryAgent";
			if (shouldRepairAnalyst(state, maxAnalystAttempts)) {
				return "analystRepair";
			}
			if (!state.validation.pass) return "summaryAgent";
			return "debateAgent";
		})
		// The debate orchestrator dispatches the bull, then the bear that
		// rebuts it, then the decision that weighs both. The graph still owns
		// the stage's place in the run: research → debate → decision → summary.
		.addEdge("debateAgent", "decisionAgent")
		.addEdge("decisionAgent", "summaryAgent")
		.addEdge("summaryAgent", END);

	return graphBuilder.compile({
		checkpointer: options.checkpointer ?? new MemorySaver(),
	});
}

export type { GraphAgents };
export { createGraph };
