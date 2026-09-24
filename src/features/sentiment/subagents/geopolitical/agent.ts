import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import { GEOPOLITICAL_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import { createAgent, toolStrategy } from "langchain";

// Gemini Schema subset: single-string `type`, `nullable`, no `$schema`,
// no `additionalProperties`, no `format`/`minimum`/`maximum`.
const geopoliticalResponseFormat = toolStrategy({
	type: "object",
	properties: {
		ticker: { type: "string" },
		geopoliticalRisks: {
			type: "array",
			items: {
				type: "object",
				properties: {
					event: { type: "string" },
					affectedRegion: { type: "string" },
					eventDate: { type: "string" },
					sourceUrl: { type: "string" },
					publisher: { type: "string" },
					publicationDate: { type: "string" },
					companyConnection: {
						type: "string",
						enum: [
							"revenue_exposure",
							"operations",
							"suppliers",
							"customers",
							"logistics",
							"commodities",
							"regulation",
							"market_access",
							"none",
						],
					},
					impact: {
						type: "string",
						enum: ["positive", "negative", "neutral", "uncertain"],
					},
					timeHorizon: {
						type: "string",
						enum: ["immediate", "short_term", "long_term"],
					},
					confidence: {
						type: "string",
						enum: ["high", "medium", "low"],
					},
					confidenceEvidence: { type: "string" },
					status: {
						type: "string",
						enum: ["confirmed", "proposed", "speculative"],
					},
				},
				required: [
					"event",
					"affectedRegion",
					"eventDate",
					"sourceUrl",
					"publisher",
					"publicationDate",
					"companyConnection",
					"impact",
					"timeHorizon",
					"confidence",
					"confidenceEvidence",
					"status",
				],
			},
		},
		geopoliticalSummary: { type: "string" },
		sourceUrls: { type: "array", items: { type: "string" } },
		notes: { type: "string" },
	},
	required: [
		"ticker",
		"geopoliticalRisks",
		"geopoliticalSummary",
		"sourceUrls",
		"notes",
	],
});

function createGeopoliticalAgent(model: BaseChatModel, search: StructuredTool) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: GEOPOLITICAL_SYSTEM_PROMPT,
		responseFormat: geopoliticalResponseFormat,
	});
}

export { createGeopoliticalAgent };
