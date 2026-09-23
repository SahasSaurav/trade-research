import { Annotation } from "@langchain/langgraph";

const WorkflowState = Annotation.Root({
	ticker: Annotation<string>,
	valuation: Annotation<unknown>,
	analyst: Annotation<unknown>,
	sentiment: Annotation<unknown>,
	summary: Annotation<unknown>,
	validation: Annotation<unknown>,
	validationIssues: Annotation<string[]>,
	analystAttempts: Annotation<number>,
	workflowStatus: Annotation<"running" | "insufficient_data" | "complete">,
	decision: Annotation<unknown>,
});

type GraphState = typeof WorkflowState.State;

export type { GraphState };
export { WorkflowState };
