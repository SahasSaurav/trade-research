import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { TavilySearch } from "@langchain/tavily";

import { loadConfig } from "@src/config/config.js";
import { createAnalystAgent } from "@src/features/analyst/agent.js";
import { createDecisionAgent } from "@src/features/decision/agent.js";
import { createSummaryAgent } from "@src/features/summary/agent.js";
import { createSentimentAgent } from "@src/features/sentiment/agent.js";
import { createValuationAgent } from "@src/features/valuation/agent.js";
import { createGraph } from "@src/workflows/graph.js";

type WorkflowDeps = {
	model: BaseChatModel;
	search: TavilySearch;
};

function createModel(config: ReturnType<typeof loadConfig>): BaseChatModel {
	switch (config.model.provider) {
		case "ollama":
			return new ChatOllama({
				model: config.model.name,
				baseUrl: config.ollama.baseUrl,
				temperature: config.model.temperature,
			});
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
		default:
			return new ChatGoogleGenerativeAI({
				model: config.model.name,
				apiKey: config.google.apiKey,
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
		});

	const valuationAgent = createValuationAgent(model, search);
	const analystAgent = createAnalystAgent(model, search);
	const sentimentAgent = createSentimentAgent(model);
	const decisionAgent = createDecisionAgent(model);
	const summaryAgent = createSummaryAgent(model);

	const workflow = createGraph(
		valuationAgent,
		analystAgent,
		sentimentAgent,
		decisionAgent,
		summaryAgent,
	);

	return {
		model,
		search,
		valuationAgent,
		analystAgent,
		sentimentAgent,
		decisionAgent,
		summaryAgent,
		workflow,
	};
}

export type { WorkflowDeps };
export { createWorkflow };
