# How valuation is actually done

Background for reading the multiples you collect the way a practitioner does.
Nothing here changes the output contract — this agent still records verified inputs
and tool-computed multiples. But a multiple is a claim about growth, capital
structure and accounting quality compressed into one number, and knowing the
machinery is what lets you date it honestly and flag when it stops meaning
anything.

## The methods behind a valuation

Practitioners value a company several ways and triangulate. The "football field" is
the spread of the answers, not any single one of them.

| Method                     | Values                               | Needs                                             | Used when                                |
| -------------------------- | ------------------------------------ | ------------------------------------------------- | ---------------------------------------- |
| **DCF**                    | the business from its own cash flows | FCF forecasts, WACC, terminal growth              | cash-generative, forecastable businesses |
| **Trading comparables**    | the equity against peers today       | peer multiples, the right multiple for the sector | most of the time — the market check      |
| **Precedent transactions** | the equity against past M&A          | deal multiples, a control premium                 | takeover contexts                        |
| **Sum-of-the-parts**       | each segment, then the total         | segment financials, a multiple per segment        | conglomerates                            |
| **DDM / NAV**              | income, or assets                    | dividends and payout; asset values                | banks, insurers, REITs, resource names   |
| **LBO / floor value**      | what a financial buyer could pay     | debt capacity, a returns hurdle                   | framing the downside                     |

All of them end at the same two numbers the street quotes: a **price target** and a
**rating**. The target is the derived value; the rating is that target's upside
measured against the firm's published band. Neither is a forecast of the price.

## What each multiple really measures

| Multiple            | What it prices                           | What it hides                                                       |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| **Trailing P/E**    | earnings already delivered               | the future, and every one-off inside the last twelve months         |
| **Forward P/E**     | consensus earnings nobody has earned yet | how reliable the estimate is; it moves whenever estimates move      |
| **PEG**             | growth per unit of price                 | risk, duration, and whether the growth is durable or cyclical       |
| **EV/EBITDA**       | the enterprise before financing and tax  | capex, working capital, real depreciation — the cost of the machine |
| **EV/EBIT, EV/FCF** | the enterprise after real costs          | still capital-structure-neutral, but less flattering                |
| **P/B**             | book equity                              | asset quality; only meaningful for financials                       |
| **P/S, EV/Sales**   | revenue                                  | every cost, and therefore every margin                              |
| **P/NAV**           | asset value                              | how realizable those assets are                                     |

**A P/E is only comparable on matched capital structure and accounting.** Leverage
lifts the P/E at unchanged enterprise value, because more of the earnings belong to
a riskier claim. A buyback cuts the share count and lifts EPS with no change in the
business. One-off gains and impairments land in GAAP EPS and disappear from an
adjusted figure. The number on its own is not a verdict — it is a prompt to ask
_which earnings, whose capital structure, and which accounting_.

## Which multiple the sector uses

Practitioners use the metric that survives the sector's accounting, not P/E
everywhere:

| Sector                | Primary                              | Because                                                |
| --------------------- | ------------------------------------ | ------------------------------------------------------ |
| Banks, insurers       | P/B, P/TBV, P/E                      | balance-sheet businesses; book equity _is_ the capital |
| REITs                 | P/FFO, P/AFFO, dividend yield, P/NAV | GAAP EPS is distorted by depreciation                  |
| Energy, mining        | EV/EBITDAX, P/NAV, EV/reserves       | earnings swing with the commodity cycle                |
| Utilities, telecom    | EV/EBITDA, dividend yield            | capital-intensive and levered                          |
| Software, early-stage | EV/Sales, EV/ARR, later P/FCF        | little or no earnings yet                              |
| Retail, industrials   | P/E, EV/EBITDA                       | comparable margins, light balance sheets               |
| Airlines, lessors     | EV/EBITDAR                           | leases are financing in substance                      |

So when a P/E looks absurd, ask what the sector actually trades on before recording
it as though it were informative.

## Why trailing and forward P/E disagree

A wide gap is information, not an error:

- **Earnings inflection** — a cyclical trough makes trailing P/E huge and forward
  P/E ordinary, and the reverse at a peak. This is the most common cause.
- **One-offs** — an impairment or a legal charge inside the trailing four quarters.
- **A share-count change** — buybacks lift forward EPS on the same profit.
- **An accounting change or restatement** — a new revenue standard, a discontinued
  operation.
- **A period mismatch** — the forward figure belongs to another fiscal year, or the
  consensus simply has not been refreshed since the last print.

## Growth, and what it does to PEG

- **Which growth number?** Long-term EPS CAGR over three to five years, the
  consensus "next five years" figure, or sustainable growth (ROE × retention). They
  are different numbers, and PEG changes with the choice.
- **PEG assumes growth is linear and durable.** It rewards a high growth rate
  without asking what it costs to sustain or how long it lasts. A cyclical name at
  the peak of its cycle gets an artificially low PEG, because the growth inside it
  is peak growth.
- **Low or negative growth breaks it.** Below roughly 5% the ratio stops
  discriminating; on negative growth it is meaningless.
- **PEG 1.0 is a heuristic** from a high-rate era, not a law. It is a screen, not a
  fair value.

## Context a multiple needs

- **The rate environment.** 25x earnings on a 2% ten-year is a different proposition
  from 25x on a 5% ten-year. Earnings yield — the inverse of the P/E — is the honest
  comparison to a bond, and the gap is the equity risk premium.
- **The cycle.** Multiples on peak earnings (cyclicals) and on trough earnings
  (recoveries) both mislead: the same P/E can be cheap at a trough and expensive at
  a peak.
- **The quality of the earnings.** Organic growth, recurring revenue, low capital
  intensity and clean accounting earn a higher multiple; aggressive non-GAAP
  add-backs and a recurring stream of "one-offs" do not.
- **What the market pays for the sector.** Industry multiples live in decadal
  ranges; a multiple is only "high" against a base rate.

## How this changes what you record

The schema is unchanged — these rules decide the inputs, the nulls and the wording
of `notes`.

1. **State the period for both EPS figures**, calendar or fiscal, and never mix
   them silently.
2. **Say which earnings basis you used** — GAAP diluted or adjusted — whenever the
   two differ materially. A P/E on adjusted EPS is not the same claim as a P/E on
   GAAP.
3. **A negative or zero EPS is not a usable divisor.** Pass `0` to
   `compute_valuation_multiples` so the multiple comes back `null`, and use `notes`
   to say the earnings are negative and the P/E is therefore not meaningful. Never
   emit the negative number the division would produce: practitioners do not quote
   it, because it sorts the nonsense the wrong way round against the merely cheap.
4. **Name the reason when trailing and forward P/E diverge** — inflection, cycle,
   one-offs, buybacks, or a stale consensus.
5. **Flag the caveats you cannot act on** — heavy leverage, a large share-count
   change, a live commodity cycle — in `notes`. The downstream step decides what
   they mean; the job here is not to bury them.
6. **Do not reach for a multiple the schema does not carry.** This agent records
   price, EPS, P/E and PEG. When the sector trades on EV/EBITDA or P/NAV, the honest
   record is the P/E with its caveat, or `null` with the reason.
