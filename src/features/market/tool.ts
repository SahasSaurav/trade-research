import { computeTechnicalSnapshot } from "@src/utils/indicators.js";
import { moduleOptions, yahooClient } from "@src/utils/yahoo/client.js";
import {
	formatDate,
	formatNumber,
	formatPercentValue,
	table,
} from "@src/utils/yahoo/format.js";
import {
	asDate,
	asNumber,
	dayRange,
	failure,
	identityRows,
	quotePageUrl,
	range,
	TICKER,
} from "@src/utils/yahoo/utils.js";
import { tool } from "langchain";
import { z } from "zod";

/**
 * Yahoo Finance as a structured source for the market agent: a live quote and a
 * deterministic technical snapshot. Both return markdown the model reads as
 * evidence and copies from, and a failure returns a `DATA_UNAVAILABLE` sentinel
 * rather than throwing, because a thrown tool error aborts the node.
 */

const yahooQuote = tool(
	async ({ ticker }) => {
		try {
			const quote = (await yahooClient.quote(
				ticker,
				{},
				moduleOptions,
			)) as unknown as Record<string, unknown> | undefined;

			// Yahoo answers an unknown symbol with `undefined` rather than an
			// error on some hosts, so the absence is checked here too.
			if (!quote) {
				return `NO_DATA_AVAILABLE: yahoo_quote found no Yahoo Finance quote for ${ticker.toUpperCase()}. The symbol may be invalid or delisted. Do not estimate or fabricate values — report the price as unavailable.`;
			}

			const price = asNumber(quote.regularMarketPrice);
			const time = asDate(quote.regularMarketTime);

			return [
				`# Yahoo Finance quote for ${ticker.toUpperCase()}`,
				"",
				table("Instrument", identityRows(quote)),
				table("Price", [
					["Last price", formatNumber(price)],
					["Price time (UTC)", time ? formatDate(time) : null],
					[
						"Previous close",
						formatNumber(asNumber(quote.regularMarketPreviousClose)),
					],
					["Day range", dayRange(quote)],
					[
						"52-week range",
						range(quote.fiftyTwoWeekLow, quote.fiftyTwoWeekHigh),
					],
					["50-day average", formatNumber(asNumber(quote.fiftyDayAverage))],
					[
						"200-day average",
						formatNumber(asNumber(quote.twoHundredDayAverage)),
					],
					["Volume", formatNumber(asNumber(quote.regularMarketVolume), 0)],
					[
						"3-month average volume",
						formatNumber(asNumber(quote.averageDailyVolume3Month), 0),
					],
				]),
				table("Valuation snapshot", [
					["Market cap", formatNumber(asNumber(quote.marketCap), 0)],
					["Trailing P/E", formatNumber(asNumber(quote.trailingPE))],
					["Forward P/E", formatNumber(asNumber(quote.forwardPE))],
					["EPS (TTM)", formatNumber(asNumber(quote.epsTrailingTwelveMonths))],
					["Forward EPS", formatNumber(asNumber(quote.epsForward))],
				]),
				`Source: ${quotePageUrl(ticker)}`,
				"",
				"The price time is UTC. If it is not the latest session close, say so — a stale price must not be presented as current.",
			]
				.filter(Boolean)
				.join("\n");
		} catch (error) {
			return failure("yahoo_quote", error);
		}
	},
	{
		name: "yahoo_quote",
		description:
			"Current quote for one ticker from Yahoo Finance: company name, exchange, currency, last price with its UTC timestamp, day and 52-week range, moving averages, volume, market cap, trailing and forward P/E and EPS. Use it to ground the share price and the instrument's identity; it is not a substitute for a second source on the recorded price.",
		schema: z.object({ ticker: TICKER }),
	},
);

const yahooTechnicals = tool(
	async ({ ticker, lookbackDays }) => {
		try {
			// `lookbackDays` is trading days, but period1 is a calendar date:
			// five sessions fit in seven calendar days, so a literal 260-day
			// window returns ~179 bars and a 200-day average is silently
			// unavailable. The 1.6 factor covers weekends plus holidays.
			const calendarDays = Math.ceil(lookbackDays * 1.6);
			const period1 = new Date(Date.now() - calendarDays * 86_400_000);
			const chart = await yahooClient.chart(
				ticker,
				{ period1, interval: "1d" },
				moduleOptions,
			);

			const snapshot = computeTechnicalSnapshot(
				chart.quotes.map((bar) => ({
					date: formatDate(bar.date),
					open: bar.open,
					high: bar.high,
					low: bar.low,
					close: bar.close,
					volume: bar.volume,
				})),
			);

			if (!snapshot) {
				return `NO_DATA_AVAILABLE: yahoo_technicals received no usable daily bars for ${ticker.toUpperCase()}. Report the technicals as unavailable rather than estimating them.`;
			}

			const levelList = (levels: typeof snapshot.supportLevels) =>
				levels.length === 0
					? "none detected (no level was tested at least twice in this window)"
					: levels
							.map(
								(level) =>
									`${level.price.toFixed(2)} (${level.touches} touches, last ${level.lastTested})`,
							)
							.join("; ");

			return [
				`# Yahoo Finance daily technicals for ${ticker.toUpperCase()}`,
				"",
				`Computed deterministically from ${snapshot.bars} daily bars, ${snapshot.firstDate} to ${snapshot.lastDate}. These values are the source of truth for indicator claims — do not recompute or round them differently.`,
				"",
				table("Price", [
					["Last close", formatNumber(snapshot.close)],
					["Close date", snapshot.lastDate],
				]),
				table("Trend", [
					["SMA(50)", formatNumber(snapshot.sma50)],
					["SMA(200)", formatNumber(snapshot.sma200)],
					["EMA(10)", formatNumber(snapshot.ema10)],
				]),
				table("Momentum", [
					["RSI(14)", formatNumber(snapshot.rsi14)],
					["MACD line", formatNumber(snapshot.macd.line)],
					["MACD signal", formatNumber(snapshot.macd.signal)],
					["MACD histogram", formatNumber(snapshot.macd.histogram)],
				]),
				table("Volatility", [
					["ATR(14)", formatNumber(snapshot.atr14)],
					["ATR as % of price", formatPercentValue(snapshot.atrPercent, 2)],
					["Bollinger middle (20)", formatNumber(snapshot.bollinger.middle)],
					["Bollinger upper", formatNumber(snapshot.bollinger.upper)],
					["Bollinger lower", formatNumber(snapshot.bollinger.lower)],
				]),
				table("Volume", [
					["Volume trend (10d vs prior 20d)", snapshot.volumeTrend],
					["Average volume (20d)", formatNumber(snapshot.averageVolume20, 0)],
				]),
				`### Levels tested at least twice`,
				"",
				`- Support: ${levelList(snapshot.supportLevels)}`,
				`- Resistance: ${levelList(snapshot.resistanceLevels)}`,
				"",
				"### Recent closes",
				"",
				"| Date | Close |",
				"| --- | --- |",
				...snapshot.recentCloses.map(
					(row) => `| ${row.date} | ${row.close.toFixed(2)} |`,
				),
				"",
				`Source: ${quotePageUrl(ticker, "/history/")}`,
				"",
				"Levels come from swing highs and lows clustered within 1.5% of each other. A level absent here was not tested twice in the window — do not present one as validated.",
			].join("\n");
		} catch (error) {
			return failure("yahoo_technicals", error);
		}
	},
	{
		name: "yahoo_technicals",
		description:
			"Deterministic technical snapshot for one ticker from Yahoo Finance daily bars: last close and date, SMA(50), SMA(200), EMA(10), RSI(14), ATR(14) and ATR percent, MACD line/signal/histogram, Bollinger bands, volume trend, and the support and resistance levels tested at least twice. These values are computed in code and are the source of truth for indicator claims.",
		schema: z.object({
			ticker: TICKER,
			lookbackDays: z
				.number()
				.int()
				.min(60)
				.max(400)
				.default(260)
				.describe(
					"Daily bars to load. 260 covers a full year and is enough for a 200-day average; use 400 only when a longer history is needed.",
				),
		}),
	},
);

export { yahooQuote, yahooTechnicals };
