import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilyExtract, TavilySearch } from "@langchain/tavily";
import { FINANCIALS_SYSTEM_PROMPT } from "@src/features/financials/prompt.js";
import { financialsSchema } from "@src/features/financials/schema.js";
import {
	computeValuationMultiples,
	yahooFundamentals,
	yahooInsiderTransactions,
	yahooStatements,
} from "@src/features/financials/tool.js";
import { yahooQuote } from "@src/features/market/tool.js";
import { COMPACTION_SUMMARY_PROMPT } from "@src/utils/compaction.js";
import {
	DENY_OUTSIDE_SKILL_FOLDER,
	REPO_ROOT,
	SKILLS_ROOT,
	SKILL_TOOLS,
} from "@src/workflows/skills.js";
import type { BackendProtocolV2, FilesystemPermission } from "deepagents";
import {
	FilesystemBackend,
	createDeepAgent,
	createFilesystemMiddleware,
	createSummarizationMiddleware,
} from "deepagents";
import { toolStrategy } from "langchain";

/** The one skill this agent may read, passed directly so no sibling scan runs. */
const SKILL_DIR = `${SKILLS_ROOT}/financials`;

/** Read-only inside the skill folder; the deny rule answers for the rest. */
const SKILL_PERMISSIONS: FilesystemPermission[] = [
	{ operations: ["read"], paths: [SKILL_DIR, `${SKILL_DIR}/**`] },
	{ ...DENY_OUTSIDE_SKILL_FOLDER },
];

function createFinancialsAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
	extract: TavilyExtract;
	/** When to compact the transcript, and how much to keep verbatim. */
	compaction: { triggerTokens: number; keepMessages: number };
	/** Where evicted turns go; the skill backend answers when unset. */
	history?: BackendProtocolV2;
	/** A cheaper model for the summary; this agent's own when unset. */
	summarizer?: BaseChatModel;
}) {
	const files = new FilesystemBackend({
		rootDir: REPO_ROOT,
		virtualMode: true,
	});

	return createDeepAgent({
		model: deps.model,
		tools: [
			deps.search,
			computeValuationMultiples,
			// Yahoo supplies the filed numbers; search supplies the filing and
			// the second source the skill's reconciliation rule requires.
			yahooQuote,
			yahooFundamentals,
			yahooStatements,
			yahooInsiderTransactions,
			// Search locates the filing or the IR page; this reads it, so the
			// figure is checked against the document rather than a snippet.
			deps.extract,
		],
		systemPrompt: FINANCIALS_SYSTEM_PROMPT,
		responseFormat: toolStrategy(financialsSchema),
		middleware: [
			// Replaces deepagents' default stack, which mounts seven tools this
			// agent never calls; the skill is read by path.
			createFilesystemMiddleware({
				backend: files,
				tools: SKILL_TOOLS,
				permissions: SKILL_PERMISSIONS,
			}),
			// Explicit: deepagents waits for 85% of a published window and for a
			// fixed 170k tokens when the model has none, which no local model
			// reaches before overflowing. The prompt keeps the figures, because
			// compaction runs before the artifact is written.
			createSummarizationMiddleware({
				model: deps.summarizer,
				backend: deps.history ?? files,
				historyPathPrefix: "/.cache/conversation-history",
				summaryPrompt: COMPACTION_SUMMARY_PROMPT,
				trigger: { type: "tokens", value: deps.compaction.triggerTokens },
				keep: { type: "messages", value: deps.compaction.keepMessages },
			}),
		],
		backend: files,
		skills: [`${SKILL_DIR}/`],
	});
}

export { createFinancialsAgent };
