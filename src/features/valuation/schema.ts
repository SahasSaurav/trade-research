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

type ValuationData = z.infer<typeof valuationSchema>;

export type { ValuationData };
export { valuationSchema };
