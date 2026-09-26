import { z } from "zod";

const summarySchema = z.object({
	ticker: z.string(),
	dateChecked: z.string(),
	summary: z.string(),
});

type SummaryData = z.infer<typeof summarySchema>;

export type { SummaryData };
export { summarySchema };
