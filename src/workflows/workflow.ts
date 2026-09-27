import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogle } from "@langchain/google";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { TavilySearch } from "@langchain/tavily";

import { loadConfig } from "@src/config/config.js";
import { createAnalystAgent } from "@src/features/analyst/agent.js";
import { createDecisionAgent } from "@src/features/decision/agent.js";
import { createSearchTool } from "@src/features/search/tool.js";
import { createGeopoliticalAgent } from "@src/features/sentiment/subagents/geopolitical/agent.js";
import { createNewsSentimentAgent } from "@src/features/sentiment/subagents/news-sentiment/agent.js";
import { createSummaryAgent } from "@src/features/summary/agent.js";
import { createValuationAgent } from "@src/features/valuation/agent.js";
import { createGraph, type GraphAgents } from "@src/workflows/graph.js";

type WorkflowDeps = {
	model: BaseChatModel;
	referenceSearch: TavilySearch;
	newsSearch: TavilySearch;
	agents: GraphAgents;
};

/**
 * One model instance is shared by all six agents, so anything dropped here is
 * dropped pipeline-wide. temperature used to reach only two of the four
 * providers, leaving MODEL_TEMPERATURE ignored on openai and xai — a cost bug,
 * since a hot temperature on a zod-constrained extraction buys malformed
 * output, and malformed output routes the analyst into a repair run.
 */
function createModel(config: ReturnType<typeof loadConfig>): BaseChatModel {
	switch (config.model.provider) {
		case "openai":
			return new ChatOpenAI({
				model: config.model.name,
				apiKey: config.openai.apiKey,
				temperature: config.model.temperature,
			});
		case "xai":
			return new ChatOpenAI({
				model: config.model.name,
				apiKey: config.xai.apiKey,
				temperature: config.model.temperature,
				configuration: {
					baseURL: "https://api.x.ai/v1",
				},
			});
		case "google-genai":
			return new ChatGoogle({
				model: config.model.name,
				apiKey: config.google.apiKey,
				temperature: config.model.temperature,
			});
		default:
			return new ChatOllama({
				model: config.model.name,
				baseUrl: config.ollama.baseUrl,
				temperature: config.model.temperature,
				numCtx: config.ollama.numCtx,
			});
	}
}

function createWorkflow(deps: Partial<WorkflowDeps> = {}) {
	const config = loadConfig();

	const model = deps.model ?? createModel(config);

	/**
	 * Two tools, because a publication-date filter is right for one pair of
	 * agents and actively harmful for the other.
	 *
	 * The news subagents want the last day, and timeRange "day" gives them
	 * that. The valuation and analyst agents want SEC filings, statistics pages
	 * and broker research, none of which are *published* within 24 hours — a
	 * one-day filter returned a Yahoo Finance page for TSLA, a Telecom Italia
	 * quote and a YouTube video, so the model never found a price or an EPS
	 * figure, burned its whole call budget searching, and the valuation
	 * artifact came back empty. Their own prompts ask for a 90-day window, so
	 * they get no filter at all.
	 *
	 * The result size is a token budget, not a relevance dial. A ReAct agent
	 * appends every tool result to its message list and re-sends that list on
	 * each remaining model call, so a search payload is not billed once — it is
	 * billed once per remaining call in the loop, up to MAX_MODEL_CALLS. At
	 * 8 results x 3 chunks that is roughly 4-6K tokens of duplicated payload
	 * re-sent 5-15 times, which dwarfs the 589-word valuation prompt it sits
	 * next to.
	 *
	 * 5 results keeps the same breadth of sources to choose from; the
	 * chunksPerSource cut is the sharper one because it does not reduce how
	 * many distinct sources the agent can find, only how much of each it reads.
	 * The trade is that a low-scoring page may no longer contain the number
	 * the prompt demands, so the model rephrases and searches again — more
	 * model calls in exchange for far smaller ones. This is the one setting
	 * here that trades calls for tokens rather than saving outright, so it
	 * needs per-node token counts and call counts from a real run to confirm
	 * the net effect; the values below are reasoned, not measured. If calls
	 * climb more than tokens drop, raise chunksPerSource back toward 2 before
	 * touching maxResults.
	 *
	 * chunksPerSource is only honoured at searchDepth "advanced", so it is set
	 * here and deliberately not on newsSearch, where Tavily ignores it.
	 */
	const referenceSearch =
		deps.referenceSearch ??
		createSearchTool({
			tavilyApiKey: config.tavily.apiKey,
			maxResults: config.search.reference.maxResults,
			chunksPerSource: config.search.reference.chunksPerSource,
			searchDepth: config.search.reference.searchDepth,
		});

	const newsSearch =
		deps.newsSearch ??
		createSearchTool({
			tavilyApiKey: config.tavily.apiKey,
			maxResults: config.search.news.maxResults,
			timeRange: config.search.news.timeRange,
		});

	const valuationAgent =
		deps.agents?.valuation ??
		createValuationAgent({ model, search: referenceSearch });
	const analystAgent =
		deps.agents?.analyst ??
		createAnalystAgent({ model, search: referenceSearch });
	const newsSentimentAgent =
		deps.agents?.newsSentiment ??
		createNewsSentimentAgent({ model, search: newsSearch });
	const geopoliticalAgent =
		deps.agents?.geopolitical ??
		createGeopoliticalAgent({ model, search: newsSearch });
	const decisionAgent = deps.agents?.decision ?? createDecisionAgent({ model });
	const summaryAgent = deps.agents?.summary ?? createSummaryAgent({ model });

	const workflow = createGraph(
		{
			valuation: valuationAgent,
			analyst: analystAgent,
			newsSentiment: newsSentimentAgent,
			geopolitical: geopoliticalAgent,
			decision: decisionAgent,
			summary: summaryAgent,
			tickerSearch: referenceSearch,
		},
		{
			maxAnalystAttempts: config.budgets.analystAttempts,
			researchAttempts: config.budgets.researchAttempts,
		},
	);

	return {
		model,
		referenceSearch,
		newsSearch,
		valuationAgent,
		analystAgent,
		newsSentimentAgent,
		geopoliticalAgent,
		decisionAgent,
		summaryAgent,
		workflow,
	};
}

export type { WorkflowDeps };
export { createModel, createWorkflow };
