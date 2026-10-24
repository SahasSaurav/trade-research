import { Annotation } from "@langchain/langgraph";
import type { AnalystReportData } from "@src/agents/analyst/schema.js";
import type { DebateData } from "@src/agents/debate/schema.js";
import type { DecisionData } from "@src/agents/decision/schema.js";
import type { FinancialsData } from "@src/agents/financials/schema.js";
import type { MarketData } from "@src/agents/market/schema.js";
import type { SentimentData } from "@src/agents/sentiment/schema.js";
import type { SummaryData } from "@src/agents/summary/schema.js";
import type { TickerValidation } from "@src/agents/ticker/validate.js";
import type { ValidationResult } from "@src/agents/validation/validate.js";

const WorkflowState = Annotation.Root({
	ticker: Annotation<string>,
	tickerValidation: Annotation<TickerValidation | undefined>,
	financials: Annotation<FinancialsData | undefined>,
	analyst: Annotation<AnalystReportData | undefined>,
	sentiment: Annotation<SentimentData | undefined>,
	market: Annotation<MarketData | undefined>,
	debate: Annotation<DebateData | undefined>,
	summary: Annotation<SummaryData | undefined>,
	validation: Annotation<ValidationResult | undefined>,
	validationIssues: Annotation<string[]>,
	analystAttempts: Annotation<number>,
	/** The analyst issues the pending repair was asked to fix, for progress checks. */
	analystRepairIssues: Annotation<string[]>,
	workflowStatus: Annotation<
		"running" | "insufficient_data" | "invalid_ticker" | "complete"
	>,
	decision: Annotation<DecisionData | undefined>,
});

type GraphState = typeof WorkflowState.State;

export type { GraphState };
export { WorkflowState };
