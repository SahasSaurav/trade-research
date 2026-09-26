import "dotenv/config";

import { randomUUID } from "node:crypto";
import type { DecisionData } from "@src/features/decision/schema.js";
import { validateTicker } from "@src/features/ticker/validate.js";
import { renderReport } from "@src/report/render.js";
import { createWorkflow } from "@src/workflows/workflow.js";

const ticker = "AMZN";

const { workflow } = createWorkflow();

// Validate before any model calls or searches are spent. A typo
// ("APPL") would otherwise send six agents researching a company
// that may not exist and return a plausible-looking report built
// on whatever the search turned up.
// const validation = await validateTicker(ticker);
// if (!validation.ok) {
// 	console.error(`Ticker validation failed: ${validation.message}`);
// 	process.exit(1);
// }

const result = await workflow.invoke(
	{ ticker: ticker },
	{ configurable: { thread_id: randomUUID() } },
);

// The summary prose is written by a model and can drift from the
// structured decision, so both are rendered from the artifacts
// rather than trusting the prose to carry the call.
const report = renderReport({
	ticker: ticker,
	companyName: validation?.name || "",
	decision: result.decision as DecisionData | undefined,
	validationIssues: result.validationIssues as string[] | undefined,
	summary: result.summary?.summary,
});
console.log(report);
