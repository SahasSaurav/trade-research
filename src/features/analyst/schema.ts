import { z } from "zod";

/**
 * The normalized rating scale.
 *
 * The skill maps every house vocabulary onto these three — Overweight,
 * Outperform and Accumulate are Buy; Market Perform and Equal-weight are
 * Hold; Underperform and Reduce are Sell. The enum is where that mapping
 * becomes binding: without it the artifact can carry "Market Perform" into
 * the debate and the decision as if it were the agreed scale.
 */
const RATING_SCALE = ["Buy", "Hold", "Sell"] as const;

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
			rating: z.enum(RATING_SCALE),
			priceTarget: z.number().nullable(),
			reportDate: z.string(),
			sourceUrl: z.string(),
			summary: z.string(),
		}),
	),
});

type AnalystReportData = z.infer<typeof analystReportSchema>;

export type { AnalystReportData };
export { analystReportSchema, RATING_SCALE };
