import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogle } from "@langchain/google";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { TavilyExtract, TavilySearch } from "@langchain/tavily";
import { loadConfig } from "@src/config/config.js";
import { createAnalystAgent } from "@src/features/analyst/agent.js";
import { createDebateAgent } from "@src/features/debate/agent.js";
import { createDecisionAgent } from "@src/features/decision/agent.js";
import { createFinancialsAgent } from "@src/features/financials/agent.js";
import { createMarketAgent } from "@src/features/market/agent.js";
import {
	createExtractTool,
	createSearchTool,
	type ExtractedPage,
} from "@src/features/search/tool.js";
import { createSentimentAgent } from "@src/features/sentiment/agent.js";
import { createSummaryAgent } from "@src/features/summary/agent.js";
import {
	type CheckpointStore,
	type ContextStore,
	openCheckpointSaver,
	openContextStore,
} from "@src/utils/context-store.js";
import { errorMessage } from "@src/utils/errors.js";
import { createGraph, type GraphAgents } from "@src/workflows/graph.js";

type WorkflowDeps = {
	model: BaseChatModel;
	referenceSearch: TavilySearch;
	newsSearch: TavilySearch;
	extract: TavilyExtract;
	agents: GraphAgents;
	store: ContextStore | null;
	checkpoints: CheckpointStore | null;
};

type Config = ReturnType<typeof loadConfig>;

/**
 * The store is an optimisation and a record, never the work — so a file that
 * cannot be opened is a warning, not a failed run. The alternative (throw) lets
 * a stale lock or a read-only volume take down a run that would otherwise
 * succeed.
 */
function openOrWarn<T>(
	what: string,
	consequence: string,
	open: () => T,
): T | null {
	try {
		return open();
	} catch (error) {
		console.warn(
			`${what} unavailable (${errorMessage(error)}); ${consequence}`,
		);
		return null;
	}
}

function openStore(config: Config): ContextStore | null {
	const path = config.store.path;
	if (!path) return null;

	return openOrWarn("context store", "continuing without persistence", () =>
		openContextStore({
			path,
			pageTtlMs: config.store.pageTtlHours * 60 * 60 * 1000,
		}),
	);
}

/**
 * The checkpointer is what a crashed run resumes from, so it lives on the same
 * file the cache and the run record use. It opens only when the store did: if
 * the store could not be opened the volume is not writable, and a second handle
 * on it would fail the same way.
 */
function openCheckpoints(
	store: ContextStore | null,
	path: string | undefined,
): CheckpointStore | null {
	if (!store || !path) return null;

	return openOrWarn("checkpoint store", "a crash will restart the run", () =>
		openCheckpointSaver(path),
	);
}

/**
 * One model instance is shared by every agent, so anything dropped here is
 * dropped pipeline-wide. Every branch must therefore pass temperature
 * explicitly: a `temperature || default` shortcut reads as correct and
 * silently ignores MODEL_TEMPERATURE on the providers it misses.
 */
function createModel(config: Config): BaseChatModel {
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
	 * Off unless CONTEXT_DB_PATH names a file. A cache that outlives the
	 * process changes what a re-run sees, so it is opted into rather than
	 * assumed — and the deployed image has no writable volume to put it on.
	 */
	const store = deps.store === undefined ? openStore(config) : deps.store;

	const checkpoints =
		deps.checkpoints === undefined
			? openCheckpoints(store, config.store.path)
			: deps.checkpoints;

	/**
	 * Two tools, because a publication-date filter is right for one pair of
	 * agents and actively harmful for the other.
	 *
	 * The news subagents get a window (a month by default) as a starting point:
	 * their skill tells them to widen it when coverage is thin, and the model's
	 * own `timeRange` wins over the configured one. The financials, analyst and
	 * market agents want SEC filings, statistics pages and price history, none
	 * of which are *published* within a month, so they get no filter at all.
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

	/**
	 * One page reader for every branch that cites a URL.
	 *
	 * The skills require the agent to read the body of a source before citing
	 * it, and a search result is a snippet — so without this tool the agent is
	 * asked to verify something it has no way to verify, and the honest
	 * failure (a citation whose body was never read) is indistinguishable from
	 * a real one.
	 *
	 * When the context store is on, the reader is backed by it and a page
	 * survives the process. When it is off — or its ttl is zero — the tool
	 * builds its own in-memory cache, which still covers the branches sharing
	 * it within one run.
	 */
	const pageCache =
		store && config.store.pageTtlHours > 0
			? store.pageCache<ExtractedPage>()
			: undefined;

	const extract =
		deps.extract ??
		createExtractTool({
			tavilyApiKey: config.tavily.apiKey,
			cache: pageCache,
		});

	/**
	 * The three research agents compact against the same budget, so a run
	 * truncates the same way whichever branch fills up first. Sentiment and
	 * debate are left on deepagents' defaults: they delegate rather than read,
	 * so their transcript stays small by construction.
	 */
	const compaction = {
		triggerTokens: config.context.summaryTriggerTokens,
		keepMessages: config.context.keepMessages,
	};

	const financialsAgent =
		deps.agents?.financials ??
		createFinancialsAgent({
			model,
			search: referenceSearch,
			extract,
			compaction,
		});
	const analystAgent =
		deps.agents?.analyst ??
		createAnalystAgent({
			model,
			search: referenceSearch,
			extract,
			compaction,
		});
	const sentimentAgent =
		deps.agents?.sentiment ??
		createSentimentAgent({ model, search: newsSearch, extract });
	const marketAgent =
		deps.agents?.market ??
		createMarketAgent({
			model,
			search: referenceSearch,
			extract,
			compaction,
		});
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
			checkpointer: checkpoints?.saver,
		},
	);

	return {
		model,
		store,
		checkpoints,
		/** What the run record says it ran on. */
		runMeta: { provider: config.model.provider, model: config.model.name },
		referenceSearch,
		newsSearch,
		extract,
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
