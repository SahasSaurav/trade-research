import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { DECISION_SYSTEM_PROMPT } from "@src/features/decision/prompt.js";
import { createAgent, toolStrategy } from "langchain";

// Gemini Schema subset: single-string `type`, `nullable`, no `$schema`,
// no `additionalProperties`, no `format`/`minimum`/`maximum`.
const decisionResponseFormat = toolStrategy({
	type: "object",
	properties: {
		recommendation: { type: "string", enum: ["buy", "hold", "avoid"] },
		valuationAssessment: {
			type: "string",
			enum: ["undervalued", "fairly_valued", "overvalued"],
		},
		fairValueEstimate: { type: "number" },
		fairValueMethod: { type: "string" },
		entryPriceRange: {
			type: "object",
			properties: {
				min: { type: "number" },
				max: { type: "number" },
				rationale: { type: "string" },
			},
			required: ["min", "max", "rationale"],
		},
		priceTriggers: {
			type: "array",
			items: {
				type: "object",
				properties: {
					triggerType: {
						type: "string",
						enum: ["buy", "sell", "stop_loss", "take_profit"],
					},
					price: { type: "number" },
					explanation: { type: "string" },
				},
				required: ["triggerType", "price", "explanation"],
			},
		},
		sentimentAssessment: {
			type: "string",
			enum: ["positive", "neutral", "negative", "unknown"],
		},
		sentimentScore: { type: "number", nullable: true },
		geopoliticalRisk: {
			type: "string",
			enum: ["low", "medium", "high", "unknown"],
		},
		geopoliticalFactors: { type: "array", items: { type: "string" } },
		keyRisks: { type: "array", items: { type: "string" } },
		keyUncertainties: { type: "array", items: { type: "string" } },
		dataDates: {
			type: "object",
			properties: {
				valuation: { type: "string" },
				analyst: { type: "string" },
				sentiment: { type: "string" },
			},
			required: ["valuation", "analyst", "sentiment"],
		},
		sourceUrls: { type: "array", items: { type: "string" } },
		disclaimer: { type: "string" },
	},
	required: [
		"recommendation",
		"valuationAssessment",
		"fairValueEstimate",
		"fairValueMethod",
		"entryPriceRange",
		"priceTriggers",
		"sentimentAssessment",
		"sentimentScore",
		"geopoliticalRisk",
		"geopoliticalFactors",
		"keyRisks",
		"keyUncertainties",
		"dataDates",
		"sourceUrls",
		"disclaimer",
	],
});

function createDecisionAgent(model: BaseChatModel) {
	return createAgent({
		model,
		tools: [],
		systemPrompt: DECISION_SYSTEM_PROMPT,
		responseFormat: decisionResponseFormat,
	});
}

export { createDecisionAgent };
