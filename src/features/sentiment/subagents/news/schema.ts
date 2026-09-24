import { z } from "zod";

const newsSentimentResearchSchema = z.object({
	ticker: z.string(),
	sentimentSources: z.array(
		z.object({
			source: z.string(),
			sentiment: z.enum(["positive", "neutral", "negative"]),
			evidenceStrength: z.enum(["high", "medium", "low"]),
			date: z.string(),
			summary: z.string(),
			sourceUrl: z.string().url(),
		}),
	),
	sourceUrls: z.array(z.string().url()),
	notes: z.string(),
});

// Gemini JSON Schema for the agent's structured tool output: single-string
// `type` + `nullable`, no `format`/`minimum`/`maximum`/`additionalProperties`.
const newsJsonSchema: { type: "object" } & Record<string, unknown> = {
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
};

export { newsJsonSchema, newsSentimentResearchSchema };
export type NewsSentimentResearch = z.infer<typeof newsSentimentResearchSchema>;
