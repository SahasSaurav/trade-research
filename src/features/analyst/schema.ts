import { z } from "zod";

const analystReportSchema = z.object({
	ticker: z.string(),
	dateChecked: z.string(),
	reports: z.array(
		z.object({
			firm: z.string(),
			reportTitle: z.string(),
			rating: z.string(),
			priceTarget: z.number().nullable(),
			reportDate: z.string(),
			sourceUrl: z.string(),
			summary: z.string(),
		}),
	),
});

// Gemini JSON Schema for the agent's structured tool output: single-string
// `type` + `nullable`, no `format`/`minimum`/`maximum`/`additionalProperties`.
const analystJsonSchema: { type: "object" } & Record<string, unknown> = {
	type: "object",
	properties: {
		ticker: { type: "string" },
		dateChecked: { type: "string" },
		reports: {
			type: "array",
			items: {
				type: "object",
				properties: {
					firm: { type: "string" },
					reportTitle: { type: "string" },
					rating: { type: "string" },
					priceTarget: { type: "number", nullable: true },
					reportDate: { type: "string" },
					sourceUrl: { type: "string" },
					summary: { type: "string" },
				},
				required: [
					"firm",
					"reportTitle",
					"rating",
					"priceTarget",
					"reportDate",
					"sourceUrl",
					"summary",
				],
			},
		},
	},
	required: ["ticker", "dateChecked", "reports"],
};

type AnalystReportData = z.infer<typeof analystReportSchema>;

export type { AnalystReportData };
export { analystJsonSchema, analystReportSchema };
