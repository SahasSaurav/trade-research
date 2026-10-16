import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/prompt.js";
import { sentimentResearchSchema } from "@src/features/sentiment/schema.js";
import { createGeopoliticalSubagent } from "@src/features/sentiment/subagents/geopolitical/agent.js";
import { createNewsSentimentSubagent } from "@src/features/sentiment/subagents/news-sentiment/agent.js";
import {
	DENY_OUTSIDE_SKILL_FOLDER,
	REPO_ROOT,
	SKILLS_ROOT,
} from "@src/workflows/skills.js";
import type { FilesystemPermission } from "deepagents";
import { FilesystemBackend, createDeepAgent } from "deepagents";
import { todoListMiddleware, toolStrategy } from "langchain";

/** The one skill this agent may read, passed directly so no sibling scan runs. */
const SKILL_DIR = `${SKILLS_ROOT}/sentiment`;

/** Read-only inside the skill folder; the deny rule answers for the rest. */
const SKILL_PERMISSIONS: FilesystemPermission[] = [
	{ operations: ["read"], paths: [SKILL_DIR, `${SKILL_DIR}/**`] },
	DENY_OUTSIDE_SKILL_FOLDER,
];

/**
 * One orchestrator over two native subagents. Each subagent owns its identity,
 * prompt, schema and skill, so the orchestrator only collects their cited
 * evidence and returns the research artifact.
 */
function createSentimentAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}) {
	return createDeepAgent({
		model: deps.model,
		systemPrompt: SENTIMENT_SYSTEM_PROMPT,
		responseFormat: toolStrategy(sentimentResearchSchema),
		middleware: [todoListMiddleware()],
		backend: new FilesystemBackend({ rootDir: REPO_ROOT, virtualMode: true }),
		skills: [`${SKILL_DIR}/`],
		permissions: SKILL_PERMISSIONS,
		subagents: [
			createNewsSentimentSubagent(deps),
			createGeopoliticalSubagent(deps),
		],
	});
}

export { createSentimentAgent };
