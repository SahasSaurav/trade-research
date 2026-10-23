import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { UrlCache } from "@src/utils/url-cache.js";
import Database from "better-sqlite3";

/**
 * The context store: one SQLite file holding what a run learns and what it
 * cites.
 *
 * Two things live here, and they are kept apart on purpose.
 *
 * `pages` is the read-through cache behind `open_url`. It is derived data with
 * a short life: a page fetched for a branch is free for the branches that run
 * beside it (they share one reader), and free again for a re-run started within
 * the ttl — which is what makes a crashed run cheap to resume. A stale entry is
 * the only failure mode that matters, so freshness is a row-level column and
 * every read filters on it.
 *
 * `runs` and `artifacts` are the record: one row per finished run, one row per
 * branch artifact. They are written once, never read by the pipeline, and exist
 * so a decision can be traced back to the evidence it was made from. Nothing in
 * the graph depends on them — a run with the store disabled produces identical
 * artifacts, which is what keeps runs reproducible.
 *
 * `history` is the conversation a research agent's summarizer replaced, one row
 * per document. It is offloaded transport, not evidence: the artifact and its
 * cited URLs are the output, and the history exists so the audit trail includes
 * what was dropped and an operator can read it back. With the store off, the
 * middleware writes the same document to a file under `.cache/` instead.
 *
 * `checkpoints` and `writes` are LangGraph's own tables, created by its SQLite
 * saver on the same file. They are what makes a crashed run resumable: the
 * nodes that already ran are not paid for twice. They are transient — a run
 * that finishes clears its thread — while the page cache and the run record
 * survive it.
 *
 * SQLite rather than a server: the cache is local, small and single-writer, and
 * `node:sqlite` is built into Node. A networked store would add a service to a
 * CLI that has none, and an async cache interface where a synchronous one is
 * free.
 *
 * The store is derived data, so it fails open. A write that does not land is a
 * cache miss on the next read, not an error in the tool; a page that cannot be
 * parsed is dropped. Only the initial open is loud, because a store that cannot
 * be opened is a misconfiguration worth seeing at startup.
 *
 * ## Rows are never hard-deleted
 *
 * Every table this module creates carries `id`, `created_at`, `updated_at` and
 * `deleted_at`, and a delete is a tombstone: `deleted_at` and `updated_at` are
 * set and the row stays. Expiry, eviction and `clear()` all go through that
 * path. LangGraph's `checkpoints`/`writes` do not — that schema is the saver's
 * to own, and its rows are cleared by thread when a run finishes.
 *
 * The reason is that this file is also the audit trail. A page that fell out of
 * the cache, or a cache that a run cleared, is a fact about the run worth being
 * able to read back — "why did this run refetch that URL?" has an answer if the
 * tombstone is there and none if the row was dropped. Rows are also cheap: a
 * page is a few KB and a bounded cache only ever strands `maxPageEntries` of
 * them per expiry cycle.
 *
 * The cost is that uniques have to exclude tombstones, so each natural key is a
 * partial index (`WHERE deleted_at IS NULL`) rather than a column constraint,
 * and every upsert names that index as its conflict target. A key that is
 * written again after its row was tombstoned gets a new row and a new id: the
 * old one records what was served before, the new one what is served now.
 *
 * Reclaiming space is deliberately not automatic. `DELETE FROM pages WHERE
 * deleted_at < ?` is the operator's call, and a cache evicting its own history
 * makes the tombstone pointless.
 */

/**
 * The tables this module owns. No version column and no migration path: the
 * store is derived data that a run can rebuild, so a schema change is a deleted
 * file rather than a migration to maintain. `IF NOT EXISTS` is what makes
 * opening an existing file a no-op.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
	id         TEXT PRIMARY KEY,
	key        TEXT    NOT NULL,
	payload    TEXT    NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	deleted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS pages_live_key
	ON pages(key) WHERE deleted_at IS NULL;

-- A run row is written once, after the run ends, so created_at is the finish
-- time: there is no second finished_at column to drift from it. started_at is
-- the only other clock, and it is minutes earlier by definition.
CREATE TABLE IF NOT EXISTS runs (
	id          TEXT PRIMARY KEY,
	ticker      TEXT    NOT NULL,
	started_at  INTEGER NOT NULL,
	status      TEXT    NOT NULL,
	provider    TEXT    NOT NULL,
	model       TEXT    NOT NULL,
	created_at  INTEGER NOT NULL,
	updated_at  INTEGER NOT NULL,
	deleted_at  INTEGER
);

CREATE TABLE IF NOT EXISTS artifacts (
	id         TEXT PRIMARY KEY,
	run_id     TEXT    NOT NULL REFERENCES runs(id),
	branch     TEXT    NOT NULL,
	payload    TEXT    NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	deleted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_live_branch
	ON artifacts(run_id, branch) WHERE deleted_at IS NULL;

-- The conversation a summarizer replaced, one row per history path. Same kind
-- of thing as a cached page: derived, re-readable, and only useful while the
-- run that wrote it is still worth resuming. The path is the virtual one the
-- middleware names, so a second compaction appends to the same document.
CREATE TABLE IF NOT EXISTS history (
	id         TEXT PRIMARY KEY,
	path       TEXT    NOT NULL,
	content    TEXT    NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	deleted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS history_live_path
	ON history(path) WHERE deleted_at IS NULL;
`;

type ContextStoreOptions = {
	/** Path to the SQLite file. Its directory is created when missing. */
	path: string;
	/** How long a cached page stays fresh, in milliseconds. */
	pageTtlMs: number;
	/** How many pages to keep before the oldest is retracted. */
	maxPageEntries?: number;
};

type RunRecord = {
	id: string;
	ticker: string;
	startedAt: number;
	status: string;
	provider: string;
	model: string;
	artifacts: Record<string, unknown>;
};

/** One offloaded conversation document, without its body. */
type HistoryEntry = {
	path: string;
	bytes: number;
	createdAt: number;
	updatedAt: number;
};

type ContextStore = {
	/** The `open_url` cache, backed by the `pages` table. */
	pageCache<T>(): UrlCache<T>;
	/**
	 * The conversation a research agent's summarizer replaced with a summary.
	 * The agent never reads it back through a tool — it exists so the run can
	 * be audited and an operator can see what was dropped, and so the history
	 * lives in the same file as everything else the run derived.
	 */
	history: {
		read(path: string): string | undefined;
		write(path: string, content: string): void;
		/** Entries whose path starts with `prefix`, newest first. */
		list(prefix: string): HistoryEntry[];
	};
	/** Records a finished run and its artifacts in one transaction. */
	recordRun(run: RunRecord): void;
	close(): void;
};

/**
 * The graph's checkpointer, backed by the same file.
 *
 * The two drivers are not an accident. The cache and the run record want a
 * synchronous, dependency-free handle and `node:sqlite` gives one; the
 * checkpointer wants LangGraph's own saver, which takes a `better-sqlite3`
 * connection and brings the checkpoint/writes schema and its serialisation with
 * it. Both are SQLite connections to one file, which is what WAL and a busy
 * timeout are for.
 */
type CheckpointStore = {
	saver: SqliteSaver;
	close(): void;
};

const DEFAULT_MAX_PAGE_ENTRIES = 256;

/**
 * The persistent half of the page cache.
 *
 * Exposed as the same `UrlCache<T>` the in-memory cache implements, so the tool
 * cannot tell which one it holds. Values are stored as JSON: the cache is
 * single-purpose today, and a schema per value shape would buy nothing but a
 * migration each time a field is added.
 */
function sqlitePageCache<T>(
	db: DatabaseSync,
	ttlMs: number,
	maxEntries: number,
): UrlCache<T> {
	const select = db.prepare(
		`SELECT payload FROM pages
		 WHERE key = ? AND deleted_at IS NULL AND updated_at >= ?`,
	);
	const upsert = db.prepare(
		`INSERT INTO pages
		 (id, key, payload, created_at, updated_at, deleted_at)
		 VALUES (?, ?, ?, ?, ?, NULL)
		 ON CONFLICT(key) WHERE deleted_at IS NULL
		 DO UPDATE SET payload    = excluded.payload,
		               updated_at = excluded.updated_at`,
	);
	// Retraction, not deletion: a page that went stale or fell out of the bound
	// is tombstoned so the record of what the cache held survives it.
	const retract = db.prepare(
		`UPDATE pages SET deleted_at = ?, updated_at = ?
		 WHERE deleted_at IS NULL AND updated_at < ?`,
	);
	const retractBeyondBound = db.prepare(
		// `rowid` breaks ties: a burst of writes lands in the same millisecond,
		// and without it the "oldest" row would be arbitrary.
		`UPDATE pages SET deleted_at = ?, updated_at = ?
		 WHERE deleted_at IS NULL AND rowid NOT IN (
			SELECT rowid FROM pages
			WHERE deleted_at IS NULL
			ORDER BY updated_at DESC, rowid DESC
			LIMIT ?
		 )`,
	);
	const retractAll = db.prepare(
		"UPDATE pages SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL",
	);
	const count = db.prepare(
		`SELECT COUNT(*) AS n FROM pages
		 WHERE deleted_at IS NULL AND updated_at >= ?`,
	);

	const cutoff = () => Date.now() - ttlMs;

	return {
		get(key) {
			try {
				const row = select.get(key, cutoff()) as
					| { payload: string }
					| undefined;
				// A row that no longer parses is a miss, not a render error: the
				// value shape changed under the ttl, and the next read refills it.
				return row ? (JSON.parse(row.payload) as T) : undefined;
			} catch {
				return undefined;
			}
		},
		set(key, value) {
			try {
				const now = Date.now();
				upsert.run(randomUUID(), key, JSON.stringify(value), now, now);
				// Written before the sweeps so the page just stored is inside the
				// bound rather than the first row evicted by it.
				retract.run(now, now, now - ttlMs);
				retractBeyondBound.run(now, now, maxEntries);
			} catch {
				// A cache write that does not land costs a refetch later. It is
				// never worth failing the page read that produced it.
			}
		},
		clear() {
			const now = Date.now();
			retractAll.run(now, now);
		},
		get size() {
			const row = count.get(cutoff()) as { n?: number } | undefined;
			return row?.n ?? 0;
		},
	};
}

function openContextStore(options: ContextStoreOptions): ContextStore {
	if (options.path !== ":memory:") {
		mkdirSync(dirname(options.path), { recursive: true });
	}

	const db = new DatabaseSync(options.path);
	// WAL lets a second run read while the first writes, which is the only
	// concurrency this store can meet.
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec(SCHEMA);

	const maxPageEntries = options.maxPageEntries ?? DEFAULT_MAX_PAGE_ENTRIES;

	const insertRun = db.prepare(
		`INSERT INTO runs
		 (id, ticker, started_at, status, provider, model,
		  created_at, updated_at, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
		 ON CONFLICT(id) DO UPDATE SET ticker     = excluded.ticker,
		                               started_at = excluded.started_at,
		                               status     = excluded.status,
		                               provider   = excluded.provider,
		                               model      = excluded.model,
		                               updated_at = excluded.updated_at`,
	);
	const insertArtifact = db.prepare(
		`INSERT INTO artifacts
		 (id, run_id, branch, payload, created_at, updated_at, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?, NULL)
		 ON CONFLICT(run_id, branch) WHERE deleted_at IS NULL
		 DO UPDATE SET payload    = excluded.payload,
		               updated_at = excluded.updated_at`,
	);
	const selectHistory = db.prepare(
		"SELECT content FROM history WHERE path = ? AND deleted_at IS NULL",
	);
	const upsertHistory = db.prepare(
		`INSERT INTO history
		 (id, path, content, created_at, updated_at, deleted_at)
		 VALUES (?, ?, ?, ?, ?, NULL)
		 ON CONFLICT(path) WHERE deleted_at IS NULL
		 DO UPDATE SET content    = excluded.content,
		               updated_at = excluded.updated_at`,
	);
	// `substr` rather than `LIKE`: a path is data, and `%` or `_` inside one
	// must not turn into a wildcard.
	const listHistory = db.prepare(
		`SELECT path,
		        length(content) AS bytes,
		        created_at     AS createdAt,
		        updated_at     AS updatedAt
		 FROM history
		 WHERE substr(path, 1, length(?)) = ? AND deleted_at IS NULL
		 ORDER BY updated_at DESC, rowid DESC`,
	);

	return {
		pageCache<T>(): UrlCache<T> {
			return sqlitePageCache<T>(db, options.pageTtlMs, maxPageEntries);
		},
		history: {
			read(path) {
				const row = selectHistory.get(path) as { content: string } | undefined;
				return row?.content;
			},
			write(path, content) {
				const now = Date.now();
				upsertHistory.run(randomUUID(), path, content, now, now);
			},
			list(prefix) {
				return listHistory.all(prefix, prefix) as HistoryEntry[];
			},
		},
		recordRun(run) {
			const now = Date.now();
			// One transaction: a run without its artifacts is a row that lies
			// about what is on disk.
			db.exec("BEGIN");
			try {
				insertRun.run(
					run.id,
					run.ticker,
					run.startedAt,
					run.status,
					run.provider,
					run.model,
					now,
					now,
				);
				for (const [branch, artifact] of Object.entries(run.artifacts)) {
					if (artifact === undefined) continue;
					insertArtifact.run(
						randomUUID(),
						run.id,
						branch,
						JSON.stringify(artifact),
						now,
						now,
					);
				}
				db.exec("COMMIT");
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		},
		close() {
			db.close();
		},
	};
}

/**
 * Opens the graph's checkpoint store on the same file as the context store.
 *
 * LangGraph creates the `checkpoints`/`writes` tables itself on first use, so
 * there is nothing to migrate here — this only makes the second connection and
 * hands it to the saver.
 */
function openCheckpointSaver(path: string): CheckpointStore {
	const db = new Database(path);
	db.pragma("journal_mode = WAL");
	// The cache may be writing when a node checkpoints; wait for it rather than
	// failing a node that has already paid for its model calls.
	db.pragma("busy_timeout = 5000");

	return { saver: new SqliteSaver(db), close: () => db.close() };
}

/**
 * The thread a run resumes on: one per ticker per local day.
 *
 * A run that crashed picks up where it stopped when it is started again the
 * same day; the next day is a new run, because yesterday's evidence is not what
 * this pipeline is being asked about. The id stays readable on purpose — a
 * leftover checkpoint row should say which run it belongs to.
 */
function checkpointThreadId(ticker: string, at = new Date()): string {
	const day = [at.getFullYear(), at.getMonth() + 1, at.getDate()]
		.map((part) => String(part).padStart(2, "0"))
		.join("-");
	return `${ticker.toUpperCase()}:${day}`;
}

export type {
	CheckpointStore,
	ContextStore,
	ContextStoreOptions,
	HistoryEntry,
	RunRecord,
};
export { checkpointThreadId, openCheckpointSaver, openContextStore };
