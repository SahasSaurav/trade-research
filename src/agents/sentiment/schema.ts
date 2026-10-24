import { GeopoliticalEventSchema } from "@src/agents/sentiment/subagents/geopolitical/schema.js";
import { NewsSentimentSourceSchema } from "@src/agents/sentiment/subagents/news-sentiment/schema.js";
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
	overallSentiment: z.enum([
		"positive",
		"mixed",
		"neutral",
		"negative",
		"unknown",
	]),
	sentimentScore: z.number().min(-1).max(1).nullable(),
	/** How much weighted evidence backs the band; computed by scoreSentimentSources. */
	sentimentConfidence: z.enum(["low", "medium", "high"]),
	sourceUrls: z.array(z.string().url()),
});

export { sentimentResearchSchema, sentimentSchema };
export type SentimentResearchData = z.infer<typeof sentimentResearchSchema>;
export type SentimentData = z.infer<typeof sentimentSchema>;
