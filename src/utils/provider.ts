import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogle } from "@langchain/google";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "@src/config/config.js";

/** The providers a client can be built for; the config enum is the source. */
type Provider = AppConfig["model"]["provider"];

/**
 * One chat client, on one provider.
 *
 * Temperature is passed explicitly in every branch: a `temperature || default`
 * shortcut reads as correct and silently ignores MODEL_TEMPERATURE on the
 * providers it misses. `xai` speaks the OpenAI protocol, so it reuses that
 * client with a different base URL rather than a second implementation.
 *
 * This is the only place a provider SDK is imported. Everything above it —
 * which model a branch runs on — is decided in `model.ts` and the config.
 */
function createProviderClient(
	config: AppConfig,
	provider: Provider,
	model: string,
): BaseChatModel {
	switch (provider) {
		case "openai":
			return new ChatOpenAI({
				model,
				apiKey: config.openai.apiKey,
				temperature: config.model.temperature,
			});
		case "xai":
			return new ChatOpenAI({
				model,
				apiKey: config.xai.apiKey,
				temperature: config.model.temperature,
				configuration: {
					baseURL: "https://api.x.ai/v1",
				},
			});
		case "google-genai":
			return new ChatGoogle({
				model,
				apiKey: config.google.apiKey,
				temperature: config.model.temperature,
			});
		default:
			return new ChatOllama({
				model,
				baseUrl: config.ollama.baseUrl,
				temperature: config.model.temperature,
				numCtx: config.ollama.numCtx,
			});
	}
}

export type { Provider };
export { createProviderClient };
