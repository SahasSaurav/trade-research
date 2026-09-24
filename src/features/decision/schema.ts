import { z } from "zod";

// Decision output schema
const decisionSchema = z.object({
	recommendation: z.enum(["buy", "hold", "avoid"]),
	valuationAssessment: z.enum(["undervalued", "fairly_valued", "overvalued"]),
	fairValueEstimate: z.number(),
	fairValueMethod: z.string(),
	entryPriceRange: z.object({
		min: z.number(),
		max: z.number(),
		rationale: z.string(),
	}),
	priceTriggers: z.array(
		z.object({
			triggerType: z.enum(["buy", "sell", "stop_loss", "take_profit"]),
			price: z.number(),
			explanation: z.string(),
		}),
	),
	sentimentAssessment: z.enum(["positive", "neutral", "negative", "unknown"]),
	sentimentScore: z.number().min(-1).max(1).nullable(),
	geopoliticalRisk: z.enum(["low", "medium", "high", "unknown"]),
	geopoliticalFactors: z.array(z.string()),
	keyRisks: z.array(z.string()),
	keyUncertainties: z.array(z.string()),
	dataDates: z.object({
		valuation: z.string(),
		analyst: z.string(),
		sentiment: z.string(),
	}),
	sourceUrls: z.array(z.string().url()),
	disclaimer: z.string(),
});

// Gemini JSON Schema for the agent's structured tool output: single-string
// `type` + `nullable`, no `format`/`minimum`/`maximum`/`additionalProperties`.
const decisionJsonSchema: { type: "object" } & Record<string, unknown> = {
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
};

type DecisionData = z.infer<typeof decisionSchema>;

export type { DecisionData };
export { decisionJsonSchema, decisionSchema };
