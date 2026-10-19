import {
	averageTrueRange,
	bollingerBands,
	computeTechnicalSnapshot,
	exponentialMovingAverage,
	findLevels,
	normalizeBars,
	relativeStrengthIndex,
	volumeTrend,
} from "@src/utils/indicators.js";
import { describe, expect, it } from "vitest";

/**
 * The indicators are the source of truth the market agent quotes, so the
 * arithmetic is pinned here rather than trusted. Every case is a pure function
 * over synthetic bars — no network, no model.
 */

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 2);

/** A flat series, one bar per day, with a fixed close. */
function flatBars(count: number, close = 100) {
	return Array.from({ length: count }, (_, i) => ({
		date: new Date(START + i * DAY).toISOString().slice(0, 10),
		open: close,
		high: close + 1,
		low: close - 1,
		close,
		volume: 1_000_000,
	}));
}

/** A series that rises by `step` per bar from `start`. */
function rampBars(count: number, start = 100, step = 1) {
	return Array.from({ length: count }, (_, i) => {
		const close = start + i * step;
		return {
			date: new Date(START + i * DAY).toISOString().slice(0, 10),
			open: close,
			high: close + 1,
			low: close - 1,
			close,
			volume: 1_000_000,
		};
	});
}

/** A rising close series, one bar per step. */
function rampCloses(count: number, start = 100, step = 1) {
	return Array.from({ length: count }, (_, i) => start + i * step);
}

/** Bars with a symmetric high/low offset around each close. */
function barsFrom(closes: number[], offset = 0.3) {
	return closes.map((close, i) => ({
		date: new Date(START + i * DAY).toISOString().slice(0, 10),
		open: close,
		high: close + offset,
		low: close - offset,
		close,
		volume: 1_000_000,
	}));
}

/** Bars whose only moving part is volume. */
function withVolumes(volumes: number[]) {
	return volumes.map((volume, i) => ({
		date: new Date(START + i * DAY).toISOString().slice(0, 10),
		open: 100,
		high: 101,
		low: 99,
		close: 100,
		volume,
	}));
}

describe("normalizeBars", () => {
	it("drops rows without a close and sorts by date", () => {
		const bars = [
			{ date: "2026-01-03", open: 3, high: 4, low: 2, close: 3, volume: 1 },
			{ date: "2026-01-01", open: 1, high: 2, low: 0, close: 1, volume: 1 },
			{
				date: "2026-01-02",
				open: null,
				high: null,
				low: null,
				close: null,
				volume: null,
			},
		];

		const clean = normalizeBars(bars);

		expect(clean.map((bar) => bar.date)).toEqual(["2026-01-01", "2026-01-03"]);
	});

	it("falls back to the close when high or low is missing", () => {
		// A provider that omits the range must not shorten the series and shift
		// every average computed from it.
		const [bar] = normalizeBars([
			{
				date: "2026-01-01",
				open: null,
				high: null,
				low: null,
				close: 10,
				volume: null,
			},
		]);

		expect(bar).toEqual({
			date: "2026-01-01",
			open: 10,
			high: 10,
			low: 10,
			close: 10,
			volume: 0,
		});
	});
});

describe("relativeStrengthIndex", () => {
	it("returns 100 for a series that only rises", () => {
		expect(relativeStrengthIndex(rampBars(30).map((bar) => bar.close))).toBe(
			100,
		);
	});

	it("returns 0 for a series that only falls", () => {
		const closes = rampBars(30, 200, -2).map((bar) => bar.close);
		expect(relativeStrengthIndex(closes)).toBe(0);
	});

	it("returns 50 for a flat series rather than claiming overbought", () => {
		// No gains and no losses makes the ratio undefined. Calling that 100
		// would put a fabricated overbought signal in the artifact.
		const closes = flatBars(30).map((bar) => bar.close);
		expect(relativeStrengthIndex(closes)).toBe(50);
	});

	it("returns null when there are not enough closes", () => {
		expect(relativeStrengthIndex([1, 2, 3])).toBeNull();
	});
});

describe("averageTrueRange", () => {
	it("equals the fixed true range of a flat series", () => {
		// Every bar has high 101 / low 99 and the previous close is 100, so
		// true range is 2 on every bar.
		expect(averageTrueRange(flatBars(30))).toBeCloseTo(2, 6);
	});

	it("returns null below the lookback", () => {
		expect(averageTrueRange(flatBars(10))).toBeNull();
	});
});

describe("exponentialMovingAverage", () => {
	it("seeds on the SMA and stays null before it", () => {
		const ema = exponentialMovingAverage([1, 2, 3, 4, 5], 3);

		expect(ema.slice(0, 2)).toEqual([null, null]);
		expect(ema[2]).toBeCloseTo(2, 6);
		// k = 2 / 4 = 0.5, so 4 * 0.5 + 2 * 0.5 = 3
		expect(ema[3]).toBeCloseTo(3, 6);
	});

	it("returns all nulls when the series is shorter than the period", () => {
		expect(exponentialMovingAverage([1, 2], 5)).toEqual([null, null]);
	});
});

describe("bollingerBands", () => {
	it("puts a flat series' bands on the price", () => {
		const bands = bollingerBands(flatBars(25).map((bar) => bar.close));
		expect(bands).toEqual({ middle: 100, upper: 100, lower: 100 });
	});

	it("returns nulls when there are fewer than 20 closes", () => {
		expect(bollingerBands([1, 2, 3])).toEqual({
			middle: null,
			upper: null,
			lower: null,
		});
	});
});

describe("volumeTrend", () => {
	it("reports rising when the last 10 sessions run above the prior 20", () => {
		const bars = withVolumes([
			...Array.from({ length: 20 }, () => 1_000_000),
			...Array.from({ length: 10 }, () => 2_000_000),
		]);
		expect(volumeTrend(bars)).toBe("rising");
	});

	it("reports falling when the last 10 sessions run below the prior 20", () => {
		const bars = withVolumes([
			...Array.from({ length: 20 }, () => 2_000_000),
			...Array.from({ length: 10 }, () => 1_000_000),
		]);
		expect(volumeTrend(bars)).toBe("falling");
	});

	it("reports flat inside the 10% band", () => {
		const bars = withVolumes([
			...Array.from({ length: 20 }, () => 1_000_000),
			...Array.from({ length: 10 }, () => 1_050_000),
		]);
		expect(volumeTrend(bars)).toBe("flat");
	});

	it("reports unknown with too little history", () => {
		expect(volumeTrend(withVolumes([1, 2, 3]))).toBe("unknown");
	});
});

describe("findLevels", () => {
	it("clusters a swing low tested twice into one support level", () => {
		// A strict ramp has no swing points of its own — every low sits above
		// the bars before it and every high below the bars after it — so the
		// dips poked into it are the only levels a test can observe.
		const closes = rampCloses(30);
		closes[6] = 95;
		closes[20] = 95;

		const { supportLevels } = findLevels(barsFrom(closes), 129);

		expect(supportLevels).toHaveLength(1);
		expect(supportLevels[0].touches).toBe(2);
		expect(supportLevels[0].price).toBeCloseTo(94.7, 5);
	});

	it("keeps tested highs out of the support list", () => {
		// The bug this guards: clustering highs and lows together let a
		// resistance merge into a support once both sat inside the tolerance.
		// A ceiling at 101.2 and a floor at 99.8 sit 1.4 apart — inside the
		// 1.5% band — so pooling them would fuse one phantom level.
		const closes = Array.from({ length: 12 }, (_, i) => (i % 2 ? 101 : 100));

		const { supportLevels, resistanceLevels } = findLevels(
			barsFrom(closes, 0.2),
			100,
		);

		expect(supportLevels.map((level) => level.price)).toEqual([99.8]);
		expect(resistanceLevels.map((level) => level.price)).toEqual([101.2]);
	});

	it("drops a level the chart tested only once", () => {
		const closes = rampCloses(30);
		closes[6] = 95;

		expect(findLevels(barsFrom(closes), 129).supportLevels).toEqual([]);
	});
});

describe("computeTechnicalSnapshot", () => {
	it("returns null when no bar has a usable close", () => {
		expect(
			computeTechnicalSnapshot([
				{
					date: "2026-01-01",
					open: null,
					high: null,
					low: null,
					close: null,
					volume: null,
				},
			]),
		).toBeNull();
	});

	it("leaves a 200-day average null when there is not enough history", () => {
		// The failure this guards: a lookback that returns fewer bars than the
		// agent expects silently blanks SMA(200), and a 0 would be worse.
		const snapshot = computeTechnicalSnapshot(flatBars(60));

		expect(snapshot?.sma50).toBe(100);
		expect(snapshot?.sma200).toBeNull();
		expect(snapshot?.bars).toBe(60);
	});

	it("computes ATR percent against the last close", () => {
		const snapshot = computeTechnicalSnapshot(flatBars(30));

		expect(snapshot?.atr14).toBeCloseTo(2, 6);
		expect(snapshot?.atrPercent).toBeCloseTo(2, 6);
	});

	it("reports the first and last bar dates", () => {
		const snapshot = computeTechnicalSnapshot(flatBars(5));

		expect(snapshot?.firstDate).toBe("2026-01-02");
		expect(snapshot?.lastDate).toBe("2026-01-06");
		expect(snapshot?.close).toBe(100);
	});
});
