import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilyExtract, TavilySearch } from "@langchain/tavily";
import { SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/prompt.js";
import { sentimentResearchSchema } from "@src/features/sentiment/schema.js";
import { createGeopoliticalSubagent } from "@src/features/sentiment/subagents/geopolitical/agent.js";
import { createNewsSentimentSubagent } from "@src/features/sentiment/subagents/news-sentiment/agent.js";
import { createDeepAgent } from "deepagents";
import { todoListMiddleware, toolStrategy } from "langchain";

/**
 * One orchestrator over two native subagents. Each subagent owns its identity,
 * prompt, schema and skill, so the orchestrator only collects their cited
 * evidence and returns the research artifact.
 *
 * It deliberately has no skill of its own: the procedure belongs to the branches
 * that do the research, and delegation needs no how-to. Its prompt is the contract.
 */
function createSentimentAgent(deps: {
	model: BaseChatModel;
	search: TavilySearch;
	extract: TavilyExtract;
}) {
	return createDeepAgent({
		model: deps.model,
		systemPrompt: SENTIMENT_SYSTEM_PROMPT,
		responseFormat: toolStrategy(sentimentResearchSchema),
		middleware: [todoListMiddleware()],
		subagents: [
			createNewsSentimentSubagent(deps),
			createGeopoliticalSubagent(deps),
		],
	});
}

export { createSentimentAgent };
