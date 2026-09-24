import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TavilySearch } from "@langchain/tavily";
import { ANALYST_SYSTEM_PROMPT } from "@src/features/analyst/prompt.js";
import { createAgent, toolStrategy } from "langchain";

// Gemini Schema subset: single-string `type`, `nullable`, no `$schema`,
// no `additionalProperties`, no `format`/`minimum`/`maximum`.
const analystResponseFormat = toolStrategy({
	type: "object",
	properties: {
		ticker: { type: "string" },
		dateChecked: { type: "string" },
		reports: {
			type: "array",
			items: {
				type: "object",
				properties: {
					firm: { type: "string" },
					reportTitle: { type: "string" },
					rating: { type: "string" },
					priceTarget: { type: "number", nullable: true },
					reportDate: { type: "string" },
					sourceUrl: { type: "string" },
					summary: { type: "string" },
				},
				required: [
					"firm",
					"reportTitle",
					"rating",
					"priceTarget",
					"reportDate",
					"sourceUrl",
					"summary",
				],
			},
		},
	},
	required: ["ticker", "dateChecked", "reports"],
});

function createAnalystAgent(model: BaseChatModel, search: TavilySearch) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: ANALYST_SYSTEM_PROMPT,
		responseFormat: analystResponseFormat,
	});
}

export { createAnalystAgent };
