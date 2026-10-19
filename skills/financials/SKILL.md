---
name: financials
description: >-
  Gathers and verifies company financials for U.S. public companies — valuation
  inputs and multiples (EPS, P/E, PEG), the income statement, balance sheet, cash
  flow and insider transactions — as structured, dated JSON. Use when research
  requires valuation inputs, profitability, balance-sheet strength, cash
  generation, or insider activity for a ticker.
license: ISC
metadata:
  author: trade-research
  version: "1.0.0"
  category: financial-research
  use-case: Company financials and valuation gathering and verification
---

# Company financials and valuation research

Collect and cross-verify a company's valuation inputs, financial statements and
insider activity, and record them with the context that keeps them honest.
Evidence only — interpretation comes later.

This skill merges two bodies of work that share the same filings: the multiples
(EPS, P/E, PEG) and the statements those multiples are built on. They are one
pass because the same 10-K/10-Q carries both, and collecting them apart fetches
the same diluted EPS twice.

## Core workflow

### Step 0: Pull the numbers before searching

**Rule:** Start with the Yahoo Finance tools, then search for provenance and
confirmation. Search is how a figure becomes citable; the data tools are how it
becomes correct.

| Tool                         | Answers                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `yahoo_fundamentals`         | TTM revenue, margins, debt, cash, returns, multiples, beta  |
| `yahoo_statements`           | Reported income / balance-sheet / cash-flow lines by period |
| `yahoo_insider_transactions` | Filed Form 4 activity, newest first                         |
| `yahoo_quote`                | Current price and EPS as multiples-tool inputs              |
| `search`                     | The SEC filing, company IR, and a second source             |

Yahoo is one vendor, not the truth. Every figure the skill marks as
reconciliation-sensitive still needs a second source. Where Yahoo and a filing
disagree by more than the tolerance in Step 8, follow the rule and record the
conflict in `notes`.

An `n/a` from a Yahoo tool means the vendor did not report that field. It is not
zero: leave the output field `null`.

### Step 1: Confirm the company and the fiscal period

**Rule:** Ticker, legal name, exchange, and **fiscal year-end** must match across
sources.

- The company's fiscal year may not be the calendar year (Apple's ends late
  September).
- Record which period you are reporting: TTM, or a named fiscal year, and whether
  the last filing is a 10-Q (quarterly, partial year) or a 10-K (annual).
- TTM = the four most recent reported quarters, taken from filed statements.

### Step 2: Valuation inputs — price, trailing EPS, forward EPS

You collect the current price only as an **input to the multiples tool**; the
recorded price belongs to the technical/market analyst, so there is no price
field in the output. Report the price you used in `notes`.

- **Current share price (tool input):** most recent close or real-time, dated
  within two days of today; two independent sources agreeing within ±1%.
  `yahoo_quote` is the first, a search result the second.
- **Trailing EPS (TTM):** diluted EPS over the most recent twelve months. Prefer
  SEC filings (sum the last four quarters' diluted EPS), then company IR, then an
  aggregator. `yahoo_statements` gives you the filed diluted EPS per period, so
  check its TTM figure against the sum of the last four quarters before trusting
  `yahoo_fundamentals`' TTM EPS.
- **Forward EPS (consensus):** sell-side average diluted EPS for the next twelve
  months. State the fiscal year the consensus refers to.
- **Long-term growth rate (%):** consensus EPS growth ("Next 5 Years"), for PEG.
  Yahoo's `earningsTrend` EPS estimates give the forward path, but not a named
  long-term rate: take the growth rate from search and say where it came from.

### Step 3: Compute multiples with the tool (never by hand)

**Rule:** Always use `compute_valuation_multiples`. Never divide by hand or copy a
provider's multiple.

```
compute_valuation_multiples({
  price: number,            // current share price
  trailingEps: number,      // TTM diluted EPS
  forwardEps: number,       // consensus forward diluted EPS
  growthRatePercent: number // long-term growth rate (%)
})
```

- All four are required numbers. Pass `0` for anything you could not verify; the
  tool returns `null` with a reason for that input.
- Emit the returned `trailingPE`, `forwardPE` and `pegRatio` verbatim.

A multiple compresses growth, capital structure and accounting into one number,
so record the context that keeps it honest (still without opining):

- **A trailing/forward gap is information** — an inflection, a cyclical trough,
  a one-off, a buyback or a stale consensus. Name the reason in `notes`.
- **A P/E is only comparable on matched capital structure and accounting.**
- **The sector may not trade on P/E** (banks on book, REITs on FFO, energy on
  EV/EBITDA) — say so in `notes`.
- **PEG needs positive, durable growth.** Peak-cycle growth flatters it; negative
  growth makes it meaningless.
- **Negative earnings are not a usable divisor.** Pass `0`, explain in `notes`,
  never emit a negative P/E.

### Step 4: Income statement

From the latest 10-Q/10-K and an aggregator, gather and date:

| Metric             | Definition                                       |
| ------------------ | ------------------------------------------------ |
| Revenue (TTM)      | Total sales over the trailing four quarters      |
| Revenue growth YoY | Latest period vs. same period a year earlier (%) |
| Gross margin       | Gross profit ÷ revenue (%)                       |
| Operating margin   | Operating income ÷ revenue (%)                   |
| Net margin         | Net income ÷ revenue (%)                         |
| Net income (TTM)   | Bottom line over the trailing four quarters      |

Prefer GAAP figures; label any non-GAAP figure. Margins are computed from the
statement figures — show the inputs in `notes` if a margin is disputed.

### Step 5: Balance sheet and leverage

| Metric             | Definition                                   |
| ------------------ | -------------------------------------------- |
| Total debt         | Short- plus long-term borrowings             |
| Cash & equivalents | Cash plus short-term investments             |
| Net debt           | Total debt − cash                            |
| Debt / equity      | Total debt ÷ shareholder equity (%)          |
| Interest coverage  | EBIT ÷ interest expense (×, higher is safer) |

Leverage is only dangerous relative to cash flow: a high debt/equity with strong
interest coverage is a different risk from the same ratio on thin coverage.
Report both.

### Step 6: Cash flow, quality and returns

| Metric                    | Definition                                           |
| ------------------------- | ---------------------------------------------------- |
| Operating cash flow (TTM) | Cash generated by operations                         |
| Free cash flow (TTM)      | Operating cash flow − capital expenditure            |
| Returns                   | ROE = net income ÷ equity; ROA = net income ÷ assets |

Cash-flow quality check: does net income convert to cash? Operating cash flow
persistently below net income (accrual-heavy, receivables growing) is a warning;
note it.

### Step 7: Insider transactions

**Rule:** Report only filed insider transactions (Form 4 in the U.S.); one line
per transaction.

`yahoo_insider_transactions` lists the filed transactions with Yahoo's own
description of each. Read the description before classifying: an option
exercise, a gift or a 10b5-1 plan sale is not an open-market buy or sell.

- Capture insider name, role, type (buy/sell/other), shares, value and date, each
  with a source URL.
- Cluster reads better than single lines: many insiders selling over weeks (or a
  cluster of buys) is a signal; one scheduled sale is routine.
- Distinguish **open-market** buys/sells from option exercises and 10b5-1 plan
  sales; label the latter so a routine sale is not read as a bearish bet.
- If the tool returns no transactions, say that none were available — not that
  insiders did not trade.

### Step 8: Cross-check and reconcile

**Rule:** Two independent sources per metric — one official (SEC filing / company
IR), one aggregator — and flag conflicts rather than averaging them away.

| Difference | Action                                 |
| ---------- | -------------------------------------- |
| ≤2%        | Use the average                        |
| 2–5%       | Use both, note the conflict            |
| >5%        | Flag in `notes`; prefer the SEC filing |

### Step 9: Emit the structured result

Return valid JSON with no prose.

## Reference

- [`references/reference.md`](references/reference.md) — where each figure lives,
  the source hierarchy and the reconciliation rules.
- [`references/valuation-practice.md`](references/valuation-practice.md) — how
  valuation is actually done: the methods, what each multiple prices and hides,
  the sector's own metric, trailing-versus-forward divergence, the growth traps in
  PEG, and the rate and cycle context.
- [`references/fundamental-practice.md`](references/fundamental-practice.md) — how
  the statements fit together, accrual vs cash, quality of earnings and the red
  flags.

## Output contract

```json
{
	"ticker": "SYMBOL",
	"dateChecked": "YYYY-MM-DD",
	"fiscalPeriod": "TTM to 2026-09-30 (FY2026 Q4)",
	"trailingEPS": 8.93,
	"forwardEPS": 9.85,
	"trailingPE": 38.2,
	"forwardPE": 34.6,
	"pegRatio": 2.77,
	"revenueTTM": 400000000000,
	"revenueGrowthYoY": 6.1,
	"grossMargin": 46.2,
	"operatingMargin": 31.5,
	"netMargin": 26.4,
	"netIncomeTTM": 105000000000,
	"operatingCashFlowTTM": 118000000000,
	"freeCashFlowTTM": 108000000000,
	"totalDebt": 106000000000,
	"cashAndEquivalents": 65000000000,
	"netDebt": 41000000000,
	"debtToEquity": 145.0,
	"interestCoverage": 28.4,
	"returnOnEquity": 152.0,
	"returnOnAssets": 22.1,
	"insiderTransactions": [
		{
			"insider": "Jane Doe",
			"role": "CFO",
			"transactionType": "buy|sell|other",
			"shares": 5000,
			"value": 1700000,
			"date": "YYYY-MM-DD",
			"sourceUrl": "https://exact-url-you-opened"
		}
	],
	"sourceUrls": ["https://exact-url-you-opened"],
	"notes": "Conventions, staleness flags and conflicts."
}
```

**Field rules:**

- Every numeric field is **nullable** — set to `null` if unverifiable; never
  estimate.
- `sourceUrls` **required** — at least one URL you actually opened, never empty.
- `fiscalPeriod` names the period and the fiscal year-end convention; never mix
  calendar and fiscal.
- `insiderTransactions` may be empty; say so in `notes` rather than inventing
  activity.
- `notes` carries the GAAP/non-GAAP labels, the TTM construction, the price used,
  staleness and conflicts.

## Example output

```json
{
	"ticker": "AAPL",
	"dateChecked": "2026-10-16",
	"fiscalPeriod": "TTM to 2026-09-30 (FY2026)",
	"trailingEPS": 8.93,
	"forwardEPS": 9.85,
	"trailingPE": 38.2,
	"forwardPE": 34.6,
	"pegRatio": 2.77,
	"revenueTTM": 416161000000,
	"revenueGrowthYoY": 6.4,
	"grossMargin": 46.2,
	"operatingMargin": 31.5,
	"netMargin": 26.4,
	"netIncomeTTM": 109900000000,
	"operatingCashFlowTTM": 118000000000,
	"freeCashFlowTTM": 108000000000,
	"totalDebt": 106000000000,
	"cashAndEquivalents": 65000000000,
	"netDebt": 41000000000,
	"debtToEquity": 145.0,
	"interestCoverage": 28.4,
	"returnOnEquity": 152.0,
	"returnOnAssets": 22.1,
	"insiderTransactions": [],
	"sourceUrls": [
		"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193",
		"https://stockanalysis.com/stocks/aapl/financials/"
	],
	"notes": "GAAP figures. Price used for the tool: $341.12 (Oct 15 close, owned by the market analyst). TTM = sum of FY2026 quarters. Multiples via compute_valuation_multiples. No Form 4 insider open-market activity in the last 90 days."
}
```

## Common mistakes to avoid

- ❌ Computing P/E by hand or copying a provider's multiple
- ❌ Setting a field to `null` then estimating it in `notes`
- ❌ Using stale data (>90 days) without flagging it
- ❌ Mixing calendar-year and fiscal-year EPS without noting it
- ❌ Recording source URLs you never opened
- ❌ Averaging away a >5% conflict instead of flagging it
- ❌ Emitting a negative P/E from a negative EPS instead of treating it as not meaningful
- ❌ Reporting a high debt/equity without interest coverage to contextualise it
- ❌ Reading a routine 10b5-1 sale as a bearish insider signal
- ❌ Leaving `sourceUrls` empty

## Troubleshooting

**Forward EPS not available?** Check company guidance and Yahoo consensus; if
neither exists, pass `0` to the tool and note it.

**Company uses a non-calendar fiscal year?** Name it explicitly so downstream
steps read the period correctly.

**Two sources differ by >5%?** Flag the conflict in `notes` and prefer the SEC
filing; do not average it away.

**Negative EPS?** Pass `0` so the multiple returns `null`; say "negative TTM EPS —
P/E not meaningful" in `notes`.

**The sector does not trade on P/E?** Record the verified P/E and add the caveat
in `notes`; `null` plus a reason is the honest record when it is meaningless.

**Insider data unavailable?** Return an empty array and say "no filed insider
transactions found" in `notes` — never infer activity from price moves.
