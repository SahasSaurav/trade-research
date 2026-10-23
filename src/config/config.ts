import { z } from "zod";

const AppConfigSchema = z.object({
	app: z.object({
		name: z.string().min(1).default("trade-research"),
		env: z.enum(["development", "production", "test"]).default("development"),
	}),
	model: z.object({
		provider: z
			.enum(["google-genai", "openai", "ollama", "xai"])
			.default("ollama"),
		name: z.string().min(1).default("llama3.2"),
		temperature: z.coerce.number().min(0).max(2).default(0.7),
	}),
	google: z.object({
		apiKey: z.string().min(1),
	}),
	openai: z.object({
		apiKey: z.string().min(1),
	}),
	xai: z.object({
		apiKey: z.string().min(1),
	}),
	ollama: z.object({
		baseUrl: z.string().default("http://localhost:11434"),
		/**
		 * Unset by default so the model's own context window keeps winning — a
		 * larger window still costs KV cache, which on Apple silicon decides
		 * whether a 12B model stays resident in unified memory.
		 */
		numCtx: z.coerce.number().int().min(1).optional(),
	}),
	tavily: z.object({
		apiKey: z.string().min(1),
	}),
	/** Search result sizing. On a local provider Tavily credits are the whole
	 * cost model. chunksPerSource is only honoured at searchDepth "advanced". */
	search: z.object({
		reference: z.object({
			maxResults: z.coerce.number().int().min(1).default(5),
			chunksPerSource: z.coerce.number().int().min(1).default(1),
			searchDepth: z.enum(["basic", "advanced"]).default("advanced"),
		}),
		news: z.object({
			maxResults: z.coerce.number().int().min(1).default(5),
			/**
			 * The default window for the two sentiment branches.
			 *
			 * It was "day", which the news skill contradicts: it asks for news
			 * up to 90 days old and tells the agent to widen the range when
			 * coverage is thin. The value is only a fallback — the agent's own
			 * `timeRange` wins — so the default is a starting window, not a
			 * ceiling.
			 */
			timeRange: z.enum(["day", "week", "month", "year"]).default("month"),
		}),
	}),
	/**
	 * Each budget re-runs a whole agent, so it multiplies cost rather than
	 * adding to it. researchAttempts floors at 1 — zero retries is a choice,
	 * zero attempts is not a run at all.
	 */
	budgets: z.object({
		analystAttempts: z.coerce.number().int().min(0).max(5).default(2),
		researchAttempts: z.coerce.number().int().min(1).max(5).default(3),
	}),
	/**
	 * Where the deep research agents compact their transcript.
	 *
	 * A research run re-sends its whole transcript on every turn, so compaction
	 * only pays for itself if it happens before the window is nearly full. The
	 * trigger is in tokens rather than a window fraction because the models that
	 * need it most publish no window at all: deepagents falls back to a fixed
	 * 170k tokens for those, which a local model overflows long before. Set this
	 * to roughly 40% of OLLAMA_NUM_CTX for a local model; a frontier model can
	 * keep the default.
	 */
	context: z.object({
		summaryTriggerTokens: z.coerce.number().int().min(1_000).default(60_000),
		/** Messages kept verbatim after a compaction; everything older is summarised. */
		keepMessages: z.coerce.number().int().min(1).default(6),
	}),
	/**
	 * The SQLite context store. Off unless a path is given.
	 *
	 * A cache that outlives the process changes what the next run sees, so
	 * enabling it is a decision rather than a default — and the deployed image
	 * has no writable volume for it anyway. `pageTtlHours: 0` keeps the run
	 * record but leaves `open_url` on the in-memory cache.
	 */
	store: z.object({
		path: z.string().min(1).optional(),
		pageTtlHours: z.coerce.number().min(0).default(12),
	}),
});

type AppConfig = z.infer<typeof AppConfigSchema>;

class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const configs = {
		app: {
			name: env.APP_NAME,
			env: env.APP_ENV,
		},
		model: {
			provider: env.MODEL_PROVIDER,
			name: env.MODEL_NAME,
			temperature: env.MODEL_TEMPERATURE,
		},
		google: {
			apiKey: env.GOOGLE_API_KEY,
		},
		openai: {
			apiKey: env.OPENAI_API_KEY,
		},
		xai: {
			apiKey: env.XAI_API_KEY,
		},
		ollama: {
			baseUrl: env.OLLAMA_BASE_URL,
			numCtx: env.OLLAMA_NUM_CTX,
		},
		tavily: {
			apiKey: env.TAVILY_API_KEY,
		},
		search: {
			reference: {
				maxResults: env.SEARCH_REFERENCE_MAX_RESULTS,
				chunksPerSource: env.SEARCH_REFERENCE_CHUNKS_PER_SOURCE,
				searchDepth: env.SEARCH_REFERENCE_DEPTH,
			},
			news: {
				maxResults: env.SEARCH_NEWS_MAX_RESULTS,
				timeRange: env.SEARCH_NEWS_TIME_RANGE,
			},
		},
		budgets: {
			analystAttempts: env.BUDGET_ANALYST_ATTEMPTS,
			researchAttempts: env.BUDGET_RESEARCH_ATTEMPTS,
		},
		context: {
			summaryTriggerTokens: env.CONTEXT_SUMMARY_TRIGGER_TOKENS,
			keepMessages: env.CONTEXT_KEEP_MESSAGES,
		},
		store: {
			path: env.CONTEXT_DB_PATH,
			pageTtlHours: env.CONTEXT_DB_PAGE_TTL_HOURS,
		},
	};

	const result = AppConfigSchema.safeParse(configs);
	if (!result.success) {
		throw new ConfigError(
			`Invalid environment configuration:\n${z.prettifyError(result.error)}`,
		);
	}
	return result.data;
}

const getConfig = (): AppConfig => loadConfig();

export type { AppConfig };
export { ConfigError, getConfig, loadConfig };
