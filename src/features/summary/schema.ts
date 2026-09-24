import { z } from "zod";

const summarySchema = z.object({
	ticker: z.string(),
	dateChecked: z.string(),
	summary: z.string(),
});

// Gemini JSON Schema for the agent's structured tool output: single-string
// `type` + `nullable`, no `format`/`minimum`/`maximum`/`additionalProperties`.
const summaryJsonSchema: { type: "object" } & Record<string, unknown> = {
	type: "object",
	properties: {
		ticker: { type: "string" },
		dateChecked: { type: "string" },
		summary: { type: "string" },
	},
	required: ["ticker", "dateChecked", "summary"],
};

type SummaryData = z.infer<typeof summarySchema>;

export type { SummaryData };
export { summaryJsonSchema, summarySchema };
