import { Annotation } from "@langchain/langgraph";
import type { AnalystReportData } from "@src/features/analyst/schema.js";
import type { DecisionData } from "@src/features/decision/schema.js";
import type { SentimentData } from "@src/features/sentiment/schema.js";
import type { SummaryData } from "@src/features/summary/schema.js";
import type { ValidationResult } from "@src/features/validation/validate.js";
import type { ValuationData } from "@src/features/valuation/schema.js";

const WorkflowState = Annotation.Root({
	ticker: Annotation<string>,
	valuation: Annotation<ValuationData | undefined>,
	analyst: Annotation<AnalystReportData | undefined>,
	sentiment: Annotation<SentimentData | undefined>,
	summary: Annotation<SummaryData | undefined>,
	validation: Annotation<ValidationResult | undefined>,
	validationIssues: Annotation<string[]>,
	analystAttempts: Annotation<number>,
	workflowStatus: Annotation<"running" | "insufficient_data" | "complete">,
	decision: Annotation<DecisionData | undefined>,
});

type GraphState = typeof WorkflowState.State;

export type { GraphState };
export { WorkflowState };
