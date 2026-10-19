import { moduleOptions, yahooClient } from "@src/utils/yahoo/client.js";
import {
	formatDate,
	formatNumber,
	formatPercent,
	formatPercentValue,
	table,
} from "@src/utils/yahoo/format.js";
import {
	asDate,
	asNumber,
	failure,
	quotePageUrl,
	TICKER,
} from "@src/utils/yahoo/utils.js";
import { tool } from "langchain";
import { z } from "zod";

/**
 * The financials agent's tools: deterministic valuation multiples, plus the
 * Yahoo Finance fundamentals, statements and insider views — one pass over the
 * same filings, with EPS recorded once.
 */

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

const isUsableDivisor = (value: number | null): value is number =>
	value !== null && Number.isFinite(value) && value !== 0;

/**
 * Deterministic valuation multiples. Left to the agent, decimal division
 * drifts in-head and the emitted multiple can disagree with the EPS values in
 * the same response. Computing here also turns an uncomputable multiple into a
 * null the schema permits, rather than a confident wrong number.
 *
 * PEG follows the standard convention: trailing P/E divided by the growth rate
 * expressed in percent, so P/E 18 with 12% growth yields 1.5.
 *
 * INPUTS ARE REQUIRED NUMBERS, NOT NULLABLE FIELDS. Gemini's Schema proto
 * types `type` as a single enum, so it rejects the JSON Schema union zod emits
 * for `.nullable()` — `"type": ["number", "null"]` fails the request with
 * "Proto field is not repeating, cannot start list". `.optional()` emits a safe
 * single type, but @langchain/core throws ToolInputParsingException on a null
 * argument before any error handling, so a weaker model sending an explicit
 * null would break the run. Passing 0 for "could not verify" sidesteps both:
 * every field already treats 0 as not computable.
 */
const computeValuationMultiples = tool(
	({ price, trailingEps, forwardEps, growthRatePercent }) => {
		const result: {
			trailingPE: number | null;
			forwardPE: number | null;
			pegRatio: number | null;
			uncomputed: string[];
		} = {
			trailingPE: null,
			forwardPE: null,
			pegRatio: null,
			uncomputed: [],
		};

		if (!Number.isFinite(price) || price <= 0) {
			result.uncomputed.push(
				"share price missing or non-positive: trailingPE, forwardPE and pegRatio not computed",
			);
			return result;
		}

		if (isUsableDivisor(trailingEps)) {
			result.trailingPE = round(price / trailingEps);
		} else {
			result.uncomputed.push(
				"trailingEPS missing or zero: trailingPE not computed",
			);
		}

		if (isUsableDivisor(forwardEps)) {
			result.forwardPE = round(price / forwardEps);
		} else {
			result.uncomputed.push(
				"forwardEPS missing or zero: forwardPE not computed",
			);
		}

		if (result.trailingPE === null) {
			return result;
		}

		if (!Number.isFinite(growthRatePercent) || growthRatePercent <= 0) {
			result.uncomputed.push(
				"long-term growth rate missing or non-positive: pegRatio not computed",
			);
		} else {
			result.pegRatio = round(result.trailingPE / growthRatePercent);
		}

		return result;
	},
	{
		name: "compute_valuation_multiples",
		description:
			"Compute trailing P/E, forward P/E and PEG from verified inputs. Call this instead of dividing by hand. All four inputs are required numbers: pass 0 for any input you could not verify, and the matching output comes back null with a reason rather than an estimate. PEG uses the growth rate in percent, so P/E 18 with growth 12 gives 1.5.",
		schema: z.object({
			price: z
				.number()
				.describe("Current share price in USD. Pass 0 if unverified."),
			trailingEps: z
				.number()
				.describe("Trailing twelve-month diluted EPS. Pass 0 if unverified."),
			forwardEps: z
				.number()
				.describe("Consensus forward diluted EPS. Pass 0 if unverified."),
			growthRatePercent: z
				.number()
				.describe(
					"Consensus long-term EPS growth rate in percent, e.g. 12 for 12%. Pass 0 if unavailable.",
				),
		}),
	},
);

const yahooFundamentals = tool(
	async ({ ticker }) => {
		try {
			const summary = await yahooClient.quoteSummary(
				ticker,
				{
					modules: [
						"financialData",
						"defaultKeyStatistics",
						"summaryDetail",
						"assetProfile",
						"calendarEvents",
					],
				},
				moduleOptions,
			);

			const financial = summary.financialData;
			const stats = summary.defaultKeyStatistics;
			const detail = summary.summaryDetail;
			const profile = summary.assetProfile;
			const calendar = summary.calendarEvents;

			if (!financial && !stats && !detail) {
				return `NO_DATA_AVAILABLE: yahoo_fundamentals returned no fundamental fields for ${ticker.toUpperCase()}. Report the figures as unavailable rather than estimating them.`;
			}

			const earningsDate = calendar?.earnings?.earningsDate?.[0];

			return [
				`# Yahoo Finance fundamentals for ${ticker.toUpperCase()}`,
				"",
				table("Company", [
					["Sector", profile?.sector],
					["Industry", profile?.industry],
					["Fiscal year end", formatDate(stats?.lastFiscalYearEnd)],
					["Most recent quarter", formatDate(stats?.mostRecentQuarter)],
					["Next earnings date", formatDate(earningsDate)],
				]),
				table("Valuation", [
					["Market cap", formatNumber(asNumber(detail?.marketCap), 0)],
					[
						"Enterprise value",
						formatNumber(asNumber(stats?.enterpriseValue), 0),
					],
					["Trailing P/E", formatNumber(asNumber(detail?.trailingPE))],
					["Forward P/E", formatNumber(asNumber(detail?.forwardPE))],
					["PEG ratio", formatNumber(asNumber(stats?.pegRatio))],
					["Price / book", formatNumber(asNumber(stats?.priceToBook))],
					["EV / revenue", formatNumber(asNumber(stats?.enterpriseToRevenue))],
					["EV / EBITDA", formatNumber(asNumber(stats?.enterpriseToEbitda))],
					["EPS (TTM)", formatNumber(asNumber(stats?.trailingEps))],
					["Forward EPS", formatNumber(asNumber(stats?.forwardEps))],
					["Book value per share", formatNumber(asNumber(stats?.bookValue))],
				]),
				table("Income statement (TTM)", [
					["Revenue", formatNumber(asNumber(financial?.totalRevenue), 0)],
					[
						"Revenue growth YoY",
						formatPercent(asNumber(financial?.revenueGrowth)),
					],
					["Gross profit", formatNumber(asNumber(financial?.grossProfits), 0)],
					["EBITDA", formatNumber(asNumber(financial?.ebitda), 0)],
					["Gross margin", formatPercent(asNumber(financial?.grossMargins))],
					[
						"Operating margin",
						formatPercent(asNumber(financial?.operatingMargins)),
					],
					["EBITDA margin", formatPercent(asNumber(financial?.ebitdaMargins))],
					["Net margin", formatPercent(asNumber(financial?.profitMargins))],
					[
						"Net income to common",
						formatNumber(asNumber(stats?.netIncomeToCommon), 0),
					],
					[
						"Earnings growth",
						formatPercent(asNumber(financial?.earningsGrowth)),
					],
				]),
				table("Balance sheet and returns", [
					["Total cash", formatNumber(asNumber(financial?.totalCash), 0)],
					["Total debt", formatNumber(asNumber(financial?.totalDebt), 0)],
					[
						"Debt / equity",
						formatPercentValue(asNumber(financial?.debtToEquity)),
					],
					["Current ratio", formatNumber(asNumber(financial?.currentRatio))],
					["Quick ratio", formatNumber(asNumber(financial?.quickRatio))],
					[
						"Return on equity",
						formatPercent(asNumber(financial?.returnOnEquity)),
					],
					[
						"Return on assets",
						formatPercent(asNumber(financial?.returnOnAssets)),
					],
				]),
				table("Cash flow", [
					[
						"Operating cash flow",
						formatNumber(asNumber(financial?.operatingCashflow), 0),
					],
					[
						"Free cash flow",
						formatNumber(asNumber(financial?.freeCashflow), 0),
					],
				]),
				table("Trading", [
					["Beta", formatNumber(asNumber(detail?.beta))],
					["Dividend yield", formatPercent(asNumber(detail?.dividendYield))],
					[
						"Shares outstanding",
						formatNumber(asNumber(stats?.sharesOutstanding), 0),
					],
					[
						"Short % of float",
						formatPercent(asNumber(stats?.shortPercentOfFloat)),
					],
					[
						"Institutional ownership",
						formatPercent(asNumber(stats?.heldPercentInstitutions)),
					],
				]),
				`Source: ${quotePageUrl(ticker, "/key-statistics/")}`,
				"",
				"Yahoo reports margins, returns, growth and debt/equity as percents here, and TTM figures as absolute amounts in the reporting currency. Values marked n/a were not provided — they are not zero.",
			]
				.filter(Boolean)
				.join("\n");
		} catch (error) {
			return failure("yahoo_fundamentals", error);
		}
	},
	{
		name: "yahoo_fundamentals",
		description:
			"Company fundamentals for one ticker from Yahoo Finance: sector and industry, fiscal year end, next earnings date, market cap and enterprise value, P/E, PEG, price/book, EV multiples, EPS, TTM revenue with growth, margins, EBITDA, net income, cash and debt, debt/equity, current and quick ratio, ROE, ROA, operating and free cash flow, beta, dividend yield and ownership. TTM figures are absolute amounts in the reporting currency.",
		schema: z.object({ ticker: TICKER }),
	},
);

const yahooStatements = tool(
	async ({ ticker, period, periods }) => {
		try {
			const spanDays = period === "quarterly" ? 2 * 365 : 4 * 365;
			const rows = await yahooClient.fundamentalsTimeSeries(
				ticker,
				{
					period1: new Date(Date.now() - spanDays * 86_400_000),
					period2: new Date(),
					type: period,
					module: "all",
				},
				// Yahoo returns a `TTM` periodType its own schema rejects, so
				// result validation is off and the fields are read by hand.
				{ ...moduleOptions, validateResult: false },
			);

			const usable = (rows as Record<string, unknown>[])
				.filter((row) => asDate(row.date) !== null)
				.toSorted(
					(a, b) =>
						(asDate(a.date)?.getTime() ?? 0) - (asDate(b.date)?.getTime() ?? 0),
				)
				.slice(-periods);

			if (usable.length === 0) {
				return `NO_DATA_AVAILABLE: yahoo_statements returned no ${period} statements for ${ticker.toUpperCase()}. Report the statement figures as unavailable rather than estimating them.`;
			}

			const lines: [string, string][] = [
				["Total revenue", "totalRevenue"],
				["Gross profit", "grossProfit"],
				["Operating income", "operatingIncome"],
				["EBIT", "EBIT"],
				["Interest expense", "interestExpense"],
				["Pretax income", "pretaxIncome"],
				["Net income", "netIncome"],
				["Diluted EPS", "dilutedEPS"],
				["Diluted average shares", "dilutedAverageShares"],
				["Total assets", "totalAssets"],
				["Total debt", "totalDebt"],
				["Cash and equivalents", "cashAndCashEquivalents"],
				[
					"Cash and short-term investments",
					"cashCashEquivalentsAndShortTermInvestments",
				],
				["Stockholders' equity", "stockholdersEquity"],
				["Operating cash flow", "operatingCashFlow"],
				["Capital expenditure", "capitalExpenditure"],
				["Free cash flow", "freeCashFlow"],
			];

			const header = `| Line item | ${usable
				.map((row) => formatDate(asDate(row.date)))
				.join(" | ")} |`;
			const divider = `| --- | ${usable.map(() => "---:").join(" | ")} |`;

			const body = lines
				.map(([label, key]) => {
					const values = usable.map((row) => asNumber(row[key]));
					if (values.every((value) => value === null)) return null;
					return `| ${label} | ${values
						.map((value) =>
							formatNumber(
								value,
								value !== null && Math.abs(value) < 1000 ? 2 : 0,
							),
						)
						.join(" | ")} |`;
				})
				.filter((line): line is string => line !== null);

			return [
				`# Yahoo Finance ${period} statements for ${ticker.toUpperCase()}`,
				"",
				`${usable.length} most recent ${period} period${usable.length === 1 ? "" : "s"}, oldest first. Amounts are in the reporting currency, not scaled.`,
				"",
				header,
				divider,
				...body,
				"",
				`Source: ${quotePageUrl(ticker, "/financials/")}`,
				"",
				"An n/a cell was not reported by Yahoo; it is not zero. Trailing figures are the sum of the last four reported quarters, not a forecast.",
			].join("\n");
		} catch (error) {
			return failure("yahoo_statements", error);
		}
	},
	{
		name: "yahoo_statements",
		description:
			"Reported income statement, balance sheet and cash flow lines for one ticker from Yahoo Finance, side by side across periods: revenue, gross profit, operating income, EBIT, interest expense, net income, diluted EPS and share count, total assets, total debt, cash, equity, operating cash flow, capex and free cash flow. Use it to verify TTM figures and to see the trend across periods.",
		schema: z.object({
			ticker: TICKER,
			period: z
				.enum(["annual", "quarterly", "trailing"])
				.default("annual")
				.describe(
					"Reporting period: annual fiscal years, individual quarters, or trailing twelve months.",
				),
			periods: z
				.number()
				.int()
				.min(1)
				.max(8)
				.default(3)
				.describe("How many most recent periods to include."),
		}),
	},
);

const yahooInsiderTransactions = tool(
	async ({ ticker, limit }) => {
		try {
			const summary = await yahooClient.quoteSummary(
				ticker,
				{ modules: ["insiderTransactions"] },
				moduleOptions,
			);
			const transactions = (
				summary.insiderTransactions?.transactions ?? []
			).slice(0, limit);

			if (transactions.length === 0) {
				return `NO_DATA_AVAILABLE: yahoo_insider_transactions returned no filed insider transactions for ${ticker.toUpperCase()}. An empty list is not evidence that insiders did not trade — say that no filed transactions were available.`;
			}

			return [
				`# Yahoo Finance insider transactions for ${ticker.toUpperCase()}`,
				"",
				"| Date | Insider | Role | Transaction | Shares | Value |",
				"| --- | --- | --- | --- | ---: | ---: |",
				...transactions.map((entry) => {
					const shares = asNumber(entry.shares);
					const value = asNumber(entry.value);
					return `| ${formatDate(entry.startDate)} | ${entry.filerName} | ${entry.filerRelation} | ${entry.transactionText || "not described"} | ${shares === null ? "n/a" : shares.toLocaleString("en-US")} | ${value === null ? "n/a" : value.toLocaleString("en-US")} |`;
				}),
				"",
				`Source: ${quotePageUrl(ticker, "/insider-transactions/")}`,
				"",
				"Yahoo's transaction text is the only description of the trade. Read it before classifying: an option exercise, a gift or a 10b5-1 plan sale is not an open-market buy or sell.",
			].join("\n");
		} catch (error) {
			return failure("yahoo_insider_transactions", error);
		}
	},
	{
		name: "yahoo_insider_transactions",
		description:
			"Filed insider transactions for one ticker from Yahoo Finance, newest first: date, insider name, role, the transaction description, shares and value. Use it for Form 4 activity, then read the description before labelling a transaction a buy or a sell.",
		schema: z.object({
			ticker: TICKER,
			limit: z
				.number()
				.int()
				.min(1)
				.max(50)
				.default(20)
				.describe("How many recent transactions to return."),
		}),
	},
);

export {
	computeValuationMultiples,
	yahooFundamentals,
	yahooInsiderTransactions,
	yahooStatements,
};
