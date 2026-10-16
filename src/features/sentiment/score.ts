const SENTIMENT_VALUES = { positive: 1, neutral: 0, negative: -1 } as const;

const EVIDENCE_WEIGHTS = { high: 1, medium: 0.65, low: 0.35 } as const;

type SentimentSource = {
	sentiment: keyof typeof SENTIMENT_VALUES;
	evidenceStrength: keyof typeof EVIDENCE_WEIGHTS;
	date: string;
};

type SentimentScore = {
	sentimentScore: number | null;
	overallSentiment: "positive" | "neutral" | "negative" | "unknown";
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
 * output. Evidence strength sets the base weight, recency decays it.
 */
function scoreSentimentSources(sources: SentimentSource[]): SentimentScore {
	const { weightedScore, totalWeight } = sources.reduce(
		(total, source) => {
			const weight =
				EVIDENCE_WEIGHTS[source.evidenceStrength] * recencyWeight(source.date);
			return {
				weightedScore:
					total.weightedScore + SENTIMENT_VALUES[source.sentiment] * weight,
				totalWeight: total.totalWeight + weight,
			};
		},
		{ weightedScore: 0, totalWeight: 0 },
	);

	if (totalWeight <= 0) {
		return { sentimentScore: null, overallSentiment: "unknown" };
	}

	const sentimentScore = Number((weightedScore / totalWeight).toFixed(2));
	const overallSentiment =
		sentimentScore > 0.15
			? "positive"
			: sentimentScore < -0.15
				? "negative"
				: "neutral";

	return { sentimentScore, overallSentiment };
}

export { scoreSentimentSources };
export type { SentimentScore, SentimentSource };
