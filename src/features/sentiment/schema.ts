import { z } from "zod";
import { GeopoliticalEventSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";

const sentimentSchema = z.object({
	ticker: z.string(),
	overallSentiment: z.enum(["positive", "neutral", "negative", "unknown"]),
	sentimentScore: z.number().min(-1).max(1).nullable(),
	sentimentSources: z.array(
		z.object({
			source: z.string(),
			sentiment: z.enum(["positive", "neutral", "negative"]),
			evidenceStrength: z.enum(["high", "medium", "low"]),
			date: z.string(),
			summary: z.string(),
		}),
	),
	geopoliticalRisks: z.array(GeopoliticalEventSchema).nullable(),
	geopoliticalSummary: z.string().nullable(),
	dateChecked: z.string(),
	sourceUrls: z.array(z.string().url()),
	notes: z.string().nullable(),
});

export { sentimentSchema };
export type SentimentData = z.infer<typeof sentimentSchema>;
