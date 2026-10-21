---
name: market
description: >-
  Reads the technical picture for U.S. public companies — trend, moving averages, momentum, 
  volatility, volume, support and resistance — from dated, cited price data, and returns 
  grounded price levels (SMA/EMA, RSI, ATR, pivots) as structured JSON. Use when research requires 
  technical analysis, price levels, trend direction, volatility, entry/stop context, or chart posture for a ticker.
license: ISC
metadata:
  author: trade-research
  version: "1.0.0"
  category: financial-research
  use-case: Technical and price-action research with grounded levels
---

# Technical market research

Read the price picture for one instrument and return the trend, the levels and the volatility as
dated, cited evidence. You describe what the data shows — another agent decides the trade.

## Core workflow

### Step 1: Confirm the instrument and the date

**Rule:** Ticker, legal name and exchange must match across every source, and every price you
quote is dated.

- Confirm the ticker resolves to the intended company (not a similar symbol).
- Record the **price date** — a close is stale the moment the next session opens.
- Treat "today" as the run date; a technical read is only as fresh as its last bar.

### Step 2: Gather the price series

**Rule:** Read from a dated chart or quote page; never reason about price from memory.

Call the data tools first, then use `search` to find the page and `open_url` to read it:

| Priority | Source                                   | Use for                                  |
| -------- | ---------------------------------------- | ---------------------------------------- |
| 1        | `yahoo_technicals` (Yahoo Finance)       | Every indicator value and tested level   |
| 2        | `yahoo_quote` (Yahoo Finance)            | Last price, its UTC time, ranges         |
| 3        | Exchange / official quote (NASDAQ, NYSE) | Independent check of the last close      |
| 4        | StockAnalysis, Investing, broker pages   | Independent check of one level/indicator |

`yahoo_technicals` computes the indicators deterministically from daily bars and is the
**source of truth** for any number you emit. Quote its values as given: do not recompute,
re-round, or substitute an indicator it did not return. If a web page disagrees, the tool
wins and the conflict goes in `notes`.

Take at least two sources for the **current price** and reconcile them the way the valuation
skill does: within ±1% use the average, beyond that flag the conflict in `notes`. The second
source is a page you opened with `open_url`, not a snippet and not a second opinion on the
indicators.

If a data tool answers `DATA_UNAVAILABLE` / `NO_DATA_AVAILABLE`, fall back to `search` plus
`open_url`, set the values you could not verify to `null`, and say so in `notes`.

### Step 3: Select complementary indicators

**Rule:** Pick indicators that answer **different** questions — trend, momentum, volatility, volume.
Redundant indicators (RSI _and_ Stochastic RSI) add noise, not signal.

- **Trend:** 50-day SMA, 200-day SMA, 10-day EMA.
- **Momentum:** MACD (line / signal / histogram), RSI(14).
- **Volatility:** Bollinger middle/upper/lower, ATR(14).
- **Volume:** volume trend, VWMA.

Aim for a small, complementary set. Every indicator you quote must have a value you actually read
from a source, with the source URL recorded. The full catalogue — what each indicator is and what
it does _not_ say — is in [`references/reference.md`](references/reference.md).

### Step 4: Read the trend and its strength

- **Uptrend:** price above a rising 50-day SMA; higher highs and higher lows.
- **Downtrend:** price below a falling 50-day SMA; lower highs and lower lows.
- **Sideways:** price oscillating around a flat moving average.
- Cross-checks: golden/death cross (50 vs 200 SMA), price vs 200 SMA for the long-term filter.
- **Trend strength:** weak / moderate / strong, from separation and slope of the averages and the
  level of participation (volume). A trend on falling volume is weak.

### Step 5: Mark support and resistance

**Rule:** A level is only a level if the chart actually tested it — cite the dates and prices.

- **Support:** recent swing lows where buyers stepped in; often near the 50/200 SMA.
- **Resistance:** recent swing highs where sellers appeared; often near a round number or prior high.
- List **actual price levels** (absolute numbers), newest and most-tested first.
- Do not invent a level; if there is no clean one, return an empty array and say so in `notes`.

### Step 6: Read volatility with ATR

- **ATR(14)** is the average true range — the typical size of a day's move, in price.
- **atrPercent = ATR / price × 100** — the same number as a share of price, so it travels across
  instruments. Report both.
- ATR is the honest basis for a stop distance and position size. Never state a stop or a "5% move"
  that the ATR does not support.

### Step 7: Cross-check and note conflicts

- Do the trend, momentum and volume tell the same story? If not, say which is strongest and why.
- Reconcile price sources; flag any indicator whose value you could not independently confirm.
- A signal that depends on a value you could not verify is dropped, not guessed.

### Step 8: Emit the structured result

Return valid JSON with no prose.

## Reference

- [`references/reference.md`](references/reference.md) — the indicator catalogue (what each is,
  how to read it, what it does _not_ say), the source hierarchy and the reconciliation rules.
- [`references/technical-practice.md`](references/technical-practice.md) — how technicals are
  actually used: trend-following vs mean-reversion, why a level matters, false signals, and how
  ATR drives stop and size.

## Output contract

```json
{
	"ticker": "SYMBOL",
	"dateChecked": "YYYY-MM-DD",
	"price": 341.12,
	"priceDate": "YYYY-MM-DD",
	"trend": "uptrend|downtrend|sideways|null",
	"trendStrength": "weak|moderate|strong|null",
	"sma50": 320.5,
	"sma200": 295.1,
	"ema10": 336.0,
	"rsi14": 58.2,
	"atr14": 5.4,
	"atrPercent": 1.58,
	"supportLevels": [325.0, 300.0],
	"resistanceLevels": [355.0, 375.0],
	"volumeTrend": "rising|falling|flat|unknown",
	"signals": [
		{
			"indicator": "RSI(14)",
			"reading": "58.2",
			"interpretation": "Neutral-to-firm momentum; no overbought or oversold extreme."
		}
	],
	"sourceUrls": ["https://exact-url-you-opened"],
	"notes": "Conventions, staleness flags and conflicts."
}
```

**Field rules:**

- `price` and every indicator are **nullable** — set to `null` if unverifiable; never estimate.
- `sourceUrls` **required** — at least one URL you actually opened, never empty.
- `supportLevels` / `resistanceLevels` are absolute prices, not percentages, and may be empty.
- `signals` carries the reading **and** the interpretation; a signal with no cited value is dropped.
- `notes` explains conventions, staleness (>5 trading days) and any conflict between sources.

## Example output

```json
{
	"ticker": "AAPL",
	"dateChecked": "2026-10-16",
	"price": 341.12,
	"priceDate": "2026-10-15",
	"trend": "uptrend",
	"trendStrength": "moderate",
	"sma50": 318.4,
	"sma200": 291.7,
	"ema10": 337.9,
	"rsi14": 61.3,
	"atr14": 5.42,
	"atrPercent": 1.59,
	"supportLevels": [325.0, 305.0, 291.7],
	"resistanceLevels": [355.0, 375.0],
	"volumeTrend": "rising",
	"signals": [
		{
			"indicator": "50/200 SMA",
			"reading": "price > 50 SMA > 200 SMA",
			"interpretation": "Stacked bullish; long-term uptrend intact."
		},
		{
			"indicator": "RSI(14)",
			"reading": "61.3",
			"interpretation": "Firm momentum, below the 70 overbought line."
		},
		{
			"indicator": "ATR(14)",
			"reading": "5.42 (1.59% of price)",
			"interpretation": "Modest daily range; a 1×ATR stop sits about $5.4 below entry."
		}
	],
	"sourceUrls": [
		"https://finance.yahoo.com/quote/AAPL/history/",
		"https://stockanalysis.com/stocks/aapl/"
	],
	"notes": "Price date Oct 15 close. 200 SMA doubles as support. Two sources agree within 0.2%."
}
```

## Common mistakes to avoid

- ❌ Quoting an indicator value you did not read from a source
- ❌ Listing a support/resistance level the chart never tested
- ❌ Treating RSI extremes as automatic reversals in a strong trend
- ❌ Stating a stop or a percentage move that ATR does not support
- ❌ Using a stale price date without flagging it
- ❌ Emitting the same trend read four times with four redundant indicators
- ❌ Reasoning about price from memory instead of a dated chart

## Troubleshooting

**No clean support/resistance?** Return empty arrays and say so in `notes`; a level you did not see
on the chart is worse than no level.

**Indicator value unavailable?** Set that field to `null`, name the reason in `notes`, and do not
substitute a different indicator's value.

**Sources disagree on price >1%?** Flag the conflict in `notes`, use the more recent/official
source, and never average a >1% gap away silently.

**The stock just gapped or split?** Note it in `notes`; a split or a gap distorts moving averages
and can make a level meaningless.
