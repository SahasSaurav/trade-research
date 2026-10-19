import { z } from "zod";

const analystReportSchema = z.object({
	ticker: z.string(),
	dateChecked: z
		.string()
		.describe(
			"Date the research was checked: today, in UTC, ISO 8601 (YYYY-MM-DD).",
		),
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

type AnalystReportData = z.infer<typeof analystReportSchema>;

export type { AnalystReportData };
export { analystReportSchema };
