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

// Gemini JSON Schema for the agent's structured tool output: single-string
// `type` + `nullable`, no `format`/`minimum`/`maximum`/`additionalProperties`.
const geopoliticalJsonSchema: { type: "object" } & Record<string, unknown> = {
	type: "object",
	properties: {
		ticker: { type: "string" },
		geopoliticalRisks: {
			type: "array",
			items: {
				type: "object",
				properties: {
					event: { type: "string" },
					affectedRegion: { type: "string" },
					eventDate: { type: "string" },
					sourceUrl: { type: "string" },
					publisher: { type: "string" },
					publicationDate: { type: "string" },
					companyConnection: {
						type: "string",
						enum: [
							"revenue_exposure",
							"operations",
							"suppliers",
							"customers",
							"logistics",
							"commodities",
							"regulation",
							"market_access",
							"none",
						],
					},
					impact: {
						type: "string",
						enum: ["positive", "negative", "neutral", "uncertain"],
					},
					timeHorizon: {
						type: "string",
						enum: ["immediate", "short_term", "long_term"],
					},
					confidence: { type: "string", enum: ["high", "medium", "low"] },
					confidenceEvidence: { type: "string" },
					status: {
						type: "string",
						enum: ["confirmed", "proposed", "speculative"],
					},
				},
				required: [
					"event",
					"affectedRegion",
					"eventDate",
					"sourceUrl",
					"publisher",
					"publicationDate",
					"companyConnection",
					"impact",
					"timeHorizon",
					"confidence",
					"confidenceEvidence",
					"status",
				],
			},
		},
		geopoliticalSummary: { type: "string" },
		sourceUrls: { type: "array", items: { type: "string" } },
		notes: { type: "string" },
	},
	required: [
		"ticker",
		"geopoliticalRisks",
		"geopoliticalSummary",
		"sourceUrls",
		"notes",
	],
};

export {
	GeopoliticalEventSchema,
	geopoliticalJsonSchema,
	geopoliticalResearchSchema,
};
export type GeopoliticalEvent = z.infer<typeof GeopoliticalEventSchema>;
export type GeopoliticalResearch = z.infer<typeof geopoliticalResearchSchema>;
