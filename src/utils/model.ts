import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AppConfig } from "@src/config/config.js";
import { providerSetup } from "@src/utils/provider.js";
import { initChatModel } from "langchain/chat_models/universal";

/**
 * A model reference from the environment: `provider/model`, or a bare model id
 * that keeps the configured provider.
 */
type ModelRef = {
	provider?: AppConfig["model"]["provider"];
	name: string;
};

/**
 * One model client, on the shared model unless a reference overrides it.
 *
 * `initChatModel` resolves the provider package from the spec, so no provider
 * SDK is imported here and a new provider is a config change, not a code
 * change. It is async because that resolution is a dynamic import, which is why
 * `createWorkflow` is async too.
 *
 * `MODEL_PROVIDER`/`MODEL_NAME` answer for the pipeline; `MODEL_<AGENT>` and
 * `CONTEXT_SUMMARIZER_MODEL` answer for one branch, and both are the same
 * reference shape, so an override can change the provider as well as the model.
 * Temperature is passed explicitly: it is a model field, not a default the
 * provider should choose.
 */
async function createModel(
	config: AppConfig,
	override?: ModelRef,
): Promise<BaseChatModel> {
	const provider = override?.provider ?? config.model.provider;
	const name = override?.name ?? config.model.name;
	const { spec, fields } = providerSetup(config, provider);

	return initChatModel(`${spec}:${name}`, {
		...fields,
		temperature: config.model.temperature,
	});
}

export type { ModelRef };
export { createModel };
