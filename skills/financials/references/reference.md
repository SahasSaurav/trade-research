# Financials reference

Deep tables for the `financials` skill: where each figure lives, the source
hierarchy and the reconciliation rules. [`SKILL.md`](../SKILL.md) points here.

## Source hierarchy

### Tier 1 — Primary sources (most authoritative)

1. **SEC EDGAR filings** — 10-K (annual), 10-Q (quarterly), 8-K, Form 4
   - Diluted EPS, share count, statements, insider filings
   - Link: https://www.sec.gov/edgar/
2. **Company investor relations** — earnings calls, fact sheets, guidance
3. **Exchange listing** — NASDAQ, NYSE official sites

### Tier 2 — Aggregators (for verification and consensus)

1. **Yahoo Finance** — current price, TTM EPS, forward estimates, P/E charts
2. **StockAnalysis.com** — trailing/forward P/E, statements, growth estimates
3. **Macrotrends** — historical P/E, multi-year EPS and statement trends
4. **Seeking Alpha** — earnings summaries, analyst consensus
5. **TradingView** — real-time prices, fundamentals

### Tier 3 — Professional platforms (cite if available)

- Bloomberg, FactSet, CapitalIQ, Refinitiv

**Preference:** Filing > Estimate > Aggregator. Use current-quarter data over
stale. An official SEC figure may stand alone (still dated); every other metric
wants two sources.

## Where each figure lives

| Figure                       | Primary (official)              | Secondary (aggregator)            |
| ---------------------------- | ------------------------------- | --------------------------------- |
| Price, trailing/forward EPS  | 10-K / 10-Q, earnings release   | Yahoo, StockAnalysis, Macrotrends |
| Revenue, margins, net income | 10-K / 10-Q income statement    | Yahoo, StockAnalysis, Macrotrends |
| Debt, cash, equity           | 10-K / 10-Q balance sheet       | StockAnalysis balance sheet       |
| Operating / free cash flow   | 10-K / 10-Q cash-flow statement | StockAnalysis cash flow           |
| Insider transactions         | SEC Form 4 (EDGAR)              | OpenInsider, Yahoo insider        |

## Valuation metrics

### Trailing EPS (TTM)

- **Definition:** Diluted EPS over the most recent 12 months
- **Source:** Sum the last four quarterly diluted EPS figures from SEC filings
- **Staleness:** Flag if >90 days old without refresh

### Forward EPS

- **Definition:** Sell-side consensus diluted EPS for the next 12 months
- **Source:** Yahoo Finance consensus or company guidance
- **Convention clarity:** Always note the fiscal year (e.g., "FY2027 ends Sept 30, 2027")

### P/E multiples

- **Trailing P/E:** Current price ÷ Trailing EPS
- **Forward P/E:** Current price ÷ Forward EPS
- **Computation:** Always via `compute_valuation_multiples`, never by hand

### PEG ratio

- **Definition:** (Trailing P/E) ÷ (long-term earnings growth rate %)
- **Growth source:** Yahoo consensus ("Next 5 Years, Per Annum"), company guidance, or historical average
- **If growth unavailable:** Pass `0` to the tool; explain in `notes`

## Statement metric definitions

- **TTM** — trailing twelve months = the four most recent reported quarters. For a
  non-calendar fiscal year, four _fiscal_ quarters, not four calendar quarters.
- **Gross margin** = (revenue − cost of revenue) ÷ revenue.
- **Operating margin** = operating income ÷ revenue.
- **Net margin** = net income ÷ revenue.
- **Net debt** = total debt − cash and equivalents.
- **Debt / equity** = total debt ÷ shareholder equity. Report as a ratio or
  percent, consistently.
- **Interest coverage** = EBIT ÷ interest expense. Below ~2× is strained; below 1×
  cannot cover.
- **ROE** = net income ÷ shareholder equity; **ROA** = net income ÷ total assets.
- **Free cash flow** = operating cash flow − capital expenditure.

## Sanity checks

| Check                        | Rule                                     | Action if violated                                                |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| **Price date**               | Within 2 days of today                   | Use most recent, note staleness                                   |
| **EPS date**                 | TTM latest Q filing ≤90 days             | Flag if older; use only if no fresher data                        |
| **Forward vs. trailing EPS** | Usually close (±10%)                     | If forward < trailing by >10%, flag declining earnings            |
| **Trailing vs. forward P/E** | Differ by >30%?                          | Investigate earnings inflection/seasonality; note explanation     |
| **EPS sign**                 | Both EPS figures positive                | Negative EPS makes the P/E meaningless — pass 0, explain in notes |
| **Earnings basis**           | GAAP or adjusted, stated                 | Say which basis whenever the two differ materially                |
| **Share count**              | Diluted; steady absent buybacks/issuance | Flag a material share-count change in notes                       |
| **Margin move**              | Moves >~5 points YoY                     | Needs a reason (mix, one-off, accounting)                         |
| **Cash conversion**          | Net income ≤ operating cash flow         | Net income above OCF for several periods means poor conversion    |
| **Leverage direction**       | Rising debt with flat EBIT               | Shrinks interest coverage — direction matters more than level     |

Multiples behave differently by sector and cycle — see
[`valuation-practice.md`](valuation-practice.md) for what each one measures and
which multiple a sector uses.

## Reconciliation

| Difference on a metric | Action                                 |
| ---------------------- | -------------------------------------- |
| ≤2%                    | Use the average                        |
| 2–5%                   | Use both, note the conflict            |
| >5%                    | Flag in `notes`; prefer the SEC filing |
