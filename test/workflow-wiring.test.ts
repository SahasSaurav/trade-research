import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createWorkflow } from "@src/workflows/workflow.js";
import { describe, expect, it } from "vitest";

describe("workflow wiring", () => {
	it("opens the store and the checkpointer from CONTEXT_DB_PATH", async () => {
		const dir = mkdtempSync(join(tmpdir(), "wiring-"));
		const path = join(dir, "context.db");
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

			const db = new DatabaseSync(path, { readOnly: true });
			try {
				const tables = (
					db
						.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
						.all() as { name: string }[]
				).map((table) => table.name);
				expect(tables).toEqual(expect.arrayContaining(["pages", "runs"]));
			} finally {
				db.close();
			}
		} finally {
			process.env.CONTEXT_DB_PATH = previous;
			rmSync(dir, { recursive: true, force: true });
		}
	}, 30_000);
});
