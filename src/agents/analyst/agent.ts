import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilyExtract, TavilySearch } from "@langchain/tavily";
import { ANALYST_SYSTEM_PROMPT } from "@src/agents/analyst/prompt.js";
import { analystReportSchema } from "@src/agents/analyst/schema.js";
import { yahooAnalystConsensus } from "@src/agents/analyst/tool.js";
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
const SKILL_DIR = `${SKILLS_ROOT}/analyst`;

/** Read-only inside the skill folder; the deny rule answers for the rest. */
const SKILL_PERMISSIONS: FilesystemPermission[] = [
	{ operations: ["read"], paths: [SKILL_DIR, `${SKILL_DIR}/**`] },
	{ ...DENY_OUTSIDE_SKILL_FOLDER },
];

function createAnalystAgent(deps: {
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
			// Yahoo gives the consensus, the target spread and a dated list of
			// rating actions; search is still the only way to read a firm's own
			// note, which is what the schema records.
			yahooAnalystConsensus,
			// Search finds the note, this reads it: the skill grades every
			// report on the body, so the body has to be readable.
			deps.extract,
		],
		systemPrompt: ANALYST_SYSTEM_PROMPT,
		responseFormat: toolStrategy(analystReportSchema),
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

export { createAnalystAgent };
