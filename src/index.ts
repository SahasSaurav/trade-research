import "dotenv/config";
import { randomUUID } from "node:crypto";

import { generateReport } from "@src/report/render.js";
import { checkpointThreadId } from "@src/utils/context-store.js";
import type { GraphState } from "@src/workflows/state.js";
import { createWorkflow } from "@src/workflows/workflow.js";

const ticker = "AMZN";

const startedAt = Date.now();
const runId = randomUUID();
const { workflow, store, checkpoints, runMeta } = createWorkflow();

// A run resumes on its ticker and its day, so a crash mid-way is picked up by
// the next invocation instead of re-paying every node that already completed.
// With no store there is nothing to resume from, so the thread is a fresh uuid
// and the run starts clean, exactly as it did before the store existed.
const threadId = checkpoints ? checkpointThreadId(ticker) : runId;
const runConfig = { configurable: { thread_id: threadId } };

// A thread with pending nodes is a run that died mid-way. Continuing it means
// passing no input — an input would start a new turn and re-run the whole
// graph — and starting from its saved values, so the branches it already
// finished are still in the report.
const saved = await workflow.getState(runConfig);
const resumeAt = saved.next ?? [];
if (resumeAt.length > 0) {
	console.log(`▸ resuming ${ticker} at ${resumeAt.join(", ")}`);
} else if (checkpoints) {
	// No pending nodes means there is nothing to resume. Any thread still on
	// disk already reached END (the process died between the report and the
	// cleanup below), and its per-run counters would otherwise leak into this
	// run — a spent analyst budget would silently disable repair.
	await checkpoints.saver.deleteThread(threadId);
}

// Streamed rather than invoked so each node reports as it finishes: a run
// takes minutes, and a silent wait gives no way to tell a slow node from a
// stuck one. The per-node updates are merged by hand because the stream
// yields partial state, not the final state that invoke would return.
const stream = await workflow.stream(resumeAt.length > 0 ? null : { ticker }, {
	...runConfig,
	streamMode: "updates",
});

const state: Partial<GraphState> = { ...saved.values };
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

if (store) {
	// Written after the report, because the report is the product and the
	// record is the receipt: a store that fails here must not swallow the
	// answer the run just produced.
	try {
		store.recordRun({
			id: runId,
			ticker,
			startedAt,
			status: state.workflowStatus ?? "unknown",
			...runMeta,
			artifacts: {
				financials: state.financials,
				analyst: state.analyst,
				sentiment: state.sentiment,
				market: state.market,
				debate: state.debate,
				decision: state.decision,
				summary: state.summary,
				validation: state.validation,
			},
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.warn(`could not record the run: ${reason}`);
	} finally {
		store.close();
	}
}

if (checkpoints) {
	// Checkpoints exist to resume a run, not to remember one: a finished run
	// clears its thread so the next run of the same ticker starts clean rather
	// than inheriting a graph that already reached END.
	try {
		await checkpoints.saver.deleteThread(threadId);
	} finally {
		checkpoints.close();
	}
}
