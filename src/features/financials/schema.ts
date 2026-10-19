import { z } from "zod";

const insiderTransactionSchema = z.object({
	insider: z.string(),
	role: z.string(),
	transactionType: z.enum(["buy", "sell", "other"]),
	shares: z.number().nullable(),
	value: z.number().nullable(),
	date: z.string(),
	sourceUrl: z.string(),
});

/**
 * The merged valuation + fundamentals artifact. One agent collects both because
 * the same filing carries them, and keeping them apart fetched the same diluted
 * EPS twice. The share price is a tool input only — the market analyst records
 * it — so it is deliberately absent here.
 */
const financialsSchema = z.object({
	ticker: z.string(),
	dateChecked: z
		.string()
		.describe(
			"Date the research was checked: today, in UTC, ISO 8601 (YYYY-MM-DD).",
		),
	fiscalPeriod: z.string().nullable(),
	trailingEPS: z.number().nullable(),
	forwardEPS: z.number().nullable(),
	trailingPE: z.number().nullable(),
	forwardPE: z.number().nullable(),
	pegRatio: z.number().nullable(),
	revenueTTM: z.number().nullable(),
	revenueGrowthYoY: z.number().nullable(),
	grossMargin: z.number().nullable(),
	operatingMargin: z.number().nullable(),
	netMargin: z.number().nullable(),
	netIncomeTTM: z.number().nullable(),
	operatingCashFlowTTM: z.number().nullable(),
	freeCashFlowTTM: z.number().nullable(),
	totalDebt: z.number().nullable(),
	cashAndEquivalents: z.number().nullable(),
	netDebt: z.number().nullable(),
	debtToEquity: z.number().nullable(),
	interestCoverage: z.number().nullable(),
	returnOnEquity: z.number().nullable(),
	returnOnAssets: z.number().nullable(),
	insiderTransactions: z.array(insiderTransactionSchema),
	sourceUrls: z.array(z.string()),
	notes: z.string().optional(),
});

type FinancialsData = z.infer<typeof financialsSchema>;

export type { FinancialsData };
export { financialsSchema };
