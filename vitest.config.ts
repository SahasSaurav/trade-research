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
			// Entry points and wiring. The six agent factories are thin
			// `createAgent` calls; the graph builders are only reachable by
			// invoking a live model, so they are excluded rather than
			// reported as untested.
			exclude: [
				"src/index.ts",
				"src/workflows/workflow.ts",
				"src/workflows/graph.ts",
				"src/features/*/agent.ts",
				"src/features/*/node.ts",
				"src/features/sentiment/subagents/*/agent.ts",
				"src/features/sentiment/subagents/*/node.ts",
				"src/features/sentiment/node.ts",
				"src/features/sentiment/workflow/graph.ts",
				"src/**/prompt.ts",
			],
		},
	},
});
