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
		baseUrl: z
			.string()
			.default("http://localhost:11434"),
	}),
	tavily: z.object({
		apiKey: z.string().min(1),
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
	const candidate = {
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
		},
		tavily: {
			apiKey: env.TAVILY_API_KEY,
		},
	};

	const result = AppConfigSchema.safeParse(candidate);
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
