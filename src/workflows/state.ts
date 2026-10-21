import { Annotation } from "@langchain/langgraph";
import type { AnalystReportData } from "@src/features/analyst/schema.js";
import type { DebateData } from "@src/features/debate/schema.js";
import type { DecisionData } from "@src/features/decision/schema.js";
import type { FinancialsData } from "@src/features/financials/schema.js";
import type { MarketData } from "@src/features/market/schema.js";
import type { SentimentData } from "@src/features/sentiment/schema.js";
import type { SummaryData } from "@src/features/summary/schema.js";
import type { TickerValidation } from "@src/features/ticker/validate.js";
import type { ValidationResult } from "@src/features/validation/validate.js";

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
