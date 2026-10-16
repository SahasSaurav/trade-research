import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import {
	GEOPOLITICAL_SUBAGENT_DESCRIPTION,
	GEOPOLITICAL_SYSTEM_PROMPT,
} from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import { geopoliticalResearchSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import {
	DENY_OUTSIDE_SKILL_FOLDER,
	REPO_ROOT,
	SKILLS_ROOT,
	SKILL_TOOLS,
} from "@src/workflows/skills.js";
import type { CompiledSubAgent, FilesystemPermission } from "deepagents";
import {
	FilesystemBackend,
	createFilesystemMiddleware,
	createSkillsMiddleware,
} from "deepagents";
import { createAgent, toolStrategy } from "langchain";

/** The one skill this subagent may read, passed directly so no sibling scan runs. */
const SKILL_DIR = `${SKILLS_ROOT}/geopolitical`;

/** Read-only inside the skill folder; the deny rule answers for the rest. */
const SKILL_PERMISSIONS: FilesystemPermission[] = [
	{ operations: ["read"], paths: [SKILL_DIR, `${SKILL_DIR}/**`] },
	{ ...DENY_OUTSIDE_SKILL_FOLDER },
];

/**
 * Geopolitical subagent, complete with its own identity, prompt, schema and
 * skill, ready to hand to the orchestrator's `subagents` list. Built as a
 * compiled runnable (not a declarative spec) to keep the structured
 * `responseFormat`, which a declarative spec does not support; the read-only
 * filesystem it needs to load its skill is added explicitly, since a compiled
 * runnable does not get deepagents' default stack.
 */
function createGeopoliticalSubagent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}): CompiledSubAgent {
	const backend = new FilesystemBackend({
		rootDir: REPO_ROOT,
		virtualMode: true,
	});

	return {
		name: "geopolitical",
		description: GEOPOLITICAL_SUBAGENT_DESCRIPTION,
		runnable: createAgent({
			model: deps.model,
			tools: [deps.search],
			systemPrompt: GEOPOLITICAL_SYSTEM_PROMPT,
			responseFormat: toolStrategy(geopoliticalResearchSchema),
			middleware: [
				createFilesystemMiddleware({
					backend,
					tools: SKILL_TOOLS,
					permissions: SKILL_PERMISSIONS,
				}),
				createSkillsMiddleware({ backend, sources: [`${SKILL_DIR}/`] }),
			],
		}),
	};
}

export { createGeopoliticalSubagent };
