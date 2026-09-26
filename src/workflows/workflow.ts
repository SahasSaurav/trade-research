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

function createModel(config: ReturnType<typeof loadConfig>): BaseChatModel {
	switch (config.model.provider) {
		case "openai":
			return new ChatOpenAI({
				model: config.model.name,
				apiKey: config.openai.apiKey,
			});
		case "xai":
			return new ChatOpenAI({
				model: config.model.name,
				apiKey: config.xai.apiKey,
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
	 */
	const referenceSearch =
		deps.referenceSearch ??
		createSearchTool({
			tavilyApiKey: config.tavily.apiKey,
			maxResults: 8,
			searchDepth: "advanced",
		});

	const newsSearch =
		deps.newsSearch ??
		createSearchTool({
			tavilyApiKey: config.tavily.apiKey,
			maxResults: 5,
			timeRange: "day",
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

	const workflow = createGraph({
		valuation: valuationAgent,
		analyst: analystAgent,
		newsSentiment: newsSentimentAgent,
		geopolitical: geopoliticalAgent,
		decision: decisionAgent,
		summary: summaryAgent,
		tickerSearch: referenceSearch,
	});

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
export { createWorkflow };
