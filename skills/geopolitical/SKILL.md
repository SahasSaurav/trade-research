---
name: geopolitical
description: >-
  Assesses geopolitical and macro risks materially connected to U.S. public companies — 
  conflicts, sanctions, tariffs, export controls, regulatory change, supply-chain disruption — 
  as dated, cited events with impact, horizon, and confidence grades. Use when research requires 
  geopolitical risk, macro exposure, supply-chain risk, or trade/regulatory risk for a ticker.
license: ISC
metadata:
  author: trade-research
  version: "1.0.0"
  category: financial-research
  use-case: Geopolitical and macro risk assessment
---

# Geopolitical risk research

Find developments that could materially affect a company, confirm the company connection, and grade the strength of each claim.

## Core workflow

### Step 1: Map the company's exposure

**Rule:** Before searching, understand where the company operates, manufactures, and sources.

**Information to gather:**

- **Geographic revenue exposure:** What % of revenue from each region? (US, Europe, China, Asia-Pacific, etc.)
- **Manufacturing hubs:** Where are products made? (e.g., Apple → Taiwan, China, Vietnam)
- **Key suppliers:** Where do critical inputs come from? (e.g., chips from Taiwan, rare earths from China)
- **Key customers:** Major customers in specific regions
- **Logistics:** Key shipping routes (e.g., Suez Canal, Taiwan Strait)

**Where to find this:**

- Company 10-K (geographic revenue breakdown, supply chain footnotes)
- Investor presentations or earnings calls
- News articles on the company's operations

**Example:** Apple: ~20% revenue from China, manufacturing in China/Vietnam, supplies from Taiwan (chips), logistics through Suez Canal.

### Step 2: Search each region and category for geopolitical developments

**Risk categories and search terms:**

| Category             | Search terms                                                   | Examples                                  |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| **Conflicts & wars** | "[region] conflict", "[country] war", "[country] invasion"     | Ukraine, Middle East, Taiwan strait       |
| **Sanctions**        | "[country] sanctions", "export controls", "trade restrictions" | Russia sanctions, China export controls   |
| **Tariffs & trade**  | "[country] tariffs", "trade war", "trade agreement"            | US-China tariffs, EU regulations          |
| **Supply chain**     | "[region] supply", "[material] shortage", "port disruption"    | Taiwan chip supply, rare earth disruption |
| **Regulation**       | "[country] regulation", "antitrust", "data privacy laws"       | GDPR, China privacy laws, US antitrust    |
| **Politics**         | "[country] election", "[country] unrest", "political risk"     | Taiwan elections, Hong Kong, Venezuela    |
| **Macro**            | "[currency] crisis", "[country] debt", "economic slowdown"     | Emerging market crises, recession         |

**Search examples for Apple:**

- "Taiwan conflict risk" / "China Taiwan" / "Taiwan strait"
- "US China export controls" / "chip export ban"
- "Vietnam labor" / "manufacturing Vietnam"
- "Suez Canal disruption" / "Red Sea shipping"

### Step 3: Confirm the company connection

**The connection rule:** Include an event only if there is a clear, credible link to the company or its industry. No connection = exclude.

**Valid connection types:**

| Connection            | Example                                                               | Validity          |
| --------------------- | --------------------------------------------------------------------- | ----------------- |
| **Direct operations** | Taiwan conflict risk → Apple manufactures/sources chips in Taiwan     | ✅ Direct         |
| **Supply chain**      | Export controls on advanced chips → Apple's suppliers (TSMC) affected | ✅ Indirect       |
| **Customer impact**   | US economic slowdown → reduced consumer spending → lower sales        | ✅ Demand-side    |
| **Regulatory**        | EU data privacy law → Apple must comply, cost implications            | ✅ Regulatory     |
| **Macro but linked**  | China GDP slowdown → lower demand in key market                       | ✅ Macro exposure |
| **Generic**           | General market turbulence in a region where company operates          | ❌ Too vague      |
| **Unrelated**         | Trade conflict between two countries with no company presence         | ❌ No connection  |

**How to confirm:**

1. Read the full article (not just headline)
2. Ask: "How does this event specifically affect this company?" (Revenue? Costs? Supply? Regulation?)
3. If you cannot establish a link in 1–2 sentences, mark `companyConnection: "none"` and **exclude the entry**

### Step 4: Deduplicate by event

**Rule:** One event = one entry. If five outlets cover "Taiwan raises military spending," it's one entry.

**How to identify duplicates:**

- Same date, same country/region, same event (e.g., "Taiwan election", "US tariff on chips")
- If multiple outlets cover it on different dates, use the first credible report

**Which source to keep:**

1. Official announcement (government press release, formal policy)
2. Wire services (Reuters, AP, Bloomberg)
3. Major business/political press (WSJ, FT, CNBC)
4. Specialist geopolitical outlets (e.g., Council on Foreign Relations)

### Step 5: Grade impact, horizon, confidence, and status

**Impact** — How does this affect the company?

| Impact        | Definition                                                                        | Examples                                                        |
| ------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Positive**  | Reduces cost, improves competitive position, expands market access                | Tariff cut, regulatory approval, competitor restricted          |
| **Neutral**   | No clear near-term effect on the company                                          | Political change in low-exposure country                        |
| **Negative**  | Increases cost, disrupts supply, reduces market access, imposes compliance burden | Export restrictions, supply disruption, sanctions on key market |
| **Uncertain** | Effect depends on escalation or policy detail                                     | "Potential tariffs" or "talks on" restrictions                  |

**Time horizon** — When will this matter?

| Horizon        | Definition                                                  | Examples                                                |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| **Immediate**  | Days to weeks; direct operational impact now                | Port closure, supply disruption, sanctions take effect  |
| **Short_term** | Weeks to months; impact materializes within current quarter | Tariff announcement → implementation in 60 days         |
| **Long_term**  | Months to years; strategic or structural shift              | Regulatory regime change, trade agreement renegotiation |

**Confidence** — How firm is the evidence?

| Confidence | Definition                                                               | Examples                                             |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| **High**   | Official announcement, multiple credible sources confirm                 | "Taiwan parliament passes law" (Reuters + Bloomberg) |
| **Medium** | Credible reporting, single source; or formal proposal with clear pathway | "US officials propose export ban" (Reuters)          |
| **Low**    | Speculation, rumor, or early-stage proposal with uncertain outcome       | "May restrict exports", "discussions underway"       |

**Status** — What is the certainty of the claim itself?

| Status          | Definition                                               | Examples                                          |
| --------------- | -------------------------------------------------------- | ------------------------------------------------- |
| **Confirmed**   | Official policy/law enacted, or verified event occurred  | "Export ban on advanced chips takes effect today" |
| **Proposed**    | Formal proposal or announcement; policy pathway is clear | "US proposes new tariff on semiconductors"        |
| **Speculative** | Rumor, unconfirmed report, or preliminary discussions    | "Sources say discussions ongoing"                 |

**How to grade:**

1. Determine **impact** (positive / negative / neutral / uncertain)
2. Estimate **timeHorizon** (immediate / short_term / long_term)
3. Assess **confidence** (high / medium / low)
4. State **status** (confirmed / proposed / speculative)
5. Write **confidenceEvidence** — 1 sentence explaining your confidence grade

### Step 6: Write the geopolitical risk summary

**Rule:** Synthesize per-event summaries into a holistic risk assessment.

**How to write:**

- Identify dominant risk profile (stable, mixed, elevated)
- Highlight most material near-term risks
- Note any long-term structural shifts
- Keep it 2–3 sentences
- Do not invent risks; stick to what you found

**Example:**
"Near-term supply chain risk is elevated due to proposed US export controls on advanced semiconductors, but still at proposal stage. Taiwan political stability remains intact. No immediate operational disruption anticipated, but cost pressures may rise if tariffs are enacted."

## Output contract

```json
{
	"ticker": "SYMBOL",
	"dateChecked": "YYYY-MM-DD",
	"geopoliticalRisks": [
		{
			"event": "Concise description of the development",
			"affectedRegion": "The region involved",
			"eventDate": "YYYY-MM-DD",
			"sourceUrl": "https://exact-url-you-opened",
			"publisher": "Publisher or outlet name",
			"publicationDate": "YYYY-MM-DD",
			"companyConnection": "revenue_exposure|operations|suppliers|customers|logistics|commodities|regulation|market_access|none",
			"impact": "positive|neutral|negative|uncertain",
			"timeHorizon": "immediate|short_term|long_term",
			"confidence": "high|medium|low",
			"confidenceEvidence": "Why you assigned this confidence grade (1 sentence)",
			"status": "confirmed|proposed|speculative"
		}
	],
	"geopoliticalSummary": "Holistic risk read; 2–3 sentences.",
	"sourceUrls": ["https://...", "https://..."]
}
```

**Field rules:**

- `companyConnection` is required; choose the most relevant type (not a guess)
- If `companyConnection: "none"`, **exclude the entire event entry**
- `sourceUrls` is a deduplicated array of all URLs cited
- `geopoliticalSummary` must be distinct from per-event summaries; it is a holistic read
- If no credible risks found, return empty `geopoliticalRisks` and set summary to "No material geopolitical risks identified in the last 30 days."

## Example output

```json
{
	"ticker": "AAPL",
	"dateChecked": "2026-10-16",
	"geopoliticalRisks": [
		{
			"event": "New export controls on advanced chips proposed by US government",
			"affectedRegion": "US-China",
			"eventDate": "2026-10-10",
			"sourceUrl": "https://reuters.com/business/us-export-controls...",
			"publisher": "Reuters",
			"publicationDate": "2026-10-10",
			"companyConnection": "suppliers",
			"impact": "negative",
			"timeHorizon": "short_term",
			"confidence": "medium",
			"confidenceEvidence": "Named suppliers affected (TSMC); company impact inferred but not stated by Apple.",
			"status": "proposed"
		},
		{
			"event": "Taiwan heightens military readiness amid strait tensions",
			"affectedRegion": "Taiwan",
			"eventDate": "2026-10-05",
			"sourceUrl": "https://reuters.com/world/taiwan-military...",
			"publisher": "Reuters",
			"publicationDate": "2026-10-05",
			"companyConnection": "operations",
			"impact": "negative",
			"timeHorizon": "long_term",
			"confidence": "high",
			"confidenceEvidence": "Reuters, official Taiwan military statement; Apple's Taiwan supply chain is well-documented.",
			"status": "confirmed"
		},
		{
			"event": "Suez Canal traffic remains normal; no disruption",
			"affectedRegion": "Global shipping",
			"eventDate": "2026-10-14",
			"sourceUrl": "https://reuters.com/business/suez-canal-normal...",
			"publisher": "Reuters",
			"publicationDate": "2026-10-14",
			"companyConnection": "logistics",
			"impact": "neutral",
			"timeHorizon": "immediate",
			"confidence": "high",
			"confidenceEvidence": "Reuters report; Suez Canal is a key shipping route for Apple's logistics.",
			"status": "confirmed"
		}
	],
	"geopoliticalSummary": "Near-term supply chain risk is elevated due to proposed US export controls on advanced semiconductors, but still at proposal stage. Taiwan political stability remains intact, though long-term tensions warrant monitoring. No immediate operational disruption anticipated, but cost pressures may rise if tariffs are enacted.",
	"sourceUrls": [
		"https://reuters.com/business/us-export-controls...",
		"https://reuters.com/world/taiwan-military...",
		"https://reuters.com/business/suez-canal-normal..."
	]
}
```

## Reference

Deeper detail — the full company-connection taxonomy — lives in [`references/reference.md`](references/reference.md). Read it when the workflow points you at a table that is not here.

## Common mistakes to avoid

- ❌ Including an event because it happened in a country the company operates in (too vague)
- ❌ Counting one event across five outlets as five risks (deduplication failure)
- ❌ Stating a proposed or speculative development as confirmed
- ❌ Inventing a company connection, date, or URL
- ❌ Setting `companyConnection: "none"` then including the event (should be excluded)
- ❌ Confusing `eventDate` with `publicationDate` (event date is when it occurred, publication date is when reported)

## Troubleshooting

**Can't find a company connection?**

- Re-read the article thoroughly
- If the event is in a region where the company operates but has <5% revenue, connection is too weak
- If you cannot articulate the connection in 1–2 sentences, exclude the event

**Multiple articles about same event?**

- Keep only the first credible report
- Use the earliest publication date
- Do not list Reuters (Oct 10) and Bloomberg (Oct 11) both reporting the same Taiwan military announcement

**Speculative reporting on a major event?**

- Mark as `status: "speculative"` with low confidence
- Include it if it's from a credible source, but grade it appropriately
- Example: "US may impose tariffs" (speculative) vs. "US imposes tariffs" (confirmed)

**Event is old (>90 days)?**

- Include if it remains ongoing and material
- Example: A war that started 120 days ago but ongoing = include
- Example: A past regulatory change with ongoing compliance burden = include
- Example: A one-time event from 6 months ago with no ongoing impact = exclude

**Company makes conflicting statements about risk?**

- Use company's most recent official statement
- If company downplays risk but external sources confirm it, note the conflict in notes
- Let the data speak; do not resolve conflicting claims

**Geopolitical event with unclear impact on company?**

- Mark `impact: "uncertain"` rather than guessing
- Explain in summary why the impact is unclear
- Example: "Impact depends on whether sanctions include supply chain components"
