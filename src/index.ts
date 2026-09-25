import "dotenv/config";

import { randomUUID } from "node:crypto";
import { createWorkflow } from "@src/workflows/workflow.js";

const ticker = "AAPL";

const { workflow } = createWorkflow();

const result = await workflow.invoke(
	{ ticker },
	{ configurable: { thread_id: randomUUID() } },
);

console.log(`\n${"=".repeat(60)}`);
console.log(`STOCK RESEARCH REPORT: ${ticker}`);
console.log(`${"=".repeat(60)}\n`);

// Print Summary with Data
const summary = result.summary?.summary;
if (summary) {
	console.log(summary);
} else {
	console.log("No summary available");
}
