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
			// Floors sit just under the measured values so a regression fails
			// the run rather than being noticed later. Current: 99.42 stmts,
			// 98.41 branches, 100 funcs, 100 lines.
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
			// the agent factories (thin `createAgent` calls), and the prompt
			// templates (string constants).
			//
			// Two branches remain uncovered, both unreachable defensive guards
			// rather than untested logic:
			//   workflows/graph.ts:64         state.validation is never absent,
			//                                 since the only edge into
			//                                 dataValidation is via nodes that
			//                                 always set it.
			//   sentiment/workflow/graph.ts:79 a missing geopoliticalSummary
			//                                 with no geopoliticalError, which
			//                                 the node cannot produce together.
			exclude: [
				"src/index.ts",
				"src/workflows/workflow.ts",
				"src/features/*/agent.ts",
				"src/features/sentiment/subagents/*/agent.ts",
				"src/**/prompt.ts",
			],
		},
	},
});
