import { z } from "zod";

const valuationSchema = z.object({
	ticker: z.string(),
	dateChecked: z.string(),
	trailingEPS: z.number().nullable(),
	forwardEPS: z.number().nullable(),
	trailingPE: z.number().nullable(),
	forwardPE: z.number().nullable(),
	pegRatio: z.number().nullable(),
	sourceUrls: z.array(z.string()),
	notes: z.string().optional(),
});

// Gemini JSON Schema for the agent's structured tool output: single-string
// `type` + `nullable`, no `format`/`minimum`/`maximum`/`additionalProperties`.
const valuationJsonSchema: { type: "object" } & Record<string, unknown> = {
	type: "object",
	properties: {
		ticker: { type: "string" },
		dateChecked: { type: "string" },
		trailingEPS: { type: "number", nullable: true },
		forwardEPS: { type: "number", nullable: true },
		trailingPE: { type: "number", nullable: true },
		forwardPE: { type: "number", nullable: true },
		pegRatio: { type: "number", nullable: true },
		sourceUrls: { type: "array", items: { type: "string" } },
		notes: { type: "string" },
	},
	required: [
		"ticker",
		"dateChecked",
		"trailingEPS",
		"forwardEPS",
		"trailingPE",
		"forwardPE",
		"pegRatio",
		"sourceUrls",
	],
};

type ValuationData = z.infer<typeof valuationSchema>;

export type { ValuationData };
export { valuationJsonSchema, valuationSchema };
