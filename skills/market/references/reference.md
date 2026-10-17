# Technical reference

Deep tables for the `market` skill: the indicator catalogue, the source hierarchy, the source
reconciliation rules and the level conventions. [`SKILL.md`](../SKILL.md) points here; read only
the table you need.

## Indicator catalogue

Select a small, complementary set. Each indicator answers one question; redundancy adds noise.

### Moving averages (trend)

| Indicator       | What it is                        | Read it for                                   | It does **not** say                    |
| --------------- | --------------------------------- | --------------------------------------------- | -------------------------------------- |
| `close_50_sma`  | 50-day simple moving average      | Medium-term trend; dynamic support/resistance | Turns fast — lags price                |
| `close_200_sma` | 200-day simple moving average     | Long-term benchmark; golden/death cross       | Reacts slowly; strategic, not tactical |
| `close_10_ema`  | 10-day exponential moving average | Short-term momentum shifts, early entries     | Noisy in chop; filter with longer MAs  |

### MACD (momentum)

| Indicator | What it is                       | Read it for                                | It does **not** say                      |
| --------- | -------------------------------- | ------------------------------------------ | ---------------------------------------- |
| `macd`    | Difference of two EMAs           | Crossovers, divergence signalling reversal | Reliable in low-volatility/sideways tape |
| `macds`   | EMA smoothing of the MACD line   | Signal-line crossovers                     | Standalone buy/sell — confirm first      |
| `macdh`   | Gap between MACD line and signal | Momentum strength, early divergence        | Stable — volatile in fast markets        |

### RSI (momentum)

| Indicator | What it is                   | Read it for                                 | It does **not** say                           |
| --------- | ---------------------------- | ------------------------------------------- | --------------------------------------------- |
| `rsi`     | Relative strength index (14) | Overbought/oversold (>70 / <30), divergence | That an extreme reverses — trends can persist |

### Bollinger Bands (volatility)

| Indicator | What it is                    | Read it for                           | It does **not** say                |
| --------- | ----------------------------- | ------------------------------------- | ---------------------------------- |
| `boll`    | 20-day SMA (band basis)       | Dynamic benchmark for price           | A breakout on its own              |
| `boll_ub` | Upper band (~2σ above middle) | Overbought conditions, breakout zones | That price must fall — it can ride |
| `boll_lb` | Lower band (~2σ below middle) | Oversold conditions, breakdown zones  | That price must rise               |

### ATR (volatility / risk)

| Indicator | What it is              | Read it for                                       | It does **not** say              |
| --------- | ----------------------- | ------------------------------------------------- | -------------------------------- |
| `atr`     | Average true range (14) | Stop distance, position sizing, volatility regime | Direction — ATR is directionless |

### Volume

| Indicator | What it is                         | Read it for                                | It does **not** say            |
| --------- | ---------------------------------- | ------------------------------------------ | ------------------------------ |
| `vwma`    | Volume-weighted moving average     | Confirming trend with participation        | Reliable through volume spikes |
| —         | Volume trend (rising/flat/falling) | Whether a move has participation behind it | —                              |

## Source hierarchy

| Priority | Source                                    | Trust for                       |
| -------- | ----------------------------------------- | ------------------------------- |
| 1        | Exchange / official quote                 | Last close and session date     |
| 2        | Yahoo Finance / StockAnalysis / Investing | Indicator values, OHLCV history |
| 3        | Broker chart pages                        | Cross-check of one level        |

Prefer a source that states **as of** date and the indicator's parameters (e.g. "RSI(14)").

## Reconciliation

| Difference on price | Action                                            |
| ------------------- | ------------------------------------------------- |
| ≤1%                 | Use the average                                   |
| >1%                 | Flag the conflict in `notes`, use the more recent |

For an indicator, two sources agreeing within one unit of its scale is agreement; a wider gap is a
conflict to flag, not to average.

## Level conventions

- **Support** = a level where buying previously reversed a decline (swing low).
- **Resistance** = a level where selling previously reversed a rally (swing high).
- A level is meaningful when it is **tested**, **confluent** (round number, moving average, prior
  high/low) or **recent**.
- Report absolute prices; a "level" expressed only as a percentage is not actionable.
- The 50/200 SMA are dynamic levels and often act as support/resistance — say so when they do.
