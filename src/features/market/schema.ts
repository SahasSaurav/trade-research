import { z } from "zod";

const marketSchema = z.object({
	ticker: z.string(),
	dateChecked: z.string(),
	price: z.number().nullable(),
	priceDate: z.string().nullable(),
	trend: z.enum(["uptrend", "downtrend", "sideways"]).nullable(),
	trendStrength: z.enum(["weak", "moderate", "strong"]).nullable(),
	sma50: z.number().nullable(),
	sma200: z.number().nullable(),
	ema10: z.number().nullable(),
	rsi14: z.number().nullable(),
	atr14: z.number().nullable(),
	atrPercent: z.number().nullable(),
	supportLevels: z.array(z.number()),
	resistanceLevels: z.array(z.number()),
	volumeTrend: z.enum(["rising", "falling", "flat", "unknown"]),
	signals: z.array(
		z.object({
			indicator: z.string(),
			reading: z.string(),
			interpretation: z.string(),
		}),
	),
	sourceUrls: z.array(z.string()),
	notes: z.string().optional(),
});

type MarketData = z.infer<typeof marketSchema>;

export type { MarketData };
export { marketSchema };
