---
name: analyst
description: >-
  Finds and verifies current sell-side analyst research on U.S. public companies — 
  rating, price target, date, and thesis — from 3+ different firms with standardized rating mapping. 
  Use when research requires analyst consensus, ratings, price targets, upgrades/downgrades, 
  or sell-side tone for a ticker. Returns structured JSON of verified reports with full source attribution.
license: ISC
metadata:
  author: trade-research
  version: "1.0.0"
  category: financial-research
  use-case: Analyst research aggregation with verification
---

# Sell-side analyst research

Gather and verify current analyst research reports on U.S. public companies, then structure them as verified JSON with full source attribution.

## Core workflow

### Step 1: Search for current reports

**Search queries** (run in order):

1. `"[TICKER] analyst rating"`
2. `"[TICKER] analyst report"`
3. `"[TICKER] upgrade"`
4. `"[TICKER] downgrade"`
5. Individual Tier 1 firm searches: `"[FIRM NAME] [TICKER] rating"`

**Stop searching when:** You have found at least 1 credible report and have exhausted Tier 1 sources. If Tier 1 yields <3, proceed to Tier 2.

### Step 2: Confirm the issuer (NOT merely cited)

**Verification rule:** The firm must have issued the research directly. News articles citing a report are secondary; the original source is primary.

**How to verify:**

- Firm's own research page or press release → ✅ **Issuer confirmed**
- TipRanks/MarketBeat linking to original firm research → ✅ **Issuer confirmed** (verify the link resolves)
- Bloomberg/Reuters citing a specific report date and firm → ✅ **Issuer confirmed** (article quotes the firm)
- "Analysts may be considering" or speculation → ❌ **Reject** (not confirmed)

### Step 3: Extract the five required fields per report

| Field           | Rule                                                              | Where to find                           |
| --------------- | ----------------------------------------------------------------- | --------------------------------------- |
| **firm**        | Exact institution name (e.g., "Morgan Stanley")                   | Report header or firm's website         |
| **reportTitle** | Report title or article headline if original unavailable          | Report cover or article header          |
| **rating**      | Rating from the report **body** (not headline) — must be explicit | Report body; map to Buy/Hold/Sell scale |
| **priceTarget** | 12-month USD target (or null if unstated; never guess)            | Report body; if range, use midpoint     |
| **reportDate**  | Date issued, `YYYY-MM-DD` format                                  | Report date or article publish date     |
| **sourceUrl**   | The exact URL you opened (must resolve)                           | Browser address bar                     |
| **summary**     | 1–2 sentences: why the rating, key catalyst or concern            | Synthesize from report body             |

**Critical rule:** If any of firm, rating, sourceUrl, or reportDate cannot be verified, **drop that report entirely.** Do not guess or estimate.

### Step 4: Deduplicate by firm

- **One report per firm only** — if a firm issued multiple reports in the last 90 days, keep only the most recent.
- Drop older reports from the same firm.

### Step 5: Re-verify each report before emitting

For each report you intend to include:

1. **Rating stated, not inferred:** Open the source URL again. The rating (Buy, Hold, Sell) must appear explicitly in the report body.
2. **Price target stated or absent:** Confirm the target exists and is a 12-month USD figure (or note non-USD currency).
3. **Date correct:** Verify the report or article date matches your record.
4. **URL resolves:** Paste into browser — it must load and show the article.
5. **Thesis clear:** You can summarize the analyst's reasoning in 1–2 sentences.

**If any verification fails, drop the report.**

### Step 6: Emit the structured result

Return valid JSON with no prose.

## Reference

Deeper detail — the rating mapping, the firm tiers and the source priority — lives in [`references/reference.md`](references/reference.md). Read it when the workflow points you at a table that is not here.

## Output contract

```json
{
  "ticker": "SYMBOL",
  "dateChecked": "YYYY-MM-DD",
  "reports": [
    {
      "firm": "Institution Name",
      "reportTitle": "Report or Article Title",
      "rating": "Buy|Hold|Sell",
      "priceTarget": 123.45 | null,
      "reportDate": "YYYY-MM-DD",
      "sourceUrl": "https://exact-url-you-opened.com",
      "summary": "1–2 sentence thesis."
    }
  ]
}
```

**Field rules:**

- `priceTarget` is the only nullable field; set to `null` when unstated, never estimated
- If stated as a range ($240–$260), use midpoint ($250) and note "range midpoint" in summary
- If stated in a non-USD currency and FX rate is not in the report, set to `null` and note currency in summary
- `reports` array is required; return ≥1 verified report minimum
- No padding: return only verified reports, even if <3

## Example output

```json
{
	"ticker": "AAPL",
	"dateChecked": "2026-10-16",
	"reports": [
		{
			"firm": "Morgan Stanley",
			"reportTitle": "Apple: Services Inflection Ahead",
			"rating": "Buy",
			"priceTarget": 240,
			"reportDate": "2026-10-15",
			"sourceUrl": "https://morganstanley.com/research/apple-2026-10-15",
			"summary": "Upgrades to Overweight on accelerating services growth and margin expansion in next fiscal year."
		},
		{
			"firm": "Goldman Sachs",
			"reportTitle": "Apple: Upgrade to Overweight",
			"rating": "Buy",
			"priceTarget": 250,
			"reportDate": "2026-10-10",
			"sourceUrl": "https://bloomberg.com/news/articles/2026-10-10-goldman-sachs-upgrades-apple",
			"summary": "Upgrades on strong ecosystem moat and services growth; cites valuation upside."
		},
		{
			"firm": "Bernstein",
			"reportTitle": "Apple: iPhone Cycle Maturation",
			"rating": "Hold",
			"priceTarget": null,
			"reportDate": "2026-09-28",
			"sourceUrl": "https://bernstein.com/research/apple-market-perform",
			"summary": "Maintains Market Perform; no price target due to cyclical uncertainty in device revenue."
		}
	]
}
```

## Common mistakes to avoid

- ❌ Two reports from the same firm (keep only most recent)
- ❌ A report merely cited by news (not issued by the firm directly)
- ❌ `rating` or `sourceUrl` that is `null`, `""`, or a guess
- ❌ Headline rating that disagrees with report body (use body)
- ❌ Padding to three with weak sources (return only verified reports)
- ❌ `priceTarget` set to `null` then estimated in the summary

## Troubleshooting

**Can't find a firm's research page?**

- Try: `site:[firmname].com [ticker] rating`
- Or search the firm's research portal directly
- If unavailable, use TipRanks or MarketBeat as secondary

**Unsure if a rating is stated?**

- Re-read the report body (not headline)
- If it says "positive view" but no explicit rating, ask: "Is there a named rating (Buy/Sell/Hold)?"
- If no explicit rating, drop the report

**Source URL is behind a paywall?**

- If you can see the headline and key details (firm, rating, date, target), it still counts as verified
- Record the URL; Claude can often access paywalled content
- If the article is completely inaccessible, drop it

**Conflicting reports from the same firm?**

- Keep only the most recent report
- Note in the summary if an older version had a different rating
