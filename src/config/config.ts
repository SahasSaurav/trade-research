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
		 * Context window handed to the local model. Left unset, Ollama uses the
		 * model's own default, which for a 12B MLX build can be far larger than
		 * this pipeline ever fills. An oversized window is not free on Apple
		 * silicon: it grows the KV cache, which is what decides whether a 12B
		 * model stays resident in unified memory.
		 *
		 * A latency and memory knob, not a token-cost one. Ollama bills nothing
		 * per token, so on the local provider this is the only "cost" setting
		 * that means anything.
		 */
		numCtx: z.coerce.number().int().min(1).optional(),
	}),
	tavily: z.object({
		apiKey: z.string().min(1),
	}),
	/**
	 * Search result sizing.
	 *
	 * On the local provider this is the entire cost model: there is no
	 * per-token bill, so Tavily credits are the only spend. The defaults
	 * reproduce the values that were previously hardcoded in workflow.ts, so
	 * setting nothing changes no behaviour — it just makes the two knobs that
	 * were reasoned about (maxResults and chunksPerSource) tunable per
	 * environment without a code change.
	 *
	 * chunksPerSource is only honoured at searchDepth "advanced", which is why
	 * it is meaningful on `reference` and inert on a basic-depth tool.
	 */
	search: z.object({
		reference: z.object({
			maxResults: z.coerce.number().int().min(1).default(5),
			chunksPerSource: z.coerce.number().int().min(1).default(1),
			searchDepth: z.enum(["basic", "advanced"]).default("advanced"),
		}),
		news: z.object({
			maxResults: z.coerce.number().int().min(1).default(5),
			timeRange: z.enum(["day", "week", "month", "year"]).default("day"),
		}),
		/**
		 * Result cache lifetime. Five minutes is right for the news tools,
		 * where a headline changes, and short for the reference tool, where
		 * trailing EPS barely moves in an hour. A longer TTL is the single
		 * biggest saving when the same tickers are re-researched.
		 */
		cacheTtlMs: z.coerce
			.number()
			.int()
			.min(0)
			.default(5 * 60_000),
		/**
		 * Bounded so a long-lived process cannot grow the cache without limit.
		 */
		cacheMaxEntries: z.coerce.number().int().min(1).default(100),
	}),
	/**
	 * Multipliers on a run's worst case. Each one re-runs a whole agent, so
	 * they compound with the per-agent model call budget rather than adding to
	 * it: analystAttempts 2 means up to three full analyst runs.
	 */
	budgets: z.object({
		analystAttempts: z.coerce.number().int().min(0).max(5).default(2),
		researchAttempts: z.coerce.number().int().min(1).max(5).default(3),
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
			cacheTtlMs: env.SEARCH_CACHE_TTL_MS,
			cacheMaxEntries: env.SEARCH_CACHE_MAX_ENTRIES,
		},
		budgets: {
			analystAttempts: env.BUDGET_ANALYST_ATTEMPTS,
			researchAttempts: env.BUDGET_RESEARCH_ATTEMPTS,
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
export { AppConfigSchema, ConfigError, getConfig, loadConfig };
