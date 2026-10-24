import { z } from "zod";

/** One dated, cited piece of news sentiment evidence. */
const NewsSentimentSourceSchema = z.object({
	source: z.string(),
	sentiment: z.enum(["positive", "neutral", "negative"]),
	confidence: z.enum(["high", "medium", "low"]),
	date: z.string(),
	summary: z.string(),
	sourceUrl: z.string().url(),
});

const newsSentimentResearchSchema = z.object({
	ticker: z.string(),
	newsSentimentSources: z.array(NewsSentimentSourceSchema),
	newsSentimentSummary: z.string(),
	sourceUrls: z.array(z.string().url()),
});

export { newsSentimentResearchSchema, NewsSentimentSourceSchema };
