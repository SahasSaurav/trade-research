import { loadConfig } from "@src/config/config.js";
import { createModel } from "@src/workflows/workflow.js";
import { describe, expect, it } from "vitest";

/**
 * The six agents all share one model instance, so anything the model factory
 * drops is dropped for the whole pipeline. Two of the four provider branches
 * used to omit `temperature` entirely, which meant MODEL_TEMPERATURE was
 * silently ignored on openai and xai. That is a cost bug, not a tidiness one:
 * every agent here conforms to a zod schema, and a hot temperature on a
 * structured extraction mostly buys malformed output, which fails validation
 * and sends the analyst down the repair branch — a whole extra agent run.
 *
 * createModel is exercised directly rather than through createWorkflow,
 * because createWorkflow compiles the graph and would drag an unrelated
 * failure into a test about model construction.
 */

type ModelLike = {
	temperature?: number;
	numCtx?: number;
	params?: { temperature?: number };
};

/**
 * ChatOpenAI and ChatOllama keep the value on the instance; ChatGoogle keeps
 * the whole constructor payload under `params`. The assertion is that the
 * configured value reached the model, not which of the two shapes it landed in.
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
		// Regression guard for the two branches that omitted it. Without this
		// test a future refactor can drop the field again silently, because
		// nothing else in the suite constructs these models.
		const model = createModel(
			loadConfig(env({ MODEL_PROVIDER: provider, MODEL_TEMPERATURE: "0.1" })),
		);

		expect(temperatureOf(model)).toBe(0.1);
	});

	it("passes temperature 0 through unchanged", () => {
		// 0 is falsy, so a `temperature || default` shortcut anywhere in the
		// factory would silently turn this into a non-zero temperature.
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
		// Not a number and not 0: forcing a value here would shrink the
		// context for anyone who never asked for it.
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
});
