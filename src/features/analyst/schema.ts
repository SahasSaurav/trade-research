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

type AnalystReportData = z.infer<typeof analystReportSchema>;

export { analystReportSchema };
export type { AnalystReportData };
