import "dotenv/config";
import { randomUUID } from "node:crypto";

import type { DecisionData } from "@src/features/decision/schema.js";
import { generateReport } from "@src/report/render.js";
import { createWorkflow } from "@src/workflows/workflow.js";

const ticker = "AMZN";

const { workflow } = createWorkflow();
const result = await workflow.invoke(
	{ ticker: ticker },
	{ configurable: { thread_id: randomUUID() } },
);

// The summary prose is written by a model and can drift from the
// structured decision, so both are rendered from the artifacts
// rather than trusting the prose to carry the call.
const report = generateReport({
	ticker,
	tickerValidation: result.tickerValidation,
	decision: result.decision as DecisionData | undefined,
	validationIssues: result.validationIssues as string[] | undefined,
	summary: result.summary?.summary,
});

console.log(report);
