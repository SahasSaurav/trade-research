import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SUMMARY_SYSTEM_PROMPT } from "@src/features/summary/prompt.js";
import { createAgent, toolStrategy } from "langchain";

// Gemini Schema subset: single-string `type`, `nullable`, no `$schema`,
// no `additionalProperties`, no `format`/`minimum`/`maximum`.
const summaryResponseFormat = toolStrategy({
	type: "object",
	properties: {
		ticker: { type: "string" },
		dateChecked: { type: "string" },
		summary: { type: "string" },
	},
	required: ["ticker", "dateChecked", "summary"],
});

function createSummaryAgent(model: BaseChatModel) {
	return createAgent({
		model,
		systemPrompt: SUMMARY_SYSTEM_PROMPT,
		responseFormat: summaryResponseFormat,
	});
}

export { createSummaryAgent };
