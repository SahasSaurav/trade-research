import { z } from "zod";

const newsSentimentResearchSchema = z.object({
	ticker: z.string(),
	sentimentSources: z.array(
		z.object({
			source: z.string(),
			sentiment: z.enum(["positive", "neutral", "negative"]),
			date: z.string(),
			summary: z.string(),
			sourceUrl: z.string().url(),
		}),
	),
	sourceUrls: z.array(z.string().url()),
	notes: z.string(),
});

export { newsSentimentResearchSchema };
