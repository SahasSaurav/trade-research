import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/prompt.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { createGeopoliticalSubagent } from "@src/features/sentiment/subagents/geopolitical/agent.js";
import { createNewsSentimentSubagent } from "@src/features/sentiment/subagents/news-sentiment/agent.js";
import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
} from "@src/workflows/agent-guard.js";
import { createDeepAgent } from "deepagents";
import { toolStrategy } from "langchain";

/**
 * One orchestrator over two native subagents. Each subagent owns its identity,
 * prompt, schema and guard middleware, so the orchestrator only collects their
 * cited evidence and returns the sentiment artifact.
 */
function createSentimentAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}) {
	return createDeepAgent({
		model: deps.model,
		systemPrompt: SENTIMENT_SYSTEM_PROMPT,
		responseFormat: toolStrategy(sentimentSchema),
		middleware: agentGuardMiddleware(),
		subagents: [
			createNewsSentimentSubagent(deps),
			createGeopoliticalSubagent(deps),
		],
	}).withConfig(AGENT_GUARD_CONFIG);
}

export { createSentimentAgent };
