---
name: news-sentiment
description: >-
  Assesses recent company-specific news sentiment for U.S. public companies — 
  earnings, guidance, analyst changes, product launches, competitive developments — 
  as dated, cited evidence with per-source confidence and an overall read. Use when research requires 
  recent news tone, investor sentiment, news evidence for a stock view, or to verify a sentiment call for a ticker.
license: ISC
metadata:
  author: trade-research
  version: "1.0.0"
  category: financial-research
  use-case: News sentiment analysis and aggregation
---

# News sentiment research

Gather recent, credible, company-specific news and assess its sentiment. Report only what you find; empty results are valid.

## Core workflow

### Step 1: Search company and key markets

**Rule:** Every entry is found and verified through `search`; there is no pre-fetched headline feed. Run the queries below, then open each promising result.

**Search queries** (run in order):

1. `"[TICKER] earnings"` — quarterly results, beat/miss, guidance
2. `"[TICKER] analyst" OR "[TICKER] rating change"` — analyst estimate/rating changes
3. `"[TICKER] product launch"` or `"[TICKER] acquisition"` — major developments
4. `"[TICKER] competitive"` — competitive wins or losses
5. Regional searches if applicable (e.g., `"[COMPANY] China"` for China revenue exposure)
6. `"[COMPANY] supply chain"` — supply-chain news

**Expected sources:** Reuters, Bloomberg, AP, CNBC, WSJ, FT, MarketWatch, TradingView, trade press

**NOT sources:** Blogs, speculation ("may announce"), personal finance sites, unconfirmed rumors

### Step 2: Open and verify every article

**Rule:** Never cite from a search snippet. Open the article and read the body.

**Verification checklist:**

1. Does the article contain company-specific news (not generic market commentary)?
2. Is the news recent (≤30 days preferred, up to 90 acceptable)?
3. Does the body support the headline sentiment? (Headlines can be sensational)
4. Is the date clear (publication or event date)?
5. Does the URL resolve to a major or reputable outlet?

**Examples:**

- ✅ "Apple Raises Guidance on Strong iPhone Sales" (Reuters, Oct 15) — specific, recent, credible, clear date
- ❌ "Investor Sentiment Improves for Tech Stocks" (aggregator, generic) — not company-specific
- ❌ "Apple May Be Planning a New Service" (blog, speculative) — unconfirmed

### Step 3: Classify sentiment and confidence per source

**Sentiment classification:**

| Sentiment    | Definition                                | Examples                                                                         |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------------------- |
| **Positive** | News likely to improve investor outlook   | Earnings beat, guidance raise, product success, analyst upgrade, competitive win |
| **Neutral**  | No clear positive or negative implication | Earnings inline, analyst maintains rating, expected event                        |
| **Negative** | News likely to worsen investor outlook    | Earnings miss, guidance cut, product delay, analyst downgrade, competitive loss  |

**Confidence classification:**

| Confidence | Criteria                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| **High**   | Primary source (company press release, SEC filing) OR major outlet with specific facts and corroboration          |
| **Medium** | Credible outlet (Reuters, Bloomberg, WSJ), single-source or only partly specific; trade press with verified facts |
| **Low**    | One outlet, unconfirmed details; thin coverage; ambiguous language ("may", "could")                               |

**Examples:**

- "Apple announces record services revenue" (Apple press release + Reuters) → **High confidence**
- "Quarterly earnings beat, per Reuters" (single major outlet, clear facts) → **High confidence**
- "Apple to face supply headwinds, analyst says" (single analyst quote, interpretation) → **Medium confidence**
- "Some say Apple may compete in glasses" (unattributed speculation) → **Low confidence**

### Step 4: Deduplicate by event

**Rule:** One event = one article entry. If five outlets cover the same earnings beat, cite the best source, not five entries.

**How to identify duplicates:**

- Same date and announcement (e.g., "Apple Q3 earnings", Oct 15)
- Same development announced (e.g., "Product X launch" — one entry per launch date)

**Which source to keep:**

1. Company press release or SEC filing (if available)
2. Major wire service (Reuters, AP, Bloomberg)
3. Major business outlet (WSJ, FT, CNBC)
4. Trade press or specialist outlet

**Example deduplication:**

- Found: Reuters (Apple Q3 earnings, Oct 15), CNBC (same, Oct 15), MarketWatch (same), WSJ (same)
- Action: Keep Reuters or WSJ only; drop the others

### Step 5: Write the overall news sentiment summary

**Rule:** Synthesize per-source sentiment into a holistic read. This is separate from, and does not repeat, individual source summaries.

**How to write:**

- Identify dominant sentiment (net positive, neutral, or negative)
- Note any conflicting signals
- Keep it 2–3 sentences
- Do not invent events; stick to what you found

**Example:**
"Recent coverage is net positive, driven by strong Q3 earnings beat and upbeat Q4 guidance for services. One analyst cautioned on China headwinds, but the consensus remains bullish."

## Reference

Deeper detail — what counts as material evidence, the source tiers and the recency standard — lives in [`references/reference.md`](references/reference.md). Read it when the workflow points you at a table that is not here.

## Output contract

```json
{
	"ticker": "SYMBOL",
	"dateChecked": "YYYY-MM-DD",
	"newsSentimentSources": [
		{
			"source": "Publisher/Outlet Name",
			"sentiment": "positive|neutral|negative",
			"confidence": "high|medium|low",
			"date": "YYYY-MM-DD",
			"summary": "1–2 sentences: the news and its implication.",
			"sourceUrl": "https://exact-url-you-opened"
		}
	],
	"newsSentimentSummary": "Overall holistic read of the coverage; 2–3 sentences.",
	"sourceUrls": ["https://...", "https://..."]
}
```

**Field rules:**

- `sourceUrls` is a deduplicated array of all URLs cited in individual entries
- `newsSentimentSummary` must be distinct from per-source summaries; it is a holistic read
- If no credible sources, return empty `newsSentimentSources` and set summary to "No material recent news found."
- Every URL in individual entries must also appear in `sourceUrls`

## Example output

```json
{
	"ticker": "AAPL",
	"dateChecked": "2026-10-16",
	"newsSentimentSources": [
		{
			"source": "Reuters",
			"sentiment": "positive",
			"confidence": "high",
			"date": "2026-10-15",
			"summary": "Apple reported Q4 earnings beat and raised full-year guidance on strength in services.",
			"sourceUrl": "https://www.reuters.com/business/apple-q4-earnings-..."
		},
		{
			"source": "Bloomberg",
			"sentiment": "positive",
			"confidence": "high",
			"date": "2026-10-14",
			"summary": "Goldman Sachs upgrades to Buy, citing attractive valuation and improving services margins.",
			"sourceUrl": "https://www.bloomberg.com/news/articles/2026-10-14-goldman-apple"
		},
		{
			"source": "Seeking Alpha",
			"sentiment": "negative",
			"confidence": "medium",
			"date": "2026-10-12",
			"summary": "Analyst questions sustainability of services growth given China slowdown.",
			"sourceUrl": "https://seekingalpha.com/article/..."
		}
	],
	"newsSentimentSummary": "Recent coverage is strongly positive following Q4 earnings beat and guidance raise, offset partially by medium-confidence reporting on China market softness. Major positive sentiment driven by services growth and Goldman Sachs upgrade.",
	"sourceUrls": [
		"https://www.reuters.com/business/apple-q4-earnings-...",
		"https://www.bloomberg.com/news/articles/2026-10-14-goldman-apple",
		"https://seekingalpha.com/article/..."
	]
}
```

## Example walkthrough

**Scenario:** Researching Apple news sentiment, today = Oct 16, 2026.

**Searches run:**

- "Apple earnings" → Q4 results (Oct 15)
- "Apple analyst" → rating changes (three firms)
- "Apple product" → rumors of upcoming releases
- "Apple China" → market slowdown report (Oct 10)

**Results:**

1. **Reuters, Oct 15:** "Apple Beats Q4, Raises Guidance"
   - Sentiment: Positive (beat + raise)
   - Confidence: High (major outlet, clear numbers)
   - Summary: "Q4 revenue beat driven by services strength; company raised full-year guidance citing robust iPhone demand."

2. **Bloomberg, Oct 14:** "Goldman Sachs Upgrades to Buy"
   - Sentiment: Positive (upgrade)
   - Confidence: High (major outlet, clear attribution)
   - Summary: "Goldman upgrades to Buy, citing attractive valuation and improving services margin trajectory."

3. **Reuters, Oct 10:** "Apple Faces China Headwinds"
   - Sentiment: Negative (headwind, concern)
   - Confidence: Medium (Reuters, but quote from unnamed officials)
   - Summary: "Apple faces slowing iPhone sales in China; officials cite competitive pressure from local brands."

4. **MacRumors, Oct 12:** "iPhone 15 Pro Release Rumored"
   - Sentiment: Neutral (speculation)
   - Confidence: Low (blog/rumor site, unconfirmed)
   - **Action: Exclude** (not confirmed by company or major press)

**Overall summary:** "Recent coverage is strongly positive following Q4 earnings beat and guidance raise, but tempered by medium-confidence reporting on China market softness."

## Common mistakes to avoid

- ❌ Claiming to have reviewed feeds (social, options, flows) you never opened
- ❌ Multiple sources for one event (padding the list)
- ❌ Summary reads positive while cited sources do not
- ❌ Inventing a date when the article's is unknown
- ❌ Including low-confidence speculation without flagging it as low confidence

## Troubleshooting

**Can't find recent news?**

- Expand date range to 30–60 days
- Try regional search: `"[COMPANY] [region] news"`
- If genuinely no material news, return empty `newsSentimentSources` and note "No material recent news found"

**Conflicting sentiment signals?**

- Note them in the summary: "Coverage is mixed..."
- Do not resolve to a single positive/negative; note the split
- Example: "Two sources positive on guidance, one negative on China exposure"

**Paywall-gated articles?**

- If you can see the headline, date, and key details, it still counts as verified
- Record the URL
- Claude often has access to paywalled content
- If completely inaccessible, drop the article

**Multiple articles from same outlet on same event?**

- Keep only the most recent and comprehensive one
- Do not list multiple Reuters articles on the same earnings beat
