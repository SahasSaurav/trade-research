import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogle } from "@langchain/google";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";

import { loadConfig } from "@src/config/config.js";
import { createAnalystAgent } from "@src/features/analyst/agent.js";
import { createDecisionAgent } from "@src/features/decision/agent.js";
import { createGeopoliticalAgent } from "@src/features/sentiment/subagents/geopolitical/agent.js";
import { createNewsSentimentAgent } from "@src/features/sentiment/subagents/news-sentiment/agent.js";
import { createSummaryAgent } from "@src/features/summary/agent.js";
import { createValuationAgent } from "@src/features/valuation/agent.js";
import { createGraph, type GraphAgents } from "@src/workflows/graph.js";

type WorkflowDeps = {
	model: BaseChatModel;
	search: TavilySearch;
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

	const search =
		deps.search ??
		new TavilySearch({
			tavilyApiKey: config.tavily.apiKey,
			maxResults: 5,
			timeRange: "day",
		});

	const valuationAgent =
		deps.agents?.valuation ?? createValuationAgent({ model, search });
	const analystAgent =
		deps.agents?.analyst ?? createAnalystAgent({ model, search });
	const newsSentimentAgent =
		deps.agents?.newsSentiment ?? createNewsSentimentAgent({ model, search });
	const geopoliticalAgent =
		deps.agents?.geopolitical ?? createGeopoliticalAgent({ model, search });
	const decisionAgent = deps.agents?.decision ?? createDecisionAgent({ model });
	const summaryAgent = deps.agents?.summary ?? createSummaryAgent({ model });

	const workflow = createGraph({
		valuation: valuationAgent,
		analyst: analystAgent,
		newsSentiment: newsSentimentAgent,
		geopolitical: geopoliticalAgent,
		decision: decisionAgent,
		summary: summaryAgent,
	});

	return {
		model,
		search,
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
