# How sell-side analysts work

Background for reading a report the way its author wrote it. Nothing here changes
the output contract — but it changes what a report _means_, which report you keep,
and what belongs in `summary`.

## What the job actually is

A covering analyst owns a short list of names (typically 8–20) inside one sector.
They are measured on how those names perform against the sector and the market, and
on how often their estimates are right — not on how often they are right about the
direction of the whole market. The output is a stream of research, not one call:

| Product                                           | When it lands                                 | What it carries                                                                        |
| ------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Initiation of coverage**                        | Once, when coverage starts                    | Full model, first rating, first price target, the sector framing, the bull/bear debate |
| **Earnings note**                                 | Within hours of the print, often pre-market   | Actual vs estimate, the read on guidance, revised estimates, sometimes a new target    |
| **Rating change**                                 | On a thesis shift                             | Upgrade or downgrade, the reason, usually a target change                              |
| **Target change**                                 | On estimate revisions or a multiple re-rating | A new 12-month target, rating usually unchanged                                        |
| **Sector or thematic note**                       | Ad hoc                                        | One view across several names; may carry targets for more than one ticker              |
| **Preview / review, field trip, conference note** | Around events                                 | Setup, channel checks, management commentary — often no new rating                     |

Ratings and targets move on **separate clocks**. "Raises target to $260, keeps Buy"
is a target action with no rating change — the most common note there is — and it is
still worth recording, because the target is the number that moved.

## The work behind the note

1. **Build and maintain a model** — revenue drivers, gross and operating margin,
   EPS, free cash flow and the balance sheet, per quarter and per year, out two to
   three years.
2. **Forecast drivers, not totals** — units, pricing, subscribers, ASP, mix, FX,
   capex. The estimates clients track (revenue, EPS) fall out of that.
3. **Derive a value.** The target comes from a method, not a feel:
   - discounted cash flow (WACC, terminal growth),
   - relative multiples (P/E, EV/EBITDA, EV/Sales) against peers and the stock's own
     history,
   - sum-of-the-parts for conglomerates,
   - dividend discount for income names, NAV for asset-heavy ones.
4. **Assign a rating from the upside.** Most firms publish a band — for example Buy
   above roughly +10–15% expected 12-month total return, Hold from roughly flat to
   +10%, Sell below roughly flat. Bands differ by firm, so the same stock can be a
   Buy at one house and a Hold at another with targets only a few percent apart.
5. **Refresh on events** — every print, every guidance change, anything that touches
   a driver. Estimates are revised far more often than ratings.

## What the rating really means

- **It is relative, and it is 12-month.** "Overweight" means the analyst expects the
  stock to beat its coverage universe or the market over the next year. It is not a
  promise that the share price rises, and it is not a long-term view.
- **The scale is 3–5 buckets** collapsed to Buy/Hold/Sell — see the rating mapping
  in `reference.md`. "Strong Buy" and "Buy" both become Buy; "Reduce" and "Sell"
  both become Sell.
- **The distribution is skewed bullish.** Across the street roughly half of ratings
  are Buy, most of the rest Hold, and only a few percent Sell. The reasons are
  structural: banking relationships, dependence on management access, and the cost
  of being wrong on a Sell. So read a Hold as nearer to "not attractive enough to
  own" than to "neutral", and read the _cluster_ of ratings rather than any one.
- **A Hold on a good company is a valuation call**, not a quality call. The company
  can be excellent and the stock fully priced.
- **Targets lag the tape.** Analysts revise toward price: prices fall, targets
  follow. Aggregate targets are a poor forecast and a fair summary of where the
  street's estimates sit.

## Reading the note itself

Where each part of a real report lives:

| You want                            | Look in                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| Rating, target, action              | The top block — "Upgrade to Overweight, PT to $260"                |
| Estimate changes                    | An old-vs-new table (FY26E, FY27E EPS)                             |
| Why now                             | The opening paragraph, usually labelled the key debate or catalyst |
| The derivation                      | The valuation section — "we value XYZ at 12x our FY27E EPS"        |
| The counter-argument                | A risks or bear-case paragraph                                     |
| Rating definitions and distribution | The disclosure appendix                                            |

The disclosure appendix is the only place a firm states what its own ratings mean
and how they are distributed. When a rating label is ambiguous, that appendix
settles it — it is the authoritative mapping, ahead of any aggregator.

## Signals stronger than the headline

- **Direction of estimate revisions** — numbers going up beats a rating level.
- **A cluster of moves the same way** in a short window — several firms upgrading
  within days is a re-rating, not noise.
- **Target dispersion** — targets spread far around the current price mean the
  street has no shared model; targets that cluster mean it does.
- **The first mover** — the firm that changed _before_ the tape moved, not after.
- **An initiation** — fresh coverage carries a full model and an explicit debate.
- **A stale reiteration** — "maintains Buy" with an unchanged target months old is
  the weakest note on the street.

## Street vocabulary

| Term                 | Means                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| PT / PO / TP         | price target — the 12-month number                                                         |
| Initiation           | the first note on a newly covered name                                                     |
| Reiterate / maintain | same rating, no change; the target may or may not move                                     |
| Roll-forward         | moving estimates and the target onto the next fiscal year                                  |
| Print                | the quarterly earnings release                                                             |
| Beat / miss          | actual versus consensus estimate                                                           |
| Consensus            | the street average (mean or median) of published estimates                                 |
| Whisper number       | what traders privately expect, above published consensus                                   |
| Channel check        | talking to suppliers, retailers, customers — non-public research                           |
| NDR / roadshow       | an analyst-hosted management marketing trip                                                |
| Sell-side            | brokerages that publish research and sell it to clients                                    |
| Buy-side             | funds that invest; they consume the research                                               |
| Coverage             | the set of names one analyst covers                                                        |
| Quiet period         | the window after an IPO, or while a banking mandate is live, when the firm may not publish |
| AS1 / II-ranked      | analyst seniority markings (All-American, Institutional Investor)                          |

## How this changes what you record

The schema is unchanged — these rules shape `summary` and decide which report you
keep.

1. **Name the action, not just the rating.** "Upgrades to Buy on margin recovery"
   beats "Buy". Say initiation / upgrade / downgrade / reiterate, and say so when
   the target moved ("raises PT to $260").
2. **Say when the call is relative or valuation-driven.** "Sector-relative
   Overweight", or "Hold on full valuation", distinguishes a discouraged view from
   a neutral one.
3. **Prefer the most recent action** when a firm published several notes: a fresh
   target change supersedes an older reiteration carrying the same rating.
4. **Do not let aggregator artefacts become your data.** A TipRanks or MarketBeat
   "consensus" blends stale ratings and can hide the action that just happened.
   Prefer the note itself.
5. **Do not carry the analyst's own model numbers.** Record the rating, the stated
   target and the reason — never the EPS forecasts or the DCF assumptions.
6. **Keep it to 1–2 sentences:** action, driver, and — only if it is the point of
   the note — the risk or the disagreement.
