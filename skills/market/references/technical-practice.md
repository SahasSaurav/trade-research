# Technical practice

How technicals are actually used, and the traps in reading them. Companion to
[`reference.md`](reference.md).

## Trend-following vs mean-reversion

Most technical reads fall into two camps, and they read the _same_ indicators oppositely:

- **Trend-following** — buy strength, sell weakness. A high RSI is confirmation, not a warning;
  price above a rising 50 SMA is the entry filter. Stops go below structure, sized off ATR.
- **Mean-reversion** — fade extremes. A high RSI into resistance is a sell; a low RSI into support
  is a buy. This fails badly in a strong trend, where RSI can stay extreme for weeks.

The skill asks you to state which regime the chart is in; a signal is only meaningful relative to
it. "RSI 72" means _extended_ in a range and _strong_ in a trend.

## Why a level matters

A support or resistance is not magic — it is a place where supply and demand previously flipped.
It matters more when:

- it was **tested more than once** (more orders rested there),
- it is **confluent** — a round number, a moving average, a prior high/low, a gap edge,
- it is **recent** — levels decay; a line from three years ago is history, not structure.

A level nobody has tested in a year is a guess dressed as analysis.

## False signals

- **Whipsaw** — in a sideways tape, moving-average and MACD crossovers fire constantly and lose
  money. Flat averages are the tell.
- **Divergence is a warning, not a trigger** — momentum diverging from price can persist for a long
  time before it resolves.
- **Volume validates** — a breakout on thin volume is suspect; the same breakout on expanding volume
  is confirmed.
- **The band ride** — in a strong trend price can close above the upper Bollinger band for days;
  that is strength, not a sell signal.

## ATR drives stop and size

ATR is the honest volatility unit:

- A **stop** placed closer than ~1×ATR is likely to be hit by noise rather than by a thesis change.
- A **position size** that ignores ATR takes more risk in a volatile name than a calm one at the
  same dollar exposure. Size = risk budget ÷ (ATR × point value).
- Report `atrPercent` so a reader can compare volatility across instruments.

Do not state a stop, a target or a "dollar move" that ATR cannot support.

## What to hand downstream

The downstream decision agent needs **levels and posture**, not prose:

- the trend and its strength,
- the nearest support and resistance as absolute prices,
- ATR so stops and sizing can be grounded,
- the momentum read and whether it is confirming or diverging.

Leave the buy/hold/avoid call to the agent whose job it is; you describe the chart.
