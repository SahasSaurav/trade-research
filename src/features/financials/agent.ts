import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { FINANCIALS_SYSTEM_PROMPT } from "@src/features/financials/prompt.js";
import { financialsSchema } from "@src/features/financials/schema.js";
import {
	computeValuationMultiples,
	yahooFundamentals,
	yahooInsiderTransactions,
	yahooStatements,
} from "@src/features/financials/tool.js";
import { yahooQuote } from "@src/features/market/tool.js";
import {
	DENY_OUTSIDE_SKILL_FOLDER,
	REPO_ROOT,
	SKILLS_ROOT,
} from "@src/workflows/skills.js";
import type { FilesystemPermission } from "deepagents";
import { FilesystemBackend, createDeepAgent } from "deepagents";
import { todoListMiddleware, toolStrategy } from "langchain";

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
}) {
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
		],
		systemPrompt: FINANCIALS_SYSTEM_PROMPT,
		responseFormat: toolStrategy(financialsSchema),
		middleware: [todoListMiddleware()],
		backend: new FilesystemBackend({ rootDir: REPO_ROOT, virtualMode: true }),
		skills: [`${SKILL_DIR}/`],
		permissions: SKILL_PERMISSIONS,
	});
}

export { createFinancialsAgent };
