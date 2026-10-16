import { GeopoliticalEventSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import { NewsSentimentSourceSchema } from "@src/features/sentiment/subagents/news-sentiment/schema.js";
import { z } from "zod";

/**
 * What the orchestrator returns: evidence only. The node stamps the ticker,
 * date, score and consolidated URLs, so the model never invents a number.
 */
const sentimentResearchSchema = z.object({
	newsSentimentSources: z.array(NewsSentimentSourceSchema),
	newsSentimentSummary: z.string().nullable(),
	geopoliticalRisks: z.array(GeopoliticalEventSchema),
	geopoliticalSummary: z.string().nullable(),
	researchStatus: z.object({
		news: z.enum(["complete", "failed"]),
		geopolitical: z.enum(["complete", "failed"]),
	}),
});

/** The artifact that flows through the graph into decision and summary. */
const sentimentSchema = sentimentResearchSchema.extend({
	ticker: z.string(),
	dateChecked: z.string(),
	overallSentiment: z.enum(["positive", "neutral", "negative", "unknown"]),
	sentimentScore: z.number().min(-1).max(1).nullable(),
	sourceUrls: z.array(z.string().url()),
});

export { sentimentResearchSchema, sentimentSchema };
export type SentimentResearchData = z.infer<typeof sentimentResearchSchema>;
export type SentimentData = z.infer<typeof sentimentSchema>;
