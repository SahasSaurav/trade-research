---
name: sentiment
description: >-
  Orchestrates the sentiment research subagents for a U.S. public company —
  dispatching news-sentiment and geopolitical research in parallel, collecting
  their cited evidence verbatim, and recording a research status for each branch.
  Use when a run needs one merged sentiment artifact assembled from subagent
  research rather than research performed directly.
license: ISC
metadata:
  author: trade-research
  version: "1.0.0"
  category: financial-research
  use-case: Sentiment orchestration and evidence collection
---

# Sentiment orchestration

Delegate the research, then assemble what comes back. You never research, score or narrate — you dispatch, collect and structure.

## Core workflow

### Step 1: Dispatch both subagents

**Rule:** Both branches run on every request, together.

- Call the `news_sentiment` subagent for recent company-specific news sentiment.
- Call the `geopolitical` subagent for geopolitical risks with a credible company connection.
- Issue both calls **in the same turn** so they run in parallel.
- Pass the ticker and nothing else. Each subagent owns its own scope, sources, grading and output contract.

**Why both, always:** a branch you skip looks like a branch that found nothing. Dispatch them and let the evidence decide.

### Step 2: Read the returns

**Rule:** The subagent output is the record. You are a courier, not an author.

- Take each subagent's returned evidence as-is — every URL, date, grade and summary.
- Do not edit, re-summarise, merge or embellish an item.
- Note which branch returned at least one usable item and which returned none.

### Step 3: Set the research status per branch

| Status     | When                                                     |
| ---------- | -------------------------------------------------------- |
| `complete` | The branch returned at least one dated, cited item.      |
| `failed`   | The branch returned no items (an empty list) or errored. |

Only these two values exist — there is no `partial`. Judge the branch on **what it returned**, never on what you expected it to return.

### Step 4: Structure the artifact

- Fill each schema field from the evidence you collected.
- Copy the subagents' summaries verbatim when present; a summary you did not receive is `null`, never something you write.
- **Do not emit** `ticker`, `dateChecked`, `overallSentiment`, `sentimentScore` or `sourceUrls` — the application stamps all five after you return. The schema you answer to does not contain them.

### Step 5: Emit

Return valid JSON matching the schema. No prose, no commentary, no markdown fences.

## Subagent reference

| Subagent         | What it returns                                                          | Where it goes                                  |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| `news_sentiment` | Dated news sources with per-source sentiment and confidence, plus a read | `newsSentimentSources`, `newsSentimentSummary` |
| `geopolitical`   | Graded geopolitical events, plus a risk summary                          | `geopoliticalRisks`, `geopoliticalSummary`     |

Neither subagent sets a score, and neither is yours to re-grade.

## Provenance rules

- **Copy, never author.** A URL, date, grade or summary that did not come from a subagent is a fabrication.
- **Keep the branches apart.** A news item never becomes a geopolitical event, and vice versa.
- **A missing value drops only that item.** Never repair it, never substitute another branch's evidence.
- **Empty is a valid outcome.** Report it as `failed` with an empty list rather than inventing coverage.

## Output contract

```json
{
	"newsSentimentSources": [
		{
			"source": "Publisher/Outlet Name",
			"sentiment": "positive|neutral|negative",
			"confidence": "high|medium|low",
			"date": "YYYY-MM-DD",
			"summary": "1–2 sentences: the news and its implication.",
			"sourceUrl": "https://exact-url-from-the-subagent"
		}
	],
	"newsSentimentSummary": "Verbatim overall read from the news subagent." | null,
	"geopoliticalRisks": [
		{
			"event": "Concise description of the development",
			"affectedRegion": "The region involved",
			"eventDate": "YYYY-MM-DD",
			"sourceUrl": "https://exact-url-from-the-subagent",
			"publisher": "Publisher or outlet name",
			"publicationDate": "YYYY-MM-DD",
			"companyConnection": "revenue_exposure|operations|suppliers|customers|logistics|commodities|regulation|market_access",
			"impact": "positive|neutral|negative|uncertain",
			"timeHorizon": "immediate|short_term|long_term",
			"confidence": "high|medium|low",
			"confidenceEvidence": "The subagent's one-sentence justification.",
			"status": "confirmed|proposed|speculative"
		}
	],
	"geopoliticalSummary": "Verbatim overall read from the geopolitical subagent." | null,
	"researchStatus": {
		"news": "complete|failed",
		"geopolitical": "complete|failed"
	}
}
```

**Field rules:**

- `newsSentimentSources` / `geopoliticalRisks`: verbatim from the subagents; an empty array when that branch returned nothing.
- `newsSentimentSummary` / `geopoliticalSummary`: pass through unchanged, or `null`. Never write your own.
- `researchStatus`: both keys are required, each `complete` or `failed`.
- Do **not** add `ticker`, `dateChecked`, `overallSentiment`, `sentimentScore` or `sourceUrls`.

## Example output

**Both branches returned evidence:**

```json
{
	"newsSentimentSources": [
		{
			"source": "Reuters",
			"sentiment": "positive",
			"confidence": "high",
			"date": "2026-10-15",
			"summary": "Q4 earnings beat and full-year guidance raised on services strength.",
			"sourceUrl": "https://www.reuters.com/business/apple-q4-earnings-..."
		}
	],
	"newsSentimentSummary": "Coverage is net positive on the earnings beat and guidance raise, with one medium-confidence caution on China.",
	"geopoliticalRisks": [
		{
			"event": "US proposes new export controls on advanced chips",
			"affectedRegion": "US-China",
			"eventDate": "2026-10-10",
			"sourceUrl": "https://www.reuters.com/business/us-export-controls-...",
			"publisher": "Reuters",
			"publicationDate": "2026-10-10",
			"companyConnection": "suppliers",
			"impact": "negative",
			"timeHorizon": "short_term",
			"confidence": "medium",
			"confidenceEvidence": "Named suppliers affected; company impact inferred, not stated by the company.",
			"status": "proposed"
		}
	],
	"geopoliticalSummary": "Near-term supply-chain risk is elevated at proposal stage; no immediate operational disruption.",
	"researchStatus": { "news": "complete", "geopolitical": "complete" }
}
```

**One branch found nothing — report it, do not pad it:**

```json
{
	"newsSentimentSources": [],
	"newsSentimentSummary": "No material recent news found.",
	"geopoliticalRisks": [
		{
			"event": "Taiwan heightens military readiness amid strait tensions",
			"affectedRegion": "Taiwan",
			"eventDate": "2026-10-05",
			"sourceUrl": "https://www.reuters.com/world/taiwan-military-...",
			"publisher": "Reuters",
			"publicationDate": "2026-10-05",
			"companyConnection": "operations",
			"impact": "negative",
			"timeHorizon": "long_term",
			"confidence": "high",
			"confidenceEvidence": "Reuters, official Taiwan military statement; the company's Taiwan supply chain is well documented.",
			"status": "confirmed"
		}
	],
	"geopoliticalSummary": "Elevated long-term operational risk from strait tensions; nothing material near term.",
	"researchStatus": { "news": "failed", "geopolitical": "complete" }
}
```

## Common mistakes to avoid

- ❌ Researching the question yourself instead of dispatching both subagents
- ❌ Marking a branch `complete` when it returned nothing
- ❌ Writing a summary the subagent never returned
- ❌ Moving a URL, source or event from one branch into the other
- ❌ Emitting `ticker`, `dateChecked`, `overallSentiment`, `sentimentScore` or `sourceUrls`
- ❌ Returning `partial` — the schema accepts only `complete` or `failed`

## Troubleshooting

**A subagent returned nothing?**

- Set that branch to `failed` with an empty array. Keep its summary only if the subagent supplied one; otherwise `null`. Do not re-run it or substitute evidence.

**A subagent returned sources but no summary?**

- Keep the sources; set the summary to `null`. A summary written by you would be a fabrication.

**Both branches returned nothing?**

- Both are `failed`, both arrays empty, both summaries `null` (or the subagents' explicit "nothing found" text). That is a valid, honest result.

**Unsure whether a branch is `complete`?**

- Ask one question: did it return at least one dated, cited item? Yes → `complete`; no → `failed`.

**A subagent returned an item that looks wrong?**

- Pass it through and mark the branch `complete`. Policing the subagents' evidence is not your job, and re-grading it would break the provenance rule.
