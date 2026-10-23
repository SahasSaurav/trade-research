import { loadConfig } from "@src/config/config.js";
import { createModel } from "@src/workflows/workflow.js";
import { describe, expect, it } from "vitest";

/**
 * The shared model answers for every branch that does not name its own, so
 * anything the factory drops is dropped pipeline-wide. Two of the four provider
 * branches used to omit temperature, leaving MODEL_TEMPERATURE ignored on openai
 * and xai.
 *
 * createModel is exercised directly because createWorkflow compiles the graph,
 * which would drag an unrelated failure into a test about model construction.
 */

type ModelLike = {
	temperature?: number;
	numCtx?: number;
	params?: { temperature?: number };
};

/**
 * ChatOpenAI and ChatOllama keep the value on the instance, ChatGoogle under
 * `params`. The assertion is that the value arrived, not where it landed.
 */
function temperatureOf(model: unknown): number | undefined {
	const m = model as ModelLike;
	return m.temperature ?? m.params?.temperature;
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
	])("passes temperature to the %s branch", (provider) => {
		// Guards the two branches that omitted it. Nothing else in the suite
		// constructs these models, so a refactor could drop the field silently.
		const model = createModel(
			loadConfig(env({ MODEL_PROVIDER: provider, MODEL_TEMPERATURE: "0.1" })),
		);

		expect(temperatureOf(model)).toBe(0.1);
	});

	it("passes temperature 0 through unchanged", () => {
		// 0 is falsy, so a `temperature || default` shortcut anywhere in the
		// factory would turn this into a non-zero temperature.
		const model = createModel(
			loadConfig(env({ MODEL_PROVIDER: "openai", MODEL_TEMPERATURE: "0" })),
		);

		expect(temperatureOf(model)).toBe(0);
	});

	it("forwards the ollama context window when one is configured", () => {
		const model = createModel(
			loadConfig(env({ MODEL_PROVIDER: "ollama", OLLAMA_NUM_CTX: "8192" })),
		) as ModelLike;

		expect(model.numCtx).toBe(8192);
	});

	it("leaves the ollama context window unset so the model default wins", () => {
		// Not a number and not 0: forcing a value would shrink the context for
		// anyone who never asked for it.
		const model = createModel(
			loadConfig(env({ MODEL_PROVIDER: "ollama" })),
		) as ModelLike;

		expect(model.numCtx).toBeUndefined();
	});

	it("builds the provider the config names", () => {
		expect(
			createModel(loadConfig(env({ MODEL_PROVIDER: "openai" }))).constructor
				.name,
		).toBe("ChatOpenAI");
		expect(
			createModel(loadConfig(env({ MODEL_PROVIDER: "google-genai" })))
				.constructor.name,
		).toBe("ChatGoogle");
		expect(
			createModel(loadConfig(env({ MODEL_PROVIDER: "ollama" }))).constructor
				.name,
		).toBe("ChatOllama");
	});

	it("uses the same model name the config names", () => {
		const model = createModel(
			loadConfig(
				env({ MODEL_PROVIDER: "ollama", MODEL_NAME: "gemma4:12b-mlx" }),
			),
		) as unknown as { model: string };

		expect(model.model).toBe("gemma4:12b-mlx");
	});

	it("builds a branch override on the provider it names", () => {
		// A branch override switches provider as well as model, so the client
		// class has to follow the override rather than MODEL_PROVIDER.
		const config = loadConfig(
			env({ MODEL_PROVIDER: "ollama", MODEL_DECISION: "openai/gpt-5" }),
		);

		const model = createModel(config, config.agents.decision) as unknown as {
			model: string;
		};

		expect(model.constructor.name).toBe("ChatOpenAI");
		expect(model.model).toBe("gpt-5");
	});

	it("keeps the shared provider for a bare branch id", () => {
		const config = loadConfig(
			env({ MODEL_PROVIDER: "ollama", MODEL_SUMMARY: "llama3.2:1b" }),
		);

		const model = createModel(config, config.agents.summary) as unknown as {
			model: string;
		};

		expect(model.constructor.name).toBe("ChatOllama");
		expect(model.model).toBe("llama3.2:1b");
	});
});
