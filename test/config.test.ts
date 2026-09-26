import { ConfigError, loadConfig } from "@src/config/config.js";
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
