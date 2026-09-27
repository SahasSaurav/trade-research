import { z } from "zod";

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

const geopoliticalResearchSchema = z.object({
	ticker: z.string(),
	geopoliticalRisks: z.array(GeopoliticalEventSchema),
	geopoliticalSummary: z.string(),
	sourceUrls: z.array(z.string().url()),
	notes: z.string(),
});

export { GeopoliticalEventSchema, geopoliticalResearchSchema };
export type GeopoliticalResearch = z.infer<typeof geopoliticalResearchSchema>;
