import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogle } from "@langchain/google";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { TavilySearch } from "@langchain/tavily";
import { loadConfig } from "@src/config/config.js";
import { createAnalystAgent } from "@src/features/analyst/agent.js";
import { createDebateAgent } from "@src/features/debate/agent.js";
import { createDecisionAgent } from "@src/features/decision/agent.js";
import { createFinancialsAgent } from "@src/features/financials/agent.js";
import { createMarketAgent } from "@src/features/market/agent.js";
import { createSearchTool } from "@src/features/search/tool.js";
import { createSentimentAgent } from "@src/features/sentiment/agent.js";
import { createSummaryAgent } from "@src/features/summary/agent.js";
import { createGraph, type GraphAgents } from "@src/workflows/graph.js";

type WorkflowDeps = {
	model: BaseChatModel;
	referenceSearch: TavilySearch;
	newsSearch: TavilySearch;
	agents: GraphAgents;
};

/**
 * One model instance is shared by every agent, so anything dropped here is
 * dropped pipeline-wide. Every branch must therefore pass temperature
 * explicitly: a `temperature || default` shortcut reads as correct and
 * silently ignores MODEL_TEMPERATURE on the providers it misses.
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
	 * The news subagents want the last day, so they get timeRange "day". The
	 * financials, analyst and market agents want SEC filings, statistics pages
	 * and price history, none of which are *published* within 24 hours, so they
	 * get no filter at all.
	 *
	 * Reference results are deliberately smaller: a ReAct agent re-sends every
	 * tool result on each remaining model call, so search payload is billed
	 * once per remaining call rather than once. chunksPerSource is set here and
	 * not on newsSearch because Tavily only honours it at searchDepth
	 * "advanced".
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

	const financialsAgent =
		deps.agents?.financials ??
		createFinancialsAgent({ model, search: referenceSearch });
	const analystAgent =
		deps.agents?.analyst ??
		createAnalystAgent({ model, search: referenceSearch });
	const sentimentAgent =
		deps.agents?.sentiment ??
		createSentimentAgent({ model, search: newsSearch });
	const marketAgent =
		deps.agents?.market ??
		createMarketAgent({ model, search: referenceSearch });
	const debateAgent = deps.agents?.debate ?? createDebateAgent({ model });
	const decisionAgent = deps.agents?.decision ?? createDecisionAgent({ model });
	const summaryAgent = deps.agents?.summary ?? createSummaryAgent({ model });

	const workflow = createGraph(
		{
			financials: financialsAgent,
			analyst: analystAgent,
			sentiment: sentimentAgent,
			market: marketAgent,
			debate: debateAgent,
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
		financialsAgent,
		analystAgent,
		sentimentAgent,
		marketAgent,
		debateAgent,
		decisionAgent,
		summaryAgent,
		workflow,
	};
}

export type { WorkflowDeps };
export { createModel, createWorkflow };
