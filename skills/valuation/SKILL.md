---
name: valuation
description: >-
  Gathers verifiable valuation metrics for U.S. public companies — current price, 
  trailing and forward EPS, P/E multiples, and PEG ratio — from SEC filings and independent sources, 
  with every multiple computed by the compute_valuation_multiples tool. Use when research requires 
  valuation inputs, multiples collection, price-versus-value analysis, or EPS verification for a ticker.
license: ISC
metadata:
  author: trade-research
  version: "1.0.0"
  category: financial-research
  use-case: Equity valuation metrics gathering and verification
---

# Equity valuation research

Collect and cross-verify valuation metrics for U.S. public companies. Evidence only — interpretation comes later.

## Core workflow

### Step 1: Confirm the company

**Rule:** Ticker, legal name, and exchange must match across all data sources.

**How to confirm:**

- Open Yahoo Finance, SEC EDGAR, or StockAnalysis.com
- Search by ticker
- Verify the legal name (e.g., "Apple Inc." vs. "Apple Computer Inc.") and exchange (NASDAQ, NYSE)
- If multiple tickers or legal names exist, use the current one

**Example:** AAPL = "Apple Inc." on NASDAQ (not a penny stock with a similar name)

### Step 2: Current share price (dated, two sources)

**Rule:** Most recent close price or real-time, dated within 2 days of today. Two independent sources should agree within ±1%.

**Where to find:**

1. **Primary:** Yahoo Finance closing price for the day, or company investor relations page
2. **Secondary:** Bloomberg, MarketWatch, or your brokerage

**What to record:**

- Price (numeric, USD)
- Date (YYYY-MM-DD)
- Both source URLs

**Reconciliation:**

- If both agree within 1% → use the average
- If they differ by >1% → flag the conflict in notes, use the most recent source
- Example: Yahoo $341.12, MarketWatch $341.20 → use $341.16, cite both URLs

### Step 3: Trailing EPS (TTM)

**Definition:** Diluted earnings-per-share over the most recent 12 months.

**Priority order:**

1. **SEC filings (10-Q, 10-K)** — most authoritative
   - Extract "Diluted EPS" from the last four quarters
   - Sum them for TTM
2. **Company investor relations** — often publish TTM on earnings calls
3. **Yahoo Finance, StockAnalysis.com** — aggregate SEC data

**How to calculate TTM from filings:**

- Get the latest 10-Q filed
- Add the previous 3 quarters' diluted EPS from their 10-Qs
- This = trailing twelve months
- Note if the company uses non-calendar fiscal year (e.g., Apple: Sept 30 year-end)

**Example:** AAPL Q4 diluted EPS $2.15 + Q3 $1.95 + Q2 $2.10 + Q1 $1.98 = TTM $8.18 (from latest 10-Q filing date)

### Step 4: Forward EPS (consensus)

**Definition:** Sell-side analysts' average estimate of diluted EPS for the next 12 months.

**Where to find:**

1. **Yahoo Finance:** Ticker → "Analysis" tab → "Earnings Estimate" section → "Next Fiscal Year"
2. **StockAnalysis.com:** Shows consensus forward estimates
3. **Company guidance:** If management provided earnings forecast in recent earnings calls

**Conventions:**

- **Calendar vs. fiscal year:** Note which 12-month period (e.g., "FY2027 ends Sept 30, 2027")
- **Period clarity:** Always state the fiscal year or period (e.g., "FY2027" or "next 12 months from Q4 2026")
- **Consensus:** Average of sell-side analyst estimates, not one firm

**Example:** Yahoo shows FY2027 consensus EPS $9.85 (fiscal year ends Sept 30, 2027) → record $9.85 with fiscal year note

### Step 5: Compute multiples with the tool (never by hand)

**Rule:** Always use `compute_valuation_multiples`. Never divide by hand or copy a provider's multiple.

**Tool signature:**

```
compute_valuation_multiples({
  price: number,           // current share price
  trailingEps: number,     // TTM diluted EPS
  forwardEps: number,      // consensus forward diluted EPS
  growthRatePercent: number // long-term growth rate (%)
})
```

**Input rules:**

- All 4 are required numbers
- If you cannot verify a value, pass `0` (meaning "unverified")
- Tool will return `null` with a reason for any `0` input

**Example:**

```
Input: price=341.12, trailingEps=8.93, forwardEps=9.85, growthRate=12.4
→ Returns: { trailingPE: 38.2, forwardPE: 34.6, pegRatio: 2.77, uncomputed: [] }
→ EMIT: These exact numbers verbatim
```

### Step 6: Cross-check and note conflicts

**Rule:** Two independent sources per metric (one official, one aggregator). Flag conflicts rather than averaging them away.

**Reconciliation:**

| Difference  | Action                                     |
| ----------- | ------------------------------------------ |
| ±2% or less | Use average                                |
| 2–5%        | Use both, note the conflict                |
| >5% on EPS  | Flag as conflict in notes; investigate why |

**Example conflict:**

- Yahoo consensus forward EPS: $9.85
- Company guidance: $9.50–$10.00 (midpoint $9.75)
- Difference: 1.3% → acceptable
- Note: "Consensus slightly above company guidance; used consensus $9.85"

### Step 7: Emit the output contract

Return valid JSON with no prose.

## Reference

Deeper detail — the source hierarchy, the metric definitions and the sanity checks — lives in [`references/reference.md`](references/reference.md). Read it when the workflow points you at a table that is not here.

## Output contract

```json
{
	"ticker": "SYMBOL",
	"dateChecked": "YYYY-MM-DD",
	"price": 123.45,
	"priceDate": "YYYY-MM-DD",
	"trailingEPS": 8.93,
	"forwardEPS": 9.85,
	"trailingPE": 38.2,
	"forwardPE": 34.6,
	"pegRatio": 2.77,
	"sourceUrls": ["https://...", "https://..."],
	"notes": "TTM from Q4 10-K. Forward is FY2027 consensus. Growth 12% from Yahoo. All sources within ±1%."
}
```

**Field rules:**

- All EPS, P/E, and PEG fields are **nullable** — set to `null` if unverifiable
- `sourceUrls` **required** — at least one URL, never empty
- `notes` is optional; use it for conventions, staleness flags, and conflicts
- Never estimate or guess; null means unverified

## Example output

```json
{
	"ticker": "AAPL",
	"dateChecked": "2026-10-16",
	"price": 341.12,
	"priceDate": "2026-10-15",
	"trailingEPS": 8.93,
	"forwardEPS": 9.85,
	"trailingPE": 38.2,
	"forwardPE": 34.6,
	"pegRatio": 2.77,
	"sourceUrls": [
		"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193",
		"https://finance.yahoo.com/quote/AAPL/",
		"https://www.macrotrends.net/stocks/charts/AAPL/apple/pe-ratio"
	],
	"notes": "Trailing EPS from Q4 2026 10-K (sum of 4 trailing quarters). Forward EPS is FY2027 consensus (fiscal year ends Sept 30, 2027). Growth rate 12% from Yahoo consensus. All sources agree within ±1%. Price date is Oct 15 close."
}
```

## Common mistakes to avoid

- ❌ Computing P/E by hand or copying a provider's multiple
- ❌ Setting a field to `null` then estimating it in notes
- ❌ Using stale data (>90 days) without flagging it
- ❌ Mixing calendar-year and fiscal-year EPS without noting it
- ❌ Recording source URLs you never opened
- ❌ Averaging away a >5% EPS conflict instead of flagging it

## Troubleshooting

**Forward EPS not available?**

- Check if company declined guidance
- Look for analyst consensus on Yahoo
- If neither exists, pass `0` to tool and note "No forward EPS available; company declined FY2027 guidance"

**Company uses non-calendar fiscal year?**

- Note it explicitly: "FY2027 ends Sept 30, 2027 (Apple fiscal year, not calendar)"
- Helps later steps interpret the forward period correctly

**Two sources differ by >5% on EPS?**

- Flag as conflict in notes: "SEC filing shows $X, Yahoo shows $Y; [reason why]"
- Use the SEC filing as primary
- Do not average them away

**Price source shows stale data?**

- Use the most recent source you can find
- Note the price date explicitly
- Flag if >1 day old: "Price date Oct 15 (closed 1 day ago)"

**Cannot find two sources for a metric?**

- If only one source exists, set the metric to `null` with explanation in notes
- Do not use a single source; the verification rule requires two
- Exception: SEC filing alone (official source) can suffice; supplement with one aggregator
