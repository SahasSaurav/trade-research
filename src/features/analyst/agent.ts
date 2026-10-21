import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilyExtract, TavilySearch } from "@langchain/tavily";
import { ANALYST_SYSTEM_PROMPT } from "@src/features/analyst/prompt.js";
import { analystReportSchema } from "@src/features/analyst/schema.js";
import { yahooAnalystConsensus } from "@src/features/analyst/tool.js";
import {
	DENY_OUTSIDE_SKILL_FOLDER,
	REPO_ROOT,
	SKILLS_ROOT,
} from "@src/workflows/skills.js";
import type { FilesystemPermission } from "deepagents";
import { FilesystemBackend, createDeepAgent } from "deepagents";
import { todoListMiddleware, toolStrategy } from "langchain";

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
}) {
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
		middleware: [todoListMiddleware()],
		backend: new FilesystemBackend({ rootDir: REPO_ROOT, virtualMode: true }),
		skills: [`${SKILL_DIR}/`],
		permissions: SKILL_PERMISSIONS,
	});
}

export { createAnalystAgent };
