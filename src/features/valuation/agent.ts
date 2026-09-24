import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { VALUATION_SYSTEM_PROMPT } from "@src/features/valuation/prompt.js";
import { createAgent, toolStrategy } from "langchain";

// Gemini Schema subset: single-string `type`, `nullable`, no `$schema`,
// no `additionalProperties`, no `format`/`minimum`/`maximum`.
const valuationResponseFormat = toolStrategy({
	type: "object",
	properties: {
		ticker: { type: "string" },
		dateChecked: { type: "string" },
		trailingEPS: { type: "number", nullable: true },
		forwardEPS: { type: "number", nullable: true },
		trailingPE: { type: "number", nullable: true },
		forwardPE: { type: "number", nullable: true },
		pegRatio: { type: "number", nullable: true },
		sourceUrls: { type: "array", items: { type: "string" } },
		notes: { type: "string" },
	},
	required: [
		"ticker",
		"dateChecked",
		"trailingEPS",
		"forwardEPS",
		"trailingPE",
		"forwardPE",
		"pegRatio",
		"sourceUrls",
	],
});

function createValuationAgent(model: BaseChatModel, search: TavilySearch) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: VALUATION_SYSTEM_PROMPT,
		responseFormat: valuationResponseFormat,
	});
}

export { createValuationAgent };
