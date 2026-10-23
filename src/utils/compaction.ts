import type { ContextStore, HistoryEntry } from "@src/utils/context-store.js";
import type { BackendProtocolV2, FileInfo } from "deepagents";

/**
 * What the summarizer is told to keep.
 *
 * deepagents' default prompt asks for a "concise summary of the conversation",
 * which is right for a chat and wrong here: compaction happens *before* the
 * agent writes its structured artifact, so a figure the summary drops is a
 * figure the run can no longer report. The source URLs survive either way (the
 * skill records them), but the numbers they support do not — hence the rule to
 * carry figures verbatim instead of paraphrasing them, and the ban on rounding
 * or filling gaps.
 *
 * `{conversation}` is the middleware's placeholder; it replaces the token with
 * the evicted transcript and sends the result as one human message.
 */
const COMPACTION_SUMMARY_PROMPT = `You are compacting the transcript of an equity-research run so the agent can finish the job without the evicted turns. The agent will write its structured answer from what survives here, so a figure you drop is a figure it can no longer report.

Keep, each with the source it came from:
- Every figure exactly as read: its unit, currency, period and fiscal label. Write "revenue 638,959 million, FY2025", never "about 639 billion".
- Every rating, price target, firm and date, and every price level the agent established.
- Every URL a claim is attributed to, so the citation survives even when the prose does not.

Drop: search queries and the snippets they returned, page text already read and acted on, tool-call mechanics, and your own reasoning about what to do next.

Never invent, round or infer a number, a date or a URL. If it is not in the transcript, leave it out.

Conversation to summarize:
{conversation}

Summary:`;

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A history row as the file info a backend listing returns. */
const info = (entry: HistoryEntry): FileInfo => ({
	path: entry.path,
	size: entry.bytes,
	modified_at: new Date(entry.updatedAt).toISOString(),
});

/**
 * The offloaded conversation, stored as rows instead of files.
 *
 * The summarization middleware writes what it evicted through a backend, so a
 * store-backed history is a backend rather than a second writer. Only the
 * history path is ever used: this backend is passed to the middleware, never
 * mounted as an agent filesystem, so the listing and search methods exist to
 * satisfy the protocol rather than to serve a tool.
 *
 * A missing document is an error, not empty content: the middleware appends by
 * reading the previous document first, and an empty read would silently start
 * the history over.
 */
function createHistoryBackend(
	history: ContextStore["history"],
): BackendProtocolV2 {
	const find = (path: string): HistoryEntry | undefined =>
		history.list(path).find((entry) => entry.path === path);

	return {
		ls(path) {
			return { files: history.list(path).map(info) };
		},
		read(filePath, offset = 0, limit = 500) {
			const content = history.read(filePath);
			if (content === undefined) return { error: "file_not_found" };

			const lines = content.split("\n");
			return {
				content: lines.slice(offset, offset + limit).join("\n"),
				mimeType: "text/markdown",
				totalLines: lines.length,
			};
		},
		readRaw(filePath) {
			const content = history.read(filePath);
			const entry = find(filePath);
			if (content === undefined || entry === undefined) {
				return { error: "file_not_found" };
			}

			return {
				data: {
					content,
					mimeType: "text/markdown",
					created_at: new Date(entry.createdAt).toISOString(),
					modified_at: new Date(entry.updatedAt).toISOString(),
				},
			};
		},
		write(filePath, content) {
			history.write(filePath, content);
			return { path: filePath };
		},
		edit(filePath, oldString, newString, replaceAll = false) {
			const content = history.read(filePath);
			if (content === undefined) return { error: "file_not_found" };
			if (!content.includes(oldString)) return { error: "string_not_found" };

			const occurrences = content.split(oldString).length - 1;
			const next = replaceAll
				? content.split(oldString).join(newString)
				: content.replace(oldString, newString);
			history.write(filePath, next);

			return { path: filePath, occurrences: replaceAll ? occurrences : 1 };
		},
		grep(pattern, path) {
			const matches = history
				.list(path ?? "/")
				.flatMap((entry) =>
					(history.read(entry.path) ?? "")
						.split("\n")
						.flatMap((text, index) =>
							text.includes(pattern)
								? [{ path: entry.path, line: index + 1, text }]
								: [],
						),
				);
			return { matches };
		},
		glob(pattern) {
			// Every row is one document in one directory; the pattern is a name
			// match, because there is no tree here to walk.
			const name = pattern.slice(pattern.lastIndexOf("/") + 1);
			const expression = new RegExp(
				`^${name
					.replace(/[.+^${}()|[\]\\]/g, "\\$&")
					.replace(/\*/g, ".*")
					.replace(/\?/g, ".")}$`,
			);
			return {
				files: history
					.list("/")
					.filter((entry) => expression.test(entry.path.split("/").pop() ?? ""))
					.map(info),
			};
		},
		uploadFiles(files) {
			return files.map(([filePath, bytes]) => {
				history.write(filePath, decode(bytes));
				return { path: filePath, error: null };
			});
		},
		downloadFiles(paths) {
			return paths.map((filePath) => {
				const content = history.read(filePath);
				return content === undefined
					? { path: filePath, content: null, error: "file_not_found" as const }
					: { path: filePath, content: encode(content), error: null };
			});
		},
	};
}

export { COMPACTION_SUMMARY_PROMPT, createHistoryBackend };
