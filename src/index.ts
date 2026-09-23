import "dotenv/config";

import { createWorkflow } from "@src/workflows/workflow.js";

const ticker = "AAPL";

const { workflow } = createWorkflow();

const result = await workflow.invoke({ ticker });

console.log(`\n${"=".repeat(60)}`);
console.log(`STOCK RESEARCH REPORT: ${ticker}`);
console.log(`${"=".repeat(60)}\n`);

// Print Summary with Data
const summary = result.summary as { summary?: string } | null;
if (summary?.summary) {
	console.log(summary.summary);
} else {
	console.log("No summary available");
}
