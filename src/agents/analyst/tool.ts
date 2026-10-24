import { moduleOptions, yahooClient } from "@src/utils/yahoo/client.js";
import { formatDate, formatNumber, table } from "@src/utils/yahoo/format.js";
import {
	asNumber,
	asString,
	failure,
	quotePageUrl,
	TICKER,
} from "@src/utils/yahoo/utils.js";
import { tool } from "langchain";
import { z } from "zod";

/**
 * Yahoo Finance as a structured source for the analyst agent. The tool returns
 * markdown the model reads as the consensus baseline, then turns to web search
 * for the firm-by-firm reports; a failure returns a sentinel, never a throw.
 */

const yahooAnalystConsensus = tool(
	async ({ ticker, historyLimit }) => {
		try {
			const summary = await yahooClient.quoteSummary(
				ticker,
				{
					modules: [
						"financialData",
						"recommendationTrend",
						"upgradeDowngradeHistory",
						"earningsTrend",
					],
				},
				moduleOptions,
			);

			const financial = summary.financialData;
			const current = summary.recommendationTrend?.trend?.[0];
			const history = (summary.upgradeDowngradeHistory?.history ?? []).slice(
				0,
				historyLimit,
			);
			const estimates = (summary.earningsTrend?.trend ?? []).filter(
				(row) => row.period === "0y" || row.period === "+1y",
			);

			if (!financial && !current && history.length === 0) {
				return `NO_DATA_AVAILABLE: yahoo_analyst_consensus returned no consensus or rating history for ${ticker.toUpperCase()}. Report analyst data as unavailable rather than estimating it.`;
			}

			const counts = current
				? [
						`Strong buy ${current.strongBuy}`,
						`Buy ${current.buy}`,
						`Hold ${current.hold}`,
						`Sell ${current.sell}`,
						`Strong sell ${current.strongSell}`,
					].join(", ")
				: null;

			return [
				`# Yahoo Finance analyst consensus for ${ticker.toUpperCase()}`,
				"",
				table("Consensus (current month)", [
					["Rating distribution", counts],
					[
						"Recommendation mean (1 = strong buy, 5 = strong sell)",
						formatNumber(asNumber(financial?.recommendationMean)),
					],
					["Recommendation key", asString(financial?.recommendationKey)],
					[
						"Analysts covering",
						formatNumber(asNumber(financial?.numberOfAnalystOpinions), 0),
					],
					[
						"Mean price target",
						formatNumber(asNumber(financial?.targetMeanPrice)),
					],
					[
						"Median price target",
						formatNumber(asNumber(financial?.targetMedianPrice)),
					],
					[
						"High price target",
						formatNumber(asNumber(financial?.targetHighPrice)),
					],
					[
						"Low price target",
						formatNumber(asNumber(financial?.targetLowPrice)),
					],
					["Current price", formatNumber(asNumber(financial?.currentPrice))],
				]),
				table(
					"Consensus EPS estimates",
					estimates.flatMap((row) => {
						const label =
							row.period === "0y" ? "Current fiscal year" : "Next fiscal year";
						return [
							[
								`${label} EPS estimate`,
								formatNumber(asNumber(row.earningsEstimate?.avg)),
							],
							[
								`${label} analysts`,
								formatNumber(
									asNumber(row.earningsEstimate?.numberOfAnalysts),
									0,
								),
							],
							[
								`${label} revenue estimate`,
								formatNumber(asNumber(row.revenueEstimate?.avg), 0),
							],
							[
								`${label} EPS revisions (7d up / 30d up / 30d down)`,
								`${formatNumber(asNumber(row.epsRevisions?.upLast7days), 0)} / ${formatNumber(asNumber(row.epsRevisions?.upLast30days), 0)} / ${formatNumber(asNumber(row.epsRevisions?.downLast30days), 0)}`,
							],
						] as [string, string][];
					}),
				),
				history.length > 0
					? [
							"### Recent rating and target actions",
							"",
							"| Date | Firm | Action | Rating change | Target action | Target |",
							"| --- | --- | --- | --- | --- | --- |",
							...history.map((entry) => {
								const target =
									asNumber(entry.currentPriceTarget) ??
									asNumber(entry.priorPriceTarget);
								return `| ${formatDate(entry.epochGradeDate)} | ${entry.firm} | ${entry.action} | ${entry.fromGrade ? `${entry.fromGrade} → ` : ""}${entry.toGrade} | ${entry.priceTargetAction || "—"} | ${target === null || target === 0 ? "—" : target.toFixed(2)} |`;
							}),
							"",
						].join("\n")
					: "",
				`Source: ${quotePageUrl(ticker, "/analysis/")}`,
				"",
				"Yahoo aggregates firm ratings into its own scale and keeps only a recent sample of rating actions. Treat the distribution and targets as an aggregate signal; the firm-by-firm reports still come from search.",
			]
				.filter(Boolean)
				.join("\n");
		} catch (error) {
			return failure("yahoo_analyst_consensus", error);
		}
	},
	{
		name: "yahoo_analyst_consensus",
		description:
			"Sell-side consensus for one ticker from Yahoo Finance: the current-month rating distribution (strong buy to strong sell), recommendation mean and key, number of covering analysts, mean/median/high/low price targets with the current price, consensus EPS and revenue estimates for the current and next fiscal year, recent EPS revisions, and the latest firm-by-firm rating and target actions with dates. Use it for consensus and rating changes; use web search to read and cite individual firm reports.",
		schema: z.object({
			ticker: TICKER,
			historyLimit: z
				.number()
				.int()
				.min(1)
				.max(30)
				.default(10)
				.describe("How many recent rating actions to list."),
		}),
	},
);

export { yahooAnalystConsensus };
