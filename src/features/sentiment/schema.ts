import { z } from "zod";

// Geopolitical event schema
const GeopoliticalEventSchema = z.object({
	event: z.string(),
	affectedRegion: z.string(),
	eventDate: z.string(),
	sourceUrl: z.string().url(),
	publisher: z.string(),
	publicationDate: z.string(),
	companyConnection: z.enum([
		"revenue_exposure",
		"operations",
		"suppliers",
		"customers",
		"logistics",
		"commodities",
		"regulation",
		"market_access",
		"none",
	]),
	impact: z.enum(["positive", "negative", "neutral", "uncertain"]),
	timeHorizon: z.enum(["immediate", "short_term", "long_term"]),
	confidence: z.enum(["high", "medium", "low"]),
	confidenceEvidence: z.string(),
	status: z.enum(["confirmed", "proposed", "speculative"]),
});

// Sentiment output schema
const sentimentSchema = z.object({
	ticker: z.string(),
	overallSentiment: z.enum(["positive", "neutral", "negative"]),
	sentimentScore: z.number().min(-1).max(1),
	sentimentSources: z.array(
		z.object({
			source: z.string(),
			sentiment: z.enum(["positive", "neutral", "negative"]),
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

export { GeopoliticalEventSchema, sentimentSchema };
export type GeopoliticalEvent = z.infer<typeof GeopoliticalEventSchema>;
export type SentimentData = z.infer<typeof sentimentSchema>;
