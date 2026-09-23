import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { decisionSchema } from "@src/features/decision/schema.js";
import { DECISION_SYSTEM_PROMPT } from "@src/features/decision/prompt.js";
import { createAgent } from "langchain";

function createDecisionAgent(model: BaseChatModel) {
	return createAgent({
		model,
		tools: [],
		systemPrompt: DECISION_SYSTEM_PROMPT + "\n\nAlways respond with valid JSON only.",
	});
}

export { createDecisionAgent };
