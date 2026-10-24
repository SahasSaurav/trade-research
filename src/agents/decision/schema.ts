import { z } from "zod";

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
	// Valuation/catalyst thresholds only. Concrete execution levels — stop-loss,
	// take-profit and sizing — live in executionPlan below, grounded in the
	// market artifact's support, resistance and ATR.
	priceTriggers: z.array(
		z.object({
			triggerType: z.enum(["buy", "sell"]),
			price: z.number(),
			explanation: z.string(),
		}),
	),
	// The execution plan sits with the call by design: one agent owns both the
	// recommendation and the levels, so a stop can never contradict the call.
	executionPlan: z.object({
		entryPrice: z.number().nullable(),
		stopLoss: z.number().nullable(),
		takeProfit: z.number().nullable(),
		positionSizing: z.string().nullable(),
		rationale: z.string(),
	}),
	sentimentAssessment: z.enum([
		"positive",
		"mixed",
		"neutral",
		"negative",
		"unknown",
	]),
	sentimentScore: z.number().min(-1).max(1).nullable(),
	geopoliticalRisk: z.enum(["low", "medium", "high", "unknown"]),
	geopoliticalFactors: z.array(z.string()),
	keyRisks: z.array(z.string()),
	keyUncertainties: z.array(z.string()),
	dataDates: z.object({
		financials: z.string(),
		analyst: z.string(),
		sentiment: z.string(),
	}),
	sourceUrls: z.array(z.string().url()),
	disclaimer: z.string(),
});

type DecisionData = z.infer<typeof decisionSchema>;

export type { DecisionData };
export { decisionSchema };
