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
	sentimentAssessment: z.enum(["positive", "neutral", "negative"]),
	sentimentScore: z.number(),
	geopoliticalRisk: z.enum(["low", "medium", "high"]),
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

type DecisionData = z.infer<typeof decisionSchema>;

export { decisionSchema };
export type { DecisionData };
