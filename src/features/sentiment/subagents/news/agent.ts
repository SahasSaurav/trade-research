import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import { NEWS_SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/news/prompt.js";
import { createAgent, toolStrategy } from "langchain";

// Gemini Schema subset: single-string `type`, `nullable`, no `$schema`,
// no `additionalProperties`, no `format`/`minimum`/`maximum`.
const newsSentimentResponseFormat = toolStrategy({
	type: "object",
	properties: {
		ticker: { type: "string" },
		sentimentSources: {
			type: "array",
			items: {
				type: "object",
				properties: {
					source: { type: "string" },
					sentiment: {
						type: "string",
						enum: ["positive", "neutral", "negative"],
					},
					evidenceStrength: {
						type: "string",
						enum: ["high", "medium", "low"],
					},
					date: { type: "string" },
					summary: { type: "string" },
					sourceUrl: { type: "string" },
				},
				required: [
					"source",
					"sentiment",
					"evidenceStrength",
					"date",
					"summary",
					"sourceUrl",
				],
			},
		},
		sourceUrls: { type: "array", items: { type: "string" } },
		notes: { type: "string" },
	},
	required: ["ticker", "sentimentSources", "sourceUrls", "notes"],
});

function createNewsSentimentAgent(
	model: BaseChatModel,
	search: StructuredTool,
) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: NEWS_SENTIMENT_SYSTEM_PROMPT,
		responseFormat: newsSentimentResponseFormat,
	});
}

export { createNewsSentimentAgent };
