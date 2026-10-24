import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { loadConfig } from "@src/config/config.js";
import { createModel } from "@src/utils/model.js";
import type { ConfigurableModel } from "langchain/chat_models/universal";
import { describe, expect, it } from "vitest";

/**
 * The shared model answers for every branch that does not name its own, so
 * anything the factory drops is dropped pipeline-wide. `initChatModel` returns a
 * configurable wrapper and resolves the provider package underneath it, so these
 * tests inspect the client it actually built.
 */

type ModelLike = {
	temperature?: number;
	numCtx?: number;
	params?: { temperature?: number };
	model?: string;
	clientConfig?: { baseURL?: string };
};

/**
 * ChatOpenAI and ChatOllama keep the value on the instance, ChatGoogle under
 * `params`. The assertion is that the value arrived, not where it landed.
 */
function temperatureOf(model: unknown): number | undefined {
	const m = model as ModelLike;
	return m.temperature ?? m.params?.temperature;
}

/** The provider client behind the configurable wrapper. */
async function client(
	model: Promise<BaseChatModel> | BaseChatModel,
): Promise<BaseChatModel> {
	return ((await model) as ConfigurableModel)._getModelInstance();
}

function env(overrides: Record<string, string | undefined> = {}) {
	return {
		GOOGLE_API_KEY: "google-key",
		OPENAI_API_KEY: "openai-key",
		XAI_API_KEY: "xai-key",
		TAVILY_API_KEY: "tavily-key",
		...overrides,
	} as NodeJS.ProcessEnv;
}

describe("createModel", () => {
	it.each([
		["openai", "OPENAI_API_KEY"],
		["xai", "XAI_API_KEY"],
		["google-genai", "GOOGLE_API_KEY"],
		["ollama", "OLLAMA_BASE_URL"],
	])("passes temperature to the %s branch", async (provider) => {
		// Guards the two branches that omitted it. Nothing else in the suite
		// constructs these models, so a refactor could drop the field silently.
		const model = await client(
			createModel(
				loadConfig(env({ MODEL_PROVIDER: provider, MODEL_TEMPERATURE: "0.1" })),
			),
		);

		expect(temperatureOf(model)).toBe(0.1);
	});

	it("passes temperature 0 through unchanged", async () => {
		// 0 is falsy, so a `temperature || default` shortcut anywhere in the
		// factory would turn this into a non-zero temperature.
		const model = await client(
			createModel(
				loadConfig(env({ MODEL_PROVIDER: "openai", MODEL_TEMPERATURE: "0" })),
			),
		);

		expect(temperatureOf(model)).toBe(0);
	});

	it("forwards the ollama context window when one is configured", async () => {
		const model = (await client(
			createModel(
				loadConfig(env({ MODEL_PROVIDER: "ollama", OLLAMA_NUM_CTX: "8192" })),
			),
		)) as ModelLike;

		expect(model.numCtx).toBe(8192);
	});

	it("leaves the ollama context window unset so the model default wins", async () => {
		// Not a number and not 0: forcing a value would shrink the context for
		// anyone who never asked for it.
		const model = (await client(
			createModel(loadConfig(env({ MODEL_PROVIDER: "ollama" }))),
		)) as ModelLike;

		expect(model.numCtx).toBeUndefined();
	});

	it("builds the provider the config names", async () => {
		expect(
			(await client(createModel(loadConfig(env({ MODEL_PROVIDER: "openai" })))))
				.constructor.name,
		).toBe("ChatOpenAI");
		expect(
			(
				await client(
					createModel(loadConfig(env({ MODEL_PROVIDER: "google-genai" }))),
				)
			).constructor.name,
		).toBe("ChatGoogle");
		expect(
			(await client(createModel(loadConfig(env({ MODEL_PROVIDER: "ollama" })))))
				.constructor.name,
		).toBe("ChatOllama");
	});

	it("runs xai on the OpenAI client, pointed at xAI", async () => {
		// `@langchain/xai` is not a dependency; xAI speaks the OpenAI protocol,
		// so the provider setup reuses that client with a different base URL.
		const model = (await client(
			createModel(loadConfig(env({ MODEL_PROVIDER: "xai" }))),
		)) as ModelLike;

		expect(model.constructor.name).toBe("ChatOpenAI");
		expect(model.clientConfig?.baseURL).toBe("https://api.x.ai/v1");
	});

	it("uses the same model name the config names", async () => {
		const model = (await client(
			createModel(
				loadConfig(
					env({ MODEL_PROVIDER: "ollama", MODEL_NAME: "gemma4:12b-mlx" }),
				),
			),
		)) as ModelLike;

		expect(model.model).toBe("gemma4:12b-mlx");
	});

	it("builds a branch override on the provider it names", async () => {
		// A branch override switches provider as well as model, so the client
		// class has to follow the override rather than MODEL_PROVIDER.
		const config = loadConfig(
			env({ MODEL_PROVIDER: "ollama", MODEL_DECISION: "openai/gpt-5" }),
		);

		const model = (await client(
			createModel(config, config.agents.decision),
		)) as ModelLike;

		expect(model.constructor.name).toBe("ChatOpenAI");
		expect(model.model).toBe("gpt-5");
	});

	it("keeps the shared provider for a bare branch id", async () => {
		// The id itself contains a colon; only the first segment may name a
		// provider, or `llama3.2:1b` would be read as a provider called
		// `llama3.2`.
		const config = loadConfig(
			env({ MODEL_PROVIDER: "ollama", MODEL_SUMMARY: "llama3.2:1b" }),
		);

		const model = (await client(
			createModel(config, config.agents.summary),
		)) as ModelLike;

		expect(model.constructor.name).toBe("ChatOllama");
		expect(model.model).toBe("llama3.2:1b");
	});
});
