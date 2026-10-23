import { join } from "node:path";

import {
	COMPACTION_SUMMARY_PROMPT,
	createHistoryBackend,
} from "@src/utils/compaction.js";
import {
	type ContextStore,
	openContextStore,
} from "@src/utils/context-store.js";
import { afterEach, describe, expect, it } from "vitest";

import { removeTempDirs, tempDir } from "./helpers.js";

/**
 * The summarizer drops turns from the transcript, so two things have to hold:
 * the prompt never lets a figure go missing quietly, and the evicted text is
 * still readable afterwards. The backend tests pin the second: it is what the
 * middleware writes through, and an offload that silently empty-reads would
 * start the history over instead of appending to it.
 */

const PATH = "/.cache/conversation-history/AMZN:2026-10-23.md";

let stores: ContextStore[] = [];

function openStore(): ContextStore {
	const store = openContextStore({
		path: join(tempDir("history-"), "context.db"),
		pageTtlMs: 12 * 60 * 60 * 1000,
	});
	stores.push(store);
	return store;
}

afterEach(() => {
	for (const store of stores) {
		try {
			store.close();
		} catch {
			// Already closed by the test.
		}
	}
	stores = [];
	removeTempDirs();
});

/** The text a backend read returned, asserted rather than cast. */
async function readText(
	backend: ReturnType<typeof createHistoryBackend>,
	path: string,
): Promise<string> {
	const { content } = await backend.read(path);
	if (typeof content !== "string") throw new Error(`${path} is not text`);
	return content;
}

describe("compaction summary prompt", () => {
	it("keeps the placeholder the middleware substitutes", () => {
		// `replace("{conversation}", ...)` is a no-op without it: the summarizer
		// would be asked to summarise nothing and would invent a summary.
		expect(COMPACTION_SUMMARY_PROMPT).toContain("{conversation}");
	});

	it("forbids inventing a figure, a date or a URL", () => {
		expect(COMPACTION_SUMMARY_PROMPT).toMatch(/never invent/i);
	});
});

describe("history backend", () => {
	it("reads back what the middleware wrote", async () => {
		const backend = createHistoryBackend(openStore().history);

		backend.write(
			PATH,
			"## Summarized at 2026-10-23\n\nrevenue 638,959 million, FY2025",
		);

		expect(await readText(backend, PATH)).toContain("638,959 million");
		expect((await backend.read(PATH)).totalLines).toBe(3);
	});

	it("appends by downloading and uploading, as the middleware does", async () => {
		const backend = createHistoryBackend(openStore().history);
		backend.write(PATH, "first section");

		const [existing] = (await backend.downloadFiles?.([PATH])) ?? [];
		if (!existing?.content) throw new Error("the history was not found");
		const previous = new TextDecoder().decode(existing.content);
		await backend.uploadFiles?.([
			[PATH, new TextEncoder().encode(`${previous}\n\nsecond section`)],
		]);

		const content = await readText(backend, PATH);
		expect(content).toContain("first section");
		expect(content).toContain("second section");
	});

	it("reports a missing document as an error, not as empty content", async () => {
		const backend = createHistoryBackend(openStore().history);

		// An empty read would append the next section to nothing and lose the
		// history silently; the middleware's warning depends on the error.
		expect(await backend.read("/nope.md")).toEqual({
			error: "file_not_found",
		});
		expect(await backend.downloadFiles?.(["/nope.md"])).toEqual([
			{ path: "/nope.md", content: null, error: "file_not_found" },
		]);
	});

	it("keeps the two writers on one row per path", () => {
		const store = openStore();
		const backend = createHistoryBackend(store.history);

		backend.write(PATH, "first");
		backend.write(PATH, "second");

		expect(store.history.list(PATH)).toHaveLength(1);
		expect(store.history.read(PATH)).toBe("second");
	});
});
