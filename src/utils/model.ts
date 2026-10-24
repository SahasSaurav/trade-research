import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AppConfig } from "@src/config/config.js";
import { createProviderClient } from "@src/utils/provider.js";

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
 * Every branch starts here. `MODEL_PROVIDER`/`MODEL_NAME` answer for the
 * pipeline; `MODEL_<AGENT>` and `CONTEXT_SUMMARIZER_MODEL` answer for one
 * branch, and both are the same reference shape, so an override can change the
 * provider as well as the model.
 *
 * The switch itself lives in `provider.ts`: this file only decides which
 * provider and model id to hand it.
 */
function createModel(config: AppConfig, override?: ModelRef): BaseChatModel {
	return createProviderClient(
		config,
		override?.provider ?? config.model.provider,
		override?.name ?? config.model.name,
	);
}

export type { ModelRef };
export { createModel };
