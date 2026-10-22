import { join } from "node:path";

import { createWorkflow } from "@src/workflows/workflow.js";
import { describe, expect, it } from "vitest";

import { removeTempDirs, tableNames, tempDir } from "./helpers.js";

describe("workflow wiring", () => {
	it("opens the store and the checkpointer from CONTEXT_DB_PATH", async () => {
		const path = join(tempDir("wiring-"), "context.db");
		const previous = process.env.CONTEXT_DB_PATH;
		process.env.CONTEXT_DB_PATH = path;
		process.env.TAVILY_API_KEY ??= "test-key";
		process.env.OPENAI_API_KEY ??= "test-key";
		process.env.XAI_API_KEY ??= "test-key";
		process.env.GOOGLE_API_KEY ??= "test-key";

		try {
			// Construction only: no agent is invoked, so this costs no model
			// calls. What it pins is that the env var reaches both handles.
			const { store, checkpoints } = createWorkflow();
			expect(store).not.toBeNull();
			expect(checkpoints).not.toBeNull();

			store?.pageCache<string>().set("k", "body");
			expect(store?.pageCache<string>().get("k")).toBe("body");

			store?.close();
			checkpoints?.close();

			expect(tableNames(path)).toEqual(
				expect.arrayContaining(["pages", "runs"]),
			);
		} finally {
			process.env.CONTEXT_DB_PATH = previous;
			removeTempDirs();
		}
	}, 30_000);
});
