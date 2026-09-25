import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { DECISION_SYSTEM_PROMPT } from "@src/features/decision/prompt.js";
import { decisionJsonSchema } from "@src/features/decision/schema.js";
import { createAgent, toolStrategy } from "langchain";

function createDecisionAgent(deps: { model: BaseChatModel }) {
	return createAgent({
		model: deps.model,
		tools: [],
		systemPrompt: DECISION_SYSTEM_PROMPT,
		responseFormat: toolStrategy(decisionJsonSchema),
	});
}

export { createDecisionAgent };
