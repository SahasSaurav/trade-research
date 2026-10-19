/**
 * Deterministic technical indicators, computed from an OHLCV series.
 *
 * The market agent is told to quote these values rather than derive them: an
 * LLM dividing ATR by price in its head, or eyeballing a 50-day average off a
 * chart, produces numbers that look right and are not. Everything here is pure
 * and side-effect free, so the arithmetic is testable without a network call.
 */

type Bar = {
	date: string;
	open: number | null;
	high: number | null;
	low: number | null;
	close: number | null;
	volume: number | null;
};

/** A bar with a usable close; Yahoo emits null rows for holidays and halts. */
type CleanBar = {
	date: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
};

type Level = {
	price: number;
	touches: number;
	lastTested: string;
};

type MacdReading = {
	line: number | null;
	signal: number | null;
	histogram: number | null;
};

type BollingerReading = {
	middle: number | null;
	upper: number | null;
	lower: number | null;
};

type TechnicalSnapshot = {
	bars: number;
	firstDate: string;
	lastDate: string;
	close: number;
	sma50: number | null;
	sma200: number | null;
	ema10: number | null;
	rsi14: number | null;
	atr14: number | null;
	atrPercent: number | null;
	macd: MacdReading;
	bollinger: BollingerReading;
	volumeTrend: "rising" | "falling" | "flat" | "unknown";
	averageVolume20: number | null;
	recentCloses: { date: string; close: number }[];
	supportLevels: Level[];
	resistanceLevels: Level[];
};

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

const mean = (values: number[]): number =>
	values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * A bar needs a close to be usable. High and low fall back to the close rather
 * than dropping the row, so a provider that omits them cannot silently shorten
 * the series and shift every average.
 */
function normalizeBars(bars: Bar[]): CleanBar[] {
	const clean: CleanBar[] = [];
	for (const bar of bars) {
		if (bar.close === null || !Number.isFinite(bar.close)) continue;
		const close = bar.close;
		clean.push({
			date: bar.date,
			open: bar.open ?? close,
			high: bar.high ?? close,
			low: bar.low ?? close,
			close,
			volume: bar.volume ?? 0,
		});
	}
	return clean.toSorted((a, b) => a.date.localeCompare(b.date));
}

function simpleMovingAverage(values: number[], period: number): number | null {
	if (values.length < period) return null;
	return mean(values.slice(-period));
}

/**
 * EMA seeded with the SMA of the first `period` values, then smoothed over the
 * whole series. Nulls pad the front so index i always means values[i].
 */
function exponentialMovingAverage(
	values: number[],
	period: number,
): (number | null)[] {
	const out: (number | null)[] = Array.from(
		{ length: values.length },
		() => null,
	);
	if (values.length < period) return out;

	out[period - 1] = mean(values.slice(0, period));
	const k = 2 / (period + 1);
	for (let i = period; i < values.length; i += 1) {
		const previous = out[i - 1] as number;
		out[i] = values[i] * k + previous * (1 - k);
	}
	return out;
}

/**
 * RSI(14) using Wilder's smoothing. A flat series is 50, not 100: with no
 * average gain and no average loss the ratio is undefined, and calling that
 * "overbought" would be a fabricated signal.
 */
function relativeStrengthIndex(closes: number[], period = 14): number | null {
	if (closes.length <= period) return null;

	let gains = 0;
	let losses = 0;
	for (let i = 1; i <= period; i += 1) {
		const change = closes[i] - closes[i - 1];
		if (change >= 0) gains += change;
		else losses -= change;
	}
	let averageGain = gains / period;
	let averageLoss = losses / period;

	for (let i = period + 1; i < closes.length; i += 1) {
		const change = closes[i] - closes[i - 1];
		const gain = change > 0 ? change : 0;
		const loss = change < 0 ? -change : 0;
		averageGain = (averageGain * (period - 1) + gain) / period;
		averageLoss = (averageLoss * (period - 1) + loss) / period;
	}

	if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
	return 100 - 100 / (1 + averageGain / averageLoss);
}

/** ATR(14) with Wilder's smoothing over true range. */
function averageTrueRange(bars: CleanBar[], period = 14): number | null {
	if (bars.length <= period) return null;

	const trueRanges: number[] = [];
	for (let i = 1; i < bars.length; i += 1) {
		const current = bars[i];
		const previousClose = bars[i - 1].close;
		trueRanges.push(
			Math.max(
				current.high - current.low,
				Math.abs(current.high - previousClose),
				Math.abs(current.low - previousClose),
			),
		);
	}
	if (trueRanges.length < period) return null;

	let atr = mean(trueRanges.slice(0, period));
	for (let i = period; i < trueRanges.length; i += 1) {
		atr = (atr * (period - 1) + trueRanges[i]) / period;
	}
	return atr;
}

function macd(closes: number[]): MacdReading {
	const fast = exponentialMovingAverage(closes, 12);
	const slow = exponentialMovingAverage(closes, 26);

	const line: number[] = [];
	for (let i = 0; i < closes.length; i += 1) {
		const f = fast[i];
		const s = slow[i];
		if (f === null || s === null) continue;
		line.push(f - s);
	}
	if (line.length === 0) return { line: null, signal: null, histogram: null };

	const signalSeries = exponentialMovingAverage(line, 9);
	const lineValue = line.at(-1) as number;
	const signalValue = signalSeries.at(-1) ?? null;

	return {
		line: lineValue,
		signal: signalValue,
		histogram: signalValue === null ? null : lineValue - signalValue,
	};
}

function bollingerBands(closes: number[], period = 20): BollingerReading {
	if (closes.length < period) {
		return { middle: null, upper: null, lower: null };
	}
	const window = closes.slice(-period);
	const middle = mean(window);
	// Population standard deviation: the window is the whole sample being
	// described, not a draw from a larger population.
	const variance = mean(window.map((value) => (value - middle) ** 2));
	const deviation = Math.sqrt(variance);

	return {
		middle,
		upper: middle + 2 * deviation,
		lower: middle - 2 * deviation,
	};
}

/**
 * Volume trend from two adjacent windows: the last 10 sessions against the 20
 * before them. A single spike would flip a short comparison, so the windows are
 * long enough to average one out.
 */
function volumeTrend(bars: CleanBar[]): TechnicalSnapshot["volumeTrend"] {
	if (bars.length < 20) return "unknown";
	const recent = bars.slice(-10).map((bar) => bar.volume);
	const prior = bars.slice(-30, -10).map((bar) => bar.volume);
	if (prior.length === 0) return "unknown";

	const recentMean = mean(recent);
	const priorMean = mean(prior);
	if (priorMean === 0) return "unknown";

	const change = (recentMean - priorMean) / priorMean;
	if (change > 0.1) return "rising";
	if (change < -0.1) return "falling";
	return "flat";
}

/**
 * Swing highs and lows, clustered into levels the chart actually tested.
 *
 * A swing point is a bar whose high (or low) is the extreme of a
 * `2 * span + 1` window. Highs and lows are clustered **separately**: a tested
 * ceiling and a tested floor are different claims, and pooling them would let a
 * resistance at 101 merge into a support at 99.5 once both sit inside the
 * tolerance band.
 *
 * Points within `tolerance` of each other are one level, because a support
 * tested at 101.20 and again at 101.80 is the same support, not two. A level
 * needs at least two touches to be reported.
 */
function findLevels(
	bars: CleanBar[],
	close: number,
	span = 3,
): { supportLevels: Level[]; resistanceLevels: Level[] } {
	const tolerance = close * 0.015;
	const highs: { price: number; date: string }[] = [];
	const lows: { price: number; date: string }[] = [];

	for (let i = span; i < bars.length - span; i += 1) {
		const window = bars.slice(i - span, i + span + 1);
		const bar = bars[i];
		if (bar.high >= Math.max(...window.map((b) => b.high))) {
			highs.push({ price: bar.high, date: bar.date });
		}
		if (bar.low <= Math.min(...window.map((b) => b.low))) {
			lows.push({ price: bar.low, date: bar.date });
		}
	}

	const cluster = (points: { price: number; date: string }[]): Level[] => {
		const clusters: Level[] = [];
		for (const point of points.toSorted((a, b) => a.price - b.price)) {
			const last = clusters.at(-1);
			if (last && point.price - last.price <= tolerance) {
				// Running mean keeps a cluster centred as touches accumulate.
				last.price =
					(last.price * last.touches + point.price) / (last.touches + 1);
				last.touches += 1;
				if (point.date > last.lastTested) last.lastTested = point.date;
				continue;
			}
			clusters.push({
				price: point.price,
				touches: 1,
				lastTested: point.date,
			});
		}
		return clusters.filter((level) => level.touches >= 2);
	};

	const byDistance = (a: Level, b: Level) =>
		Math.abs(a.price - close) - Math.abs(b.price - close);

	return {
		supportLevels: cluster(lows)
			.filter((level) => level.price < close)
			.toSorted(byDistance)
			.slice(0, 3),
		resistanceLevels: cluster(highs)
			.filter((level) => level.price > close)
			.toSorted(byDistance)
			.slice(0, 3),
	};
}

/**
 * Every value the market agent is allowed to quote, from one series. Null means
 * "not computable from the bars available" — never zero, never a substitute.
 */
function computeTechnicalSnapshot(bars: Bar[]): TechnicalSnapshot | null {
	const clean = normalizeBars(bars);
	if (clean.length === 0) return null;

	const closes = clean.map((bar) => bar.close);
	const close = closes.at(-1) as number;
	const atr = averageTrueRange(clean);

	return {
		bars: clean.length,
		firstDate: clean[0].date,
		lastDate: clean.at(-1)?.date ?? "",
		close,
		sma50: simpleMovingAverage(closes, 50),
		sma200: simpleMovingAverage(closes, 200),
		ema10: exponentialMovingAverage(closes, 10).at(-1) ?? null,
		rsi14: relativeStrengthIndex(closes),
		atr14: atr,
		atrPercent: atr === null || close === 0 ? null : (atr / close) * 100,
		macd: macd(closes),
		bollinger: bollingerBands(closes),
		volumeTrend: volumeTrend(clean),
		averageVolume20:
			clean.length >= 20
				? mean(clean.slice(-20).map((bar) => bar.volume))
				: null,
		recentCloses: clean.slice(-10).map((bar) => ({
			date: bar.date,
			close: bar.close,
		})),
		...findLevels(clean, close),
	};
}

export type { Bar, CleanBar, Level, TechnicalSnapshot };
export {
	computeTechnicalSnapshot,
	normalizeBars,
	relativeStrengthIndex,
	averageTrueRange,
	bollingerBands,
	exponentialMovingAverage,
	findLevels,
	macd,
	round,
	simpleMovingAverage,
	volumeTrend,
};
