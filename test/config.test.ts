import { ConfigError, getConfig, loadConfig } from "@src/config/config.js";
import { describe, expect, it } from "vitest";

/** A minimal env that satisfies the required keys. */
function env(overrides: Record<string, string | undefined> = {}) {
	return {
		GOOGLE_API_KEY: "google-key",
		OPENAI_API_KEY: "openai-key",
		XAI_API_KEY: "xai-key",
		TAVILY_API_KEY: "tavily-key",
		...overrides,
	} as NodeJS.ProcessEnv;
}

describe("loadConfig", () => {
	it("applies documented defaults when only required keys are set", () => {
		const config = loadConfig(env());

		expect(config.app).toEqual({ name: "trade-research", env: "development" });
		expect(config.model).toEqual({
			provider: "ollama",
			name: "llama3.2",
			temperature: 0.7,
		});
		expect(config.ollama.baseUrl).toBe("http://localhost:11434");
	});

	it("reads provider, model and temperature from the environment", () => {
		const config = loadConfig(
			env({
				MODEL_PROVIDER: "google-genai",
				MODEL_NAME: "gemini-3.7-flash",
				MODEL_TEMPERATURE: "0.2",
			}),
		);

		expect(config.model.provider).toBe("google-genai");
		expect(config.model.name).toBe("gemini-3.7-flash");
		expect(config.model.temperature).toBe(0.2);
	});

	it("coerces temperature from string to number", () => {
		// process.env is always string|undefined; without z.coerce.number()
		// the schema would reject a correctly configured value.
		expect(
			loadConfig(env({ MODEL_TEMPERATURE: "1.5" })).model.temperature,
		).toBe(1.5);
		expect(loadConfig(env({ MODEL_TEMPERATURE: "0" })).model.temperature).toBe(
			0,
		);
	});

	it.each([
		["GOOGLE_API_KEY", "google-key"],
		["OPENAI_API_KEY", "openai-key"],
		["XAI_API_KEY", "xai-key"],
		["TAVILY_API_KEY", "tavily-key"],
	])("rejects a missing %s", (key) => {
		const broken = env();
		delete broken[key];

		expect(() => loadConfig(broken)).toThrow(ConfigError);
	});

	it("rejects an empty API key rather than accepting a placeholder", () => {
		expect(() => loadConfig(env({ TAVILY_API_KEY: "" }))).toThrow(ConfigError);
	});

	it("rejects an unknown provider", () => {
		expect(() => loadConfig(env({ MODEL_PROVIDER: "anthropic" }))).toThrow(
			ConfigError,
		);
	});

	it.each([
		["below range", "-0.1"],
		["above range", "2.1"],
		["not a number", "hot"],
	])("rejects temperature %s", (_label, value) => {
		expect(() => loadConfig(env({ MODEL_TEMPERATURE: value }))).toThrow(
			ConfigError,
		);
	});

	it("names every invalid field at once, not just the first", () => {
		// A single-error message sends the reader hunting one key at a time
		// across four providers. The paths come from z.prettifyError, so a
		// mis-nested schema would show up here.
		let message = "";
		try {
			loadConfig(env({ MODEL_PROVIDER: "nope", MODEL_TEMPERATURE: "9" }));
			expect.unreachable("expected loadConfig to throw");
		} catch (error) {
			message = (error as Error).message;
		}

		expect(message).toContain("model.provider");
		expect(message).toContain("model.temperature");
	});

	it("points at the missing key when a credential is absent", () => {
		const broken = env();
		delete broken.TAVILY_API_KEY;

		let message = "";
		try {
			loadConfig(broken);
			expect.unreachable("expected loadConfig to throw");
		} catch (error) {
			message = (error as Error).message;
		}

		// Path, not the value: the message must never echo a secret back.
		expect(message).toContain("tavily.apiKey");
	});

	it("sets the error name so callers can distinguish it", () => {
		try {
			loadConfig(env({ TAVILY_API_KEY: "" }));
			expect.unreachable("expected loadConfig to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as Error).name).toBe("ConfigError");
		}
	});
});

/**
 * Defaults and overrides both need pinning: setting nothing must reproduce the
 * sizing the workflow uses, and setting something must change it.
 */
describe("loadConfig search sizing", () => {
	it("defaults to the reference sizing the workflow already used", () => {
		const config = loadConfig(env());

		expect(config.search.reference).toEqual({
			maxResults: 5,
			chunksPerSource: 1,
			searchDepth: "advanced",
		});
		expect(config.search.news).toEqual({ maxResults: 5, timeRange: "day" });
	});

	it("reads every search knob from the environment", () => {
		const config = loadConfig(
			env({
				SEARCH_REFERENCE_MAX_RESULTS: "3",
				SEARCH_REFERENCE_CHUNKS_PER_SOURCE: "2",
				SEARCH_REFERENCE_DEPTH: "basic",
				SEARCH_NEWS_MAX_RESULTS: "8",
				SEARCH_NEWS_TIME_RANGE: "week",
			}),
		);

		expect(config.search.reference).toEqual({
			maxResults: 3,
			chunksPerSource: 2,
			searchDepth: "basic",
		});
		expect(config.search.news).toEqual({ maxResults: 8, timeRange: "week" });
	});

	it.each([
		["SEARCH_REFERENCE_DEPTH", "search.reference.searchDepth"],
		["SEARCH_NEWS_TIME_RANGE", "search.news.timeRange"],
	])("rejects an unknown %s", (key, path) => {
		expect(() => loadConfig(env({ [key]: "turbo" }))).toThrow(ConfigError);
		expect(() => loadConfig(env({ [key]: "turbo" }))).toThrow(path);
	});

	it.each([
		// Zero results makes every search fail; zero chunks returns pages with
		// no readable content.
		["SEARCH_REFERENCE_MAX_RESULTS", "0", "search.reference.maxResults"],
		[
			"SEARCH_REFERENCE_CHUNKS_PER_SOURCE",
			"0",
			"search.reference.chunksPerSource",
		],
		["SEARCH_NEWS_MAX_RESULTS", "0", "search.news.maxResults"],
	])("rejects %s=%s", (key, value, path) => {
		expect(() => loadConfig(env({ [key]: value }))).toThrow(ConfigError);
		expect(() => loadConfig(env({ [key]: value }))).toThrow(path);
	});

	it("rejects a fractional result count", () => {
		// process.env is all strings, so without .int() a typo like "5.5"
		// would reach Tavily as a nonsense max_results.
		expect(() =>
			loadConfig(env({ SEARCH_REFERENCE_MAX_RESULTS: "5.5" })),
		).toThrow(ConfigError);
	});

	it("rejects a non-numeric result count", () => {
		expect(() => loadConfig(env({ SEARCH_NEWS_MAX_RESULTS: "lots" }))).toThrow(
			ConfigError,
		);
	});
});

describe("loadConfig budgets", () => {
	it("defaults to the multipliers the graph already used", () => {
		const config = loadConfig(env());

		expect(config.budgets).toEqual({
			analystAttempts: 2,
			researchAttempts: 3,
		});
	});

	it("reads both budgets from the environment", () => {
		const config = loadConfig(
			env({ BUDGET_ANALYST_ATTEMPTS: "0", BUDGET_RESEARCH_ATTEMPTS: "1" }),
		);

		expect(config.budgets.analystAttempts).toBe(0);
		expect(config.budgets.researchAttempts).toBe(1);
	});

	it("allows zero repair attempts, which disables the repair branch", () => {
		expect(loadConfig(env({ BUDGET_ANALYST_ATTEMPTS: "0" }))).toMatchObject({
			budgets: { analystAttempts: 0 },
		});
	});

	it("rejects a negative attempt count", () => {
		expect(() => loadConfig(env({ BUDGET_ANALYST_ATTEMPTS: "-1" }))).toThrow(
			ConfigError,
		);
	});

	it("rejects zero research attempts, which would skip the agent entirely", () => {
		expect(() => loadConfig(env({ BUDGET_RESEARCH_ATTEMPTS: "0" }))).toThrow(
			ConfigError,
		);
	});

	it("caps the attempt counts so a typo cannot run away", () => {
		expect(() => loadConfig(env({ BUDGET_ANALYST_ATTEMPTS: "99" }))).toThrow(
			ConfigError,
		);
		expect(() => loadConfig(env({ BUDGET_RESEARCH_ATTEMPTS: "99" }))).toThrow(
			ConfigError,
		);
	});
});

describe("loadConfig ollama numCtx", () => {
	it("leaves the context window unset by default", () => {
		// Undefined, not a number: the model's own default has to keep winning
		// or this would silently shrink someone's context.
		expect(loadConfig(env()).ollama.numCtx).toBeUndefined();
	});

	it("reads an explicit context window", () => {
		expect(loadConfig(env({ OLLAMA_NUM_CTX: "8192" })).ollama.numCtx).toBe(
			8192,
		);
	});

	it.each([
		["zero", "0"],
		["negative", "-4096"],
		["fractional", "4096.5"],
		["non-numeric", "big"],
	])("rejects a %s context window", (_label, value) => {
		expect(() => loadConfig(env({ OLLAMA_NUM_CTX: value }))).toThrow(
			ConfigError,
		);
	});
});

describe("getConfig", () => {
	it("reads process.env, unlike loadConfig's explicit argument", () => {
		// getConfig is the zero-arg form the app actually calls, so it has to
		// resolve against the real environment.
		const saved = { ...process.env };
		try {
			process.env.MODEL_PROVIDER = "openai";
			process.env.MODEL_NAME = "gpt-4o-mini";
			process.env.MODEL_TEMPERATURE = "0.2";
			process.env.TAVILY_API_KEY = "tavily-key";
			process.env.OPENAI_API_KEY = "openai-key";
			process.env.GOOGLE_API_KEY = "google-key";
			process.env.XAI_API_KEY = "xai-key";

			const config = getConfig();

			expect(config.model).toEqual({
				provider: "openai",
				name: "gpt-4o-mini",
				temperature: 0.2,
			});
		} finally {
			// Restore, so a stray mutation cannot leak into another file.
			for (const key of Object.keys(process.env)) delete process.env[key];
			Object.assign(process.env, saved);
		}
	});
});
