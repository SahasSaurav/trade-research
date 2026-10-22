import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
	type ContextStore,
	checkpointThreadId,
	openCheckpointSaver,
	openContextStore,
} from "@src/utils/context-store.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { removeTempDirs, tempDir } from "./helpers.js";

/**
 * The store is derived data: a page it loses is a refetch, a run it loses is a
 * receipt. What these tests pin is the three behaviours that make it safe to
 * turn on — freshness is per row, nothing a run writes can change what the run
 * computed, and every delete is a tombstone rather than a lost row.
 */

const HOUR = 60 * 60 * 1000;

let stores: ContextStore[] = [];

function tempPath(name = "context.db"): string {
	return join(tempDir("context-store-"), name);
}

function open(path: string, pageTtlMs = 12 * HOUR): ContextStore {
	const store = openContextStore({ path, pageTtlMs });
	stores.push(store);
	return store;
}

/** A read-only handle, so a test can look at what the store actually wrote. */
function read(path: string): DatabaseSync {
	return new DatabaseSync(path, { readOnly: true });
}

afterEach(() => {
	for (const store of stores) {
		try {
			store.close();
		} catch {
			// Already closed by the test; nothing to clean up.
		}
	}
	stores = [];
	removeTempDirs();
	vi.useRealTimers();
});

describe("context store pages", () => {
	it("keeps a cached page after the process that read it exits", () => {
		const path = tempPath();

		const first = open(path);
		first
			.pageCache<string>()
			.set("advanced||text|https://example.com/a", "body");
		first.close();

		// A second run, a second process: the page is still there.
		const second = open(path);
		expect(
			second.pageCache<string>().get("advanced||text|https://example.com/a"),
		).toBe("body");
	});

	it("stamps a page with its row bookkeeping", () => {
		const path = tempPath();
		open(path).pageCache<string>().set("k", "body");

		const db = read(path);
		try {
			const row = db
				.prepare(
					"SELECT id, created_at, updated_at, deleted_at FROM pages WHERE key = ?",
				)
				.get("k") as Record<string, unknown>;
			expect(row.id).toEqual(expect.any(String));
			expect(row.created_at).toEqual(expect.any(Number));
			expect(row.updated_at).toBe(row.created_at);
			expect(row.deleted_at).toBeNull();
		} finally {
			db.close();
		}
	});

	it("expires a page once its ttl passes", () => {
		vi.useFakeTimers();
		const store = open(tempPath(), HOUR);
		const cache = store.pageCache<string>();
		cache.set("k", "body");

		vi.advanceTimersByTime(HOUR + 1);

		expect(cache.get("k")).toBeUndefined();
		expect(cache.size).toBe(0);
	});

	it("tombstones a page it expires instead of dropping the row", () => {
		vi.useFakeTimers();
		const path = tempPath();
		const cache = open(path, HOUR).pageCache<string>();
		cache.set("k", "body");

		// Any write is what retracts what went stale; nothing sweeps on a timer.
		vi.advanceTimersByTime(HOUR + 1);
		cache.set("other", "body");

		const db = read(path);
		try {
			const rows = db
				.prepare("SELECT key, deleted_at FROM pages ORDER BY key")
				.all() as { key: string; deleted_at: number | null }[];
			expect(rows.find((row) => row.key === "k")?.deleted_at).toEqual(
				expect.any(Number),
			);
			expect(rows.find((row) => row.key === "other")?.deleted_at).toBeNull();
		} finally {
			db.close();
		}
	});

	it("keeps a page inside its ttl", () => {
		vi.useFakeTimers();
		const cache = open(tempPath(), HOUR).pageCache<string>();
		cache.set("k", "body");

		vi.advanceTimersByTime(HOUR - 1);

		expect(cache.get("k")).toBe("body");
	});

	it("retracts the oldest entries once the bound is reached", () => {
		const store = openContextStore({
			path: tempPath(),
			pageTtlMs: HOUR,
			maxPageEntries: 2,
		});
		stores.push(store);
		const cache = store.pageCache<string>();

		cache.set("a", "1");
		cache.set("b", "2");
		cache.set("c", "3");

		expect(cache.size).toBe(2);
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("2");
		expect(cache.get("c")).toBe("3");
	});

	it("refreshes an expired row in place, without churning rows", () => {
		vi.useFakeTimers();
		const path = tempPath();
		const cache = open(path, HOUR).pageCache<string>();
		cache.set("k", "first");

		vi.advanceTimersByTime(HOUR + 1);
		cache.set("k", "second");

		const db = read(path);
		try {
			const rows = db.prepare("SELECT deleted_at FROM pages").all() as {
				deleted_at: number | null;
			}[];
			// The upsert lands before the sweep, so a stale-but-live row is
			// rewritten rather than tombstoned and re-inserted.
			expect(rows).toHaveLength(1);
			expect(rows[0].deleted_at).toBeNull();
		} finally {
			db.close();
		}
	});

	it("gives a tombstoned key a new row and a new id", () => {
		vi.useFakeTimers();
		const path = tempPath();
		const cache = open(path, HOUR).pageCache<string>();
		cache.set("k", "first");

		cache.clear();
		cache.set("k", "second");

		const db = read(path);
		try {
			const rows = db
				.prepare(
					"SELECT id, payload, deleted_at FROM pages ORDER BY created_at, rowid",
				)
				.all() as { id: string; payload: string; deleted_at: number | null }[];
			expect(rows).toHaveLength(2);
			expect(JSON.parse(rows[0].payload)).toBe("first");
			expect(rows[0].deleted_at).toEqual(expect.any(Number));
			expect(JSON.parse(rows[1].payload)).toBe("second");
			expect(rows[1].deleted_at).toBeNull();
			expect(rows[1].id).not.toBe(rows[0].id);
		} finally {
			db.close();
		}
	});

	it("bumps updated_at when the same page is stored again", () => {
		vi.useFakeTimers();
		const path = tempPath();
		const cache = open(path, HOUR).pageCache<string>();
		cache.set("k", "first");
		const created = Date.now();

		vi.advanceTimersByTime(1000);
		cache.set("k", "second");

		const db = read(path);
		try {
			const rows = db
				.prepare("SELECT id, payload, created_at, updated_at FROM pages")
				.all() as {
				id: string;
				payload: string;
				created_at: number;
				updated_at: number;
			}[];
			// One live row, rewritten in place: created_at is when the row
			// appeared, updated_at is when it was last served a new body.
			expect(rows).toHaveLength(1);
			expect(JSON.parse(rows[0].payload)).toBe("second");
			expect(rows[0].created_at).toBe(created);
			expect(rows[0].updated_at).toBe(created + 1000);
		} finally {
			db.close();
		}
	});

	it("tombstones every page on clear, keeping the history", () => {
		const path = tempPath();
		const cache = open(path).pageCache<string>();
		cache.set("a", "1");
		cache.set("b", "2");

		cache.clear();

		expect(cache.size).toBe(0);
		expect(cache.get("a")).toBeUndefined();

		const db = read(path);
		try {
			const rows = db.prepare("SELECT deleted_at FROM pages").all() as {
				deleted_at: number | null;
			}[];
			expect(rows).toHaveLength(2);
			expect(rows.every((row) => row.deleted_at !== null)).toBe(true);
		} finally {
			db.close();
		}
	});

	it("creates the directory the file lives in", () => {
		const path = join(tempDir("context-store-"), "nested", "context.db");

		const store = open(path);
		store.pageCache<string>().set("k", "body");

		expect(store.pageCache<string>().get("k")).toBe("body");
	});

	it("works in memory, for tests and dry runs", () => {
		const store = open(":memory:");

		store.pageCache<string>().set("k", "body");

		expect(store.pageCache<string>().get("k")).toBe("body");
	});
});

describe("context store checkpoints", () => {
	it("puts the checkpointer on the same file as the cache", () => {
		const path = tempPath();
		const store = open(path);
		store.pageCache<string>().set("k", "body");

		// A second driver on the same file: the saver opens its own
		// better-sqlite3 connection, and WAL has to keep both usable.
		const checkpoints = openCheckpointSaver(path);
		try {
			expect(store.pageCache<string>().get("k")).toBe("body");
			store.pageCache<string>().set("after", "body");
			expect(store.pageCache<string>().get("after")).toBe("body");
		} finally {
			checkpoints.close();
		}

		const db = read(path);
		try {
			expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({
				journal_mode: "wal",
			});
		} finally {
			db.close();
		}
	});
});

describe("checkpointThreadId", () => {
	it("is stable across a ticker's day and changes with the day", () => {
		const morning = new Date(2026, 9, 21, 8, 0);
		const evening = new Date(2026, 9, 21, 22, 30);
		const tomorrow = new Date(2026, 9, 22, 8, 0);

		expect(checkpointThreadId("aapl", morning)).toBe("AAPL:2026-10-21");
		expect(checkpointThreadId("AAPL", evening)).toBe(
			checkpointThreadId("aapl", morning),
		);
		expect(checkpointThreadId("AAPL", tomorrow)).toBe("AAPL:2026-10-22");
	});
});

describe("context store runs", () => {
	const run = {
		id: "run-1",
		ticker: "AAPL",
		startedAt: 1_700_000_000_000,
		status: "complete",
		provider: "openai",
		model: "gpt-5",
	};

	it("records a run and its artifacts", () => {
		const path = tempPath();
		const store = open(path);

		store.recordRun({
			...run,
			artifacts: {
				analyst: { reports: [] },
				decision: { call: "Hold" },
			},
		});
		store.close();

		const db = read(path);
		try {
			const row = db
				.prepare(
					"SELECT ticker, started_at, status, created_at, updated_at, deleted_at FROM runs WHERE id = ?",
				)
				.get("run-1") as Record<string, unknown>;
			expect(row).toMatchObject({
				ticker: "AAPL",
				status: "complete",
				started_at: run.startedAt,
			});
			// Written once, after the run ends: `created_at` is the finish time,
			// so a duration is created_at - started_at.
			expect(row.created_at as number).toBeGreaterThan(run.startedAt);
			expect(row.updated_at).toBe(row.created_at);
			expect(row.deleted_at).toBeNull();

			const branches = db
				.prepare(
					`SELECT id, branch, payload, created_at, deleted_at FROM artifacts
					 WHERE run_id = ? ORDER BY branch`,
				)
				.all("run-1") as Record<string, unknown>[];
			expect(branches.map((entry) => entry.branch)).toEqual([
				"analyst",
				"decision",
			]);
			expect(branches.every((entry) => typeof entry.id === "string")).toBe(
				true,
			);
			expect(branches.every((entry) => entry.deleted_at === null)).toBe(true);
			expect(JSON.parse(branches[1].payload as string)).toEqual({
				call: "Hold",
			});
		} finally {
			db.close();
		}
	});

	it("skips artifacts the run never produced", () => {
		const path = tempPath();
		open(path).recordRun({
			...run,
			artifacts: { analyst: { reports: [] }, decision: undefined },
		});

		const db = read(path);
		try {
			const rows = db
				.prepare("SELECT branch FROM artifacts WHERE run_id = ?")
				.all("run-1") as { branch: string }[];
			expect(rows).toEqual([{ branch: "analyst" }]);
		} finally {
			db.close();
		}
	});

	it("reopens a file it has already written", () => {
		const path = tempPath();
		const first = open(path);
		first.recordRun({ ...run, artifacts: { decision: { call: "Hold" } } });
		first.close();

		// The schema is idempotent rather than versioned: opening the same file
		// again is a no-op, and the existing rows survive it.
		const second = open(path);
		second.recordRun({ ...run, artifacts: { decision: { call: "Buy" } } });

		const db = read(path);
		try {
			// The second write replaced the first branch row rather than
			// adding one: `artifacts_live_branch` is the conflict target.
			const rows = db
				.prepare("SELECT payload FROM artifacts WHERE run_id = ?")
				.all("run-1") as { payload: string }[];
			expect(rows).toHaveLength(1);
			expect(JSON.parse(rows[0].payload)).toEqual({ call: "Buy" });
		} finally {
			db.close();
		}
	});
});
