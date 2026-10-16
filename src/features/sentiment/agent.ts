import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import {
	GEOPOLITICAL_SUBAGENT_DESCRIPTION,
	NEWS_SENTIMENT_SUBAGENT_DESCRIPTION,
	SENTIMENT_SYSTEM_PROMPT,
} from "@src/features/sentiment/prompt.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { createGeopoliticalAgent } from "@src/features/sentiment/subagents/geopolitical/agent.js";
import { createNewsSentimentAgent } from "@src/features/sentiment/subagents/news-sentiment/agent.js";
import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
} from "@src/workflows/agent-guard.js";
import { createDeepAgent } from "deepagents";
import { toolStrategy } from "langchain";

/**
 * One orchestrator over two native subagents. The subagents keep their own
 * structured schemas and guard middleware, so the orchestrator only collects
 * their cited evidence and returns the sentiment artifact.
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
			{
				name: "news_sentiment",
				description: NEWS_SENTIMENT_SUBAGENT_DESCRIPTION,
				runnable: createNewsSentimentAgent(deps),
			},
			{
				name: "geopolitical",
				description: GEOPOLITICAL_SUBAGENT_DESCRIPTION,
				runnable: createGeopoliticalAgent(deps),
			},
		],
	}).withConfig(AGENT_GUARD_CONFIG);
}

export { createSentimentAgent };
