# Valuation reference

## Source hierarchy

### Tier 1 — Primary sources (most authoritative)

1. **SEC EDGAR filings** — 10-K (annual), 10-Q (quarterly), S-1 (IPO)
   - Diluted EPS and share count
   - Link: https://www.sec.gov/edgar/
2. **Company investor relations** — earnings calls, fact sheets
3. **Exchange listing** — NASDAQ, NYSE official sites

### Tier 2 — Aggregators (for verification and consensus)

1. **Yahoo Finance** — current price, TTM EPS, forward estimates, P/E charts
2. **StockAnalysis.com** — trailing/forward P/E, growth estimates
3. **Macrotrends** — historical P/E, multi-year EPS trends
4. **Seeking Alpha** — earnings summaries, analyst consensus
5. **TradingView** — real-time prices, fundamentals

### Tier 3 — Professional platforms (cite if available)

- Bloomberg, FactSet, CapitalIQ, Refinitiv

**Preference:** Filing > Estimate > Aggregator. Use current quarter data over stale.

## Key metrics reference

### Trailing EPS (TTM)

- **Definition:** Diluted EPS over most recent 12 months
- **Source:** Sum last 4 quarterly diluted EPS figures from SEC filings
- **Staleness:** Flag if >90 days old without refresh

### Forward EPS

- **Definition:** Sell-side consensus diluted EPS for next 12 months
- **Source:** Yahoo Finance consensus or company guidance
- **Convention clarity:** Always note the fiscal year (e.g., "FY2027 ends Sept 30, 2027")

### P/E Multiples

- **Trailing P/E:** Current price ÷ Trailing EPS
- **Forward P/E:** Current price ÷ Forward EPS
- **Interpretation:** "Stock trades at X times earnings"
- **Computation:** Always via tool, never by hand

### PEG Ratio

- **Definition:** (Trailing P/E) ÷ (Long-term earnings growth rate %)
- **Growth source:** Yahoo consensus ("Next 5 Years (Per Annum)"), company guidance, or historical average
- **Interpretation:**
  - PEG < 1.0 → potentially undervalued
  - PEG 1.0–2.0 → fairly valued
  - PEG > 2.0 → potentially overvalued
- **If growth unavailable:** Pass `0` to tool; explain in notes

## Sanity checks

| Check                        | Rule                                     | Action if violated                                            |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| **Price date**               | Within 2 days of today                   | Use most recent, note staleness                               |
| **EPS date**                 | TTM latest Q filing ≤90 days             | Flag if older; use only if no fresher data                    |
| **Forward vs. trailing EPS** | Usually close (±10%)                     | If forward <trailing by >10%, flag declining earnings         |
| **Trailing vs. forward P/E** | Differ by >30%?                          | Investigate earnings inflection/seasonality; note explanation |
| **Forward EPS growth**       | If >trailing by >20%, flag strong growth | Expected? Growth company (check sector); note it              |
