import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@src": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		include: ["test/**/*.test.ts"],
		environment: "node",
		// The workflow touches real provider SDKs on import; keep the default
		// threads pool but make failures readable.
		reporters: ["verbose"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["src/**/*.ts"],
			// Floors are meant to sit just under the measured values so a
			// regression fails the run rather than being noticed later. They do
			// not currently: a clean run measures ~93.5 stmts / 79.7 branches /
			// 96.5 funcs / 94.4 lines, so the run fails on all four. The gap is
			// src/agents/ticker/node.ts (untested) and ticker/validate.ts, plus
			// partial coverage of trader/node.ts, report/render.ts and
			// workflows/graph.ts.
			thresholds: {
				statements: 99,
				branches: 98,
				functions: 100,
				lines: 100,
			},
			// The node factories, the graph builders and the valuation tool are
			// all exercised by stub agents, so they stay in the report. Only
			// files with no testable behaviour are excluded: the CLI entry
			// point, the provider wiring (which constructs live SDK clients),
			// the skill constants (which read the repo root), the agent
			// factories (thin `createAgent` calls, incl. the nested debate and
			// sentiment subagents), and the prompt templates (string constants).
			//
			// Two branches remain uncovered, both unreachable defensive guards
			// rather than untested logic: the dataValidation router's
			// "validation is absent" case, and the merge node's missing
			// geopoliticalSummary with no geopoliticalError.
			exclude: [
				"src/index.ts",
				"src/workflows/workflow.ts",
				"src/workflows/skills.ts",
				"src/**/agent.ts",
				"src/**/prompt.ts",
			],
		},
	},
});
