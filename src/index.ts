import "dotenv/config";
import { randomUUID } from "node:crypto";

import { generateReport } from "@src/report/render.js";
import type { GraphState } from "@src/workflows/state.js";
import { createWorkflow } from "@src/workflows/workflow.js";

const ticker = "AMZN";

const { workflow } = createWorkflow();

// Streamed rather than invoked so each node reports as it finishes: a run
// takes minutes, and a silent wait gives no way to tell a slow node from a
// stuck one. The per-node updates are merged by hand because the stream
// yields partial state, not the final state that invoke would return.
const stream = await workflow.stream(
	{ ticker: ticker },
	{ configurable: { thread_id: randomUUID() }, streamMode: "updates" },
);

const state: Partial<GraphState> = {};
for await (const event of stream) {
	for (const [node, update] of Object.entries(event)) {
		console.log(`▸ ${node}`);
		Object.assign(state, update);
	}
}

// The summary prose is written by a model and can drift from the
// structured decision, so both are rendered from the artifacts
// rather than trusting the prose to carry the call.
const report = generateReport({
	ticker,
	tickerValidation: state.tickerValidation,
	decision: state.decision,
	validationIssues: state.validationIssues,
	summary: state.summary?.summary,
});

console.log(report);
