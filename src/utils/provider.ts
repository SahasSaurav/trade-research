import type { AppConfig } from "@src/config/config.js";

/** The providers a client can be built for; the config enum is the source. */
type Provider = AppConfig["model"]["provider"];

/**
 * What `initChatModel` needs for one provider: the id in its `provider:model`
 * spec, and the constructor fields that go with it.
 *
 * Two config ids are translated rather than passed through. `google-genai` is
 * served by the installed `@langchain/google` package, whose spec id is
 * `google` — the `google-genai` id would import a package this repo does not
 * depend on. `xai` speaks the OpenAI protocol, so it reuses that provider with
 * xAI's base URL instead of adding a second client library.
 */
type ProviderSetup = {
	spec: "openai" | "google" | "ollama";
	fields: Record<string, unknown>;
};

function providerSetup(config: AppConfig, provider: Provider): ProviderSetup {
	switch (provider) {
		case "openai":
			return { spec: "openai", fields: { apiKey: config.openai.apiKey } };
		case "xai":
			return {
				spec: "openai",
				fields: {
					apiKey: config.xai.apiKey,
					configuration: { baseURL: "https://api.x.ai/v1" },
				},
			};
		case "google-genai":
			return { spec: "google", fields: { apiKey: config.google.apiKey } };
		default:
			return {
				spec: "ollama",
				fields: {
					baseUrl: config.ollama.baseUrl,
					numCtx: config.ollama.numCtx,
				},
			};
	}
}

export type { Provider, ProviderSetup };
export { providerSetup };
