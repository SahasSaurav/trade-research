import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import {
	NEWS_SENTIMENT_SUBAGENT_DESCRIPTION,
	NEWS_SENTIMENT_SYSTEM_PROMPT,
} from "@src/features/sentiment/subagents/news-sentiment/prompt.js";
import { newsSentimentResearchSchema } from "@src/features/sentiment/subagents/news-sentiment/schema.js";
import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
} from "@src/workflows/agent-guard.js";
import type { CompiledSubAgent } from "deepagents";
import { createAgent, toolStrategy } from "langchain";

/**
 * News-sentiment subagent, complete with its own identity, prompt, schema and
 * guard middleware, ready to hand to the orchestrator's `subagents` list. Built
 * as a compiled runnable (not a declarative spec) so it does not inherit
 * deepagents' default filesystem and summarization middleware.
 */
function createNewsSentimentSubagent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
}): CompiledSubAgent {
	return {
		name: "news_sentiment",
		description: NEWS_SENTIMENT_SUBAGENT_DESCRIPTION,
		runnable: createAgent({
			model: deps.model,
			tools: [deps.search],
			systemPrompt: NEWS_SENTIMENT_SYSTEM_PROMPT,
			responseFormat: toolStrategy(newsSentimentResearchSchema),
			middleware: agentGuardMiddleware(),
		}).withConfig(AGENT_GUARD_CONFIG),
	};
}

export { createNewsSentimentSubagent };
