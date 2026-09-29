import { computeValuationMultiples } from "@src/features/valuation/tool.js";
import { describe, expect, it } from "vitest";

type Inputs = {
	price: number;
	trailingEps: number;
	forwardEps: number;
	growthRatePercent: number;
};
type Result = {
	trailingPE: number | null;
	forwardPE: number | null;
	pegRatio: number | null;
	uncomputed: string[];
};

async function run(inputs: Partial<Inputs>): Promise<Result> {
	const response = (await computeValuationMultiples.invoke({
		price: 0,
		trailingEps: 0,
		forwardEps: 0,
		growthRatePercent: 0,
		...inputs,
	})) as Result;
	return response;
}

describe("computeValuationMultiples", () => {
	it("computes trailing and forward P/E and PEG from verified inputs", async () => {
		const result = await run({
			price: 180,
			trailingEps: 6,
			forwardEps: 6.5,
			growthRatePercent: 12,
		});

		expect(result.trailingPE).toBe(30);
		expect(result.forwardPE).toBe(27.69);
		// PEG = trailing P/E / growth percent, so 30 / 12 = 2.5
		expect(result.pegRatio).toBe(2.5);
		expect(result.uncomputed).toEqual([]);
	});

	it("uses the documented PEG convention: P/E 18 at 12% growth is 1.5", async () => {
		// Stated in the tool description the model reads. If the convention
		// changes, that description is wrong and the model is misled.
		const result = await run({
			price: 180,
			trailingEps: 10,
			forwardEps: 10,
			growthRatePercent: 12,
		});

		expect(result.trailingPE).toBe(18);
		expect(result.pegRatio).toBe(1.5);
	});

	it("rounds to two decimals", async () => {
		const result = await run({
			price: 100,
			trailingEps: 3,
			forwardEps: 3,
			growthRatePercent: 7,
		});

		expect(result.trailingPE).toBe(33.33);
		expect(result.pegRatio).toBe(4.76);
	});

	it("returns nulls and a reason when the share price is unusable", async () => {
		// 0 is the documented "could not verify" sentinel, so a model that
		// cannot source a price must not receive a confident wrong multiple.
		const result = await run({
			price: 0,
			trailingEps: 6,
			growthRatePercent: 12,
		});

		expect(result.trailingPE).toBeNull();
		expect(result.forwardPE).toBeNull();
		expect(result.pegRatio).toBeNull();
		expect(result.uncomputed).toHaveLength(1);
		expect(result.uncomputed[0]).toMatch(/share price/i);
	});

	it("treats a non-positive price as unusable", async () => {
		for (const price of [-1, -0.01]) {
			const result = await run({ price, trailingEps: 6 });
			expect(result.trailingPE, `price=${price}`).toBeNull();
		}
	});

	it("rejects NaN and Infinity at the schema boundary, not silently", async () => {
		// z.number() rejects both. This is worth pinning because the handler
		// also checks Number.isFinite, which is then unreachable for these —
		// two independent guards, and the outer one fires first.
		await expect(run({ price: Number.NaN })).rejects.toThrow(/price/);
		await expect(run({ price: Number.POSITIVE_INFINITY })).rejects.toThrow(
			/price/,
		);
		await expect(run({ growthRatePercent: Number.NaN })).rejects.toThrow(
			/growthRatePercent/,
		);
	});

	it("returns null for a multiple whose divisor is zero", async () => {
		// A genuine 0 EPS also yields an undefined P/E, so 0 as sentinel
		// distorts nothing.
		const result = await run({
			price: 180,
			trailingEps: 0,
			forwardEps: 6.5,
			growthRatePercent: 12,
		});

		expect(result.trailingPE).toBeNull();
		expect(result.forwardPE).toBe(27.69);
		expect(result.uncomputed[0]).toMatch(/trailingEPS/i);
	});

	it("reports each uncomputable multiple independently", async () => {
		const result = await run({
			price: 180,
			trailingEps: 0,
			forwardEps: 0,
			growthRatePercent: 0,
		});

		expect(result.trailingPE).toBeNull();
		expect(result.forwardPE).toBeNull();
		expect(result.pegRatio).toBeNull();
		// Two reasons, not three: PEG is derived from trailing P/E, so with
		// no trailing P/E there is nothing to divide and no separate cause.
		expect(result.uncomputed).toHaveLength(2);
		expect(result.uncomputed[0]).toMatch(/trailingEPS/i);
		expect(result.uncomputed[1]).toMatch(/forwardEPS/i);
	});

	it("reports growth and price causes separately when only price is missing", async () => {
		const result = await run({
			price: 0,
			trailingEps: 0,
			forwardEps: 0,
			growthRatePercent: 0,
		});

		// A single early return, because every multiple depends on price.
		expect(result.uncomputed).toHaveLength(1);
		expect(result.uncomputed[0]).toMatch(/share price/i);
	});

	it("omits PEG when trailing P/E is unknown, without a duplicate reason", async () => {
		// PEG is derived from trailing P/E, so there is nothing to divide.
		const result = await run({
			price: 180,
			trailingEps: 0,
			forwardEps: 6.5,
			growthRatePercent: 12,
		});

		expect(result.pegRatio).toBeNull();
		expect(result.uncomputed.some((reason) => /pegRatio/.test(reason))).toBe(
			false,
		);
	});

	it("returns null PEG for a non-positive growth rate", async () => {
		for (const growthRatePercent of [0, -5]) {
			const result = await run({
				price: 180,
				trailingEps: 6,
				forwardEps: 6.5,
				growthRatePercent,
			});
			expect(result.pegRatio, `growth=${growthRatePercent}`).toBeNull();
			expect(result.trailingPE, `growth=${growthRatePercent}`).toBe(30);
		}
	});

	it("handles a negative EPS without producing a misleading positive P/E", async () => {
		// A loss-making company has negative EPS. price / negative is negative,
		// which is arithmetically right but is not a usable P/E. The current
		// implementation returns it; this test pins the behaviour so a
		// deliberate change is visible in the diff.
		const result = await run({
			price: 20,
			trailingEps: -2,
			forwardEps: -1.5,
			growthRatePercent: 8,
		});

		expect(result.trailingPE).toBe(-10);
		expect(result.forwardPE).toBe(-13.33);
	});

	it("is deterministic across repeated calls", async () => {
		const inputs = {
			price: 137.25,
			trailingEps: 4.31,
			forwardEps: 4.8,
			growthRatePercent: 11.5,
		};

		const first = await run(inputs);
		const second = await run(inputs);

		expect(first).toEqual(second);
	});
});
