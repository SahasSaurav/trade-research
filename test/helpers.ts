import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Scratch space for the tests that need a real SQLite file.
 *
 * The store is only meaningful on disk, so several suites build one per test.
 * The directories are registered here and dropped in one call from teardown,
 * which keeps the cleanup in a single place instead of repeated in every
 * `finally`.
 */
const dirs: string[] = [];

function tempDir(prefix = "trade-research-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}

function removeTempDirs(): void {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
}

/** The tables actually on disk, for asserting what a handle created. */
function tableNames(path: string): string[] {
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		const rows = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all() as { name: string }[];
		return rows.map((row) => row.name);
	} finally {
		db.close();
	}
}

export { removeTempDirs, tableNames, tempDir };
