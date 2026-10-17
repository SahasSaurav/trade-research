const SENTIMENT_VALUES = { positive: 1, neutral: 0, negative: -1 } as const;

const CONFIDENCE_WEIGHTS = { high: 1, medium: 0.65, low: 0.35 } as const;

/**
 * A near-zero mean is either a quiet picture or two loud sides cancelling: one
 * positive source and one negative source also average to zero. Above this
 * share of the total weight sitting on *both* sides the read is "mixed"; below
 * it the near-zero mean is taken at face value as "neutral".
 */
const MIXED_OPPOSITION_SHARE = 0.2;

/**
 * Total evidence weight that earns each confidence label: two fresh
 * high-confidence sources reach "high", one is "medium", and a single weak or
 * old source stays "low".
 */
const HIGH_CONFIDENCE_WEIGHT = 1.5;
const MEDIUM_CONFIDENCE_WEIGHT = 0.6;

type SentimentSource = {
	sentiment: keyof typeof SENTIMENT_VALUES;
	confidence: keyof typeof CONFIDENCE_WEIGHTS;
	date: string;
};

type SentimentScore = {
	sentimentScore: number | null;
	overallSentiment: "positive" | "mixed" | "neutral" | "negative" | "unknown";
	sentimentConfidence: "low" | "medium" | "high";
};

/**
 * Recency ladder: full weight for the last week, then 0.75 / 0.4, and nothing
 * past 90 days. An unparseable date falls back to a weak weight rather than
 * being treated as fresh or dropped.
 */
function recencyWeight(date: string): number {
	const publishedAt = Date.parse(date);
	if (Number.isNaN(publishedAt)) return 0.25;
	const ageDays = Math.max(0, (Date.now() - publishedAt) / 86_400_000);
	if (ageDays <= 7) return 1;
	if (ageDays <= 30) return 0.75;
	if (ageDays <= 90) return 0.4;
	return 0;
}

/**
 * The model selects and cites the sources; this decides the number, so the
 * same sources always score the same however the orchestrator phrased its
 * output. Confidence sets the base weight, recency decays it.
 */
function scoreSentimentSources(sources: SentimentSource[]): SentimentScore {
	const { weightedScore, totalWeight, positiveWeight, negativeWeight } =
		sources.reduce(
			(total, source) => {
				const weight =
					CONFIDENCE_WEIGHTS[source.confidence] * recencyWeight(source.date);
				const value = SENTIMENT_VALUES[source.sentiment];
				return {
					weightedScore: total.weightedScore + value * weight,
					totalWeight: total.totalWeight + weight,
					positiveWeight: total.positiveWeight + (value > 0 ? weight : 0),
					negativeWeight: total.negativeWeight + (value < 0 ? weight : 0),
				};
			},
			{
				weightedScore: 0,
				totalWeight: 0,
				positiveWeight: 0,
				negativeWeight: 0,
			},
		);

	if (totalWeight <= 0) {
		return {
			sentimentScore: null,
			overallSentiment: "unknown",
			sentimentConfidence: "low",
		};
	}

	const sentimentScore = Number((weightedScore / totalWeight).toFixed(2));
	const oppositionWeight =
		Math.min(positiveWeight, negativeWeight) / totalWeight;
	const overallSentiment =
		sentimentScore > 0.15
			? "positive"
			: sentimentScore < -0.15
				? "negative"
				: oppositionWeight >= MIXED_OPPOSITION_SHARE
					? "mixed"
					: "neutral";
	const sentimentConfidence =
		totalWeight >= HIGH_CONFIDENCE_WEIGHT
			? "high"
			: totalWeight >= MEDIUM_CONFIDENCE_WEIGHT
				? "medium"
				: "low";

	return { sentimentScore, overallSentiment, sentimentConfidence };
}

export { scoreSentimentSources };
export type { SentimentScore, SentimentSource };
