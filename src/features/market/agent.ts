import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { MARKET_SYSTEM_PROMPT } from "@src/features/market/prompt.js";
import { marketSchema } from "@src/features/market/schema.js";
import { yahooQuote, yahooTechnicals } from "@src/features/market/tool.js";
import {
	DENY_OUTSIDE_SKILL_FOLDER,
	REPO_ROOT,
	SKILLS_ROOT,
} from "@src/workflows/skills.js";
import type { FilesystemPermission } from "deepagents";
import { FilesystemBackend, createDeepAgent } from "deepagents";
import { todoListMiddleware, toolStrategy } from "langchain";

/** The one skill this agent may read, passed directly so no sibling scan runs. */
const SKILL_DIR = `${SKILLS_ROOT}/market`;

/** Read-only inside the skill folder; the deny rule answers for the rest. */
const SKILL_PERMISSIONS: FilesystemPermission[] = [
	{ operations: ["read"], paths: [SKILL_DIR, `${SKILL_DIR}/**`] },
	{ ...DENY_OUTSIDE_SKILL_FOLDER },
];

function createMarketAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}) {
	return createDeepAgent({
		model: deps.model,
		tools: [
			deps.search,
			// Every indicator is computed in code from Yahoo's bars, so the
			// agent quotes values instead of deriving them. Search is kept for
			// the independent price check the skill requires.
			yahooQuote,
			yahooTechnicals,
		],
		systemPrompt: MARKET_SYSTEM_PROMPT,
		responseFormat: toolStrategy(marketSchema),
		middleware: [todoListMiddleware()],
		backend: new FilesystemBackend({ rootDir: REPO_ROOT, virtualMode: true }),
		skills: [`${SKILL_DIR}/`],
		permissions: SKILL_PERMISSIONS,
	});
}

export { createMarketAgent };
