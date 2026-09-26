import { tool } from "langchain";
import { z } from "zod";

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

const isUsableDivisor = (value: number | null): value is number =>
	value !== null && Number.isFinite(value) && value !== 0;

/**
 * Deterministic valuation multiples.
 *
 * The valuation agent otherwise derives P/E and PEG in-head, where decimal
 * division drifts and the emitted figure can disagree with the EPS values the
 * same response reports. Computing here makes the multiples reproducible and
 * turns an uncomputable multiple into a null (which the schema permits) rather
 * than a confident wrong number.
 *
 * PEG follows the standard convention: trailing P/E divided by the growth rate
 * expressed in percent, so P/E 18 with 12% growth yields 1.5.
 */
const computeValuationMultiples = tool(
	({ price, trailingEps, forwardEps, growthRatePercent }) => {
		const result: {
			trailingPE: number | null;
			forwardPE: number | null;
			pegRatio: number | null;
			uncomputed: string[];
		} = {
			trailingPE: null,
			forwardPE: null,
			pegRatio: null,
			uncomputed: [],
		};

		if (price === null || !Number.isFinite(price) || price <= 0) {
			result.uncomputed.push(
				"share price missing or non-positive: trailingPE, forwardPE and pegRatio not computed",
			);
			return result;
		}

		if (isUsableDivisor(trailingEps)) {
			result.trailingPE = round(price / trailingEps);
		} else {
			result.uncomputed.push(
				"trailingEPS missing or zero: trailingPE not computed",
			);
		}

		if (isUsableDivisor(forwardEps)) {
			result.forwardPE = round(price / forwardEps);
		} else {
			result.uncomputed.push(
				"forwardEPS missing or zero: forwardPE not computed",
			);
		}

		if (result.trailingPE === null) {
			return result;
		}

		if (
			growthRatePercent === null ||
			!Number.isFinite(growthRatePercent) ||
			growthRatePercent <= 0
		) {
			result.uncomputed.push(
				"long-term growth rate missing or non-positive: pegRatio not computed",
			);
		} else {
			result.pegRatio = round(result.trailingPE / growthRatePercent);
		}

		return result;
	},
	{
		name: "compute_valuation_multiples",
		description:
			"Compute trailing P/E, forward P/E and PEG from verified inputs. Call this instead of dividing by hand. Pass null for any input you could not verify; the matching output is then null rather than an estimate. PEG uses the growth rate in percent, so P/E 18 with growth 12 gives 1.5.",
		schema: z.object({
			price: z
				.number()
				.nullable()
				.describe("Current share price in USD, or null if unverified."),
			trailingEps: z
				.number()
				.nullable()
				.describe("Trailing twelve-month diluted EPS, or null if unverified."),
			forwardEps: z
				.number()
				.nullable()
				.describe("Consensus forward diluted EPS, or null if unverified."),
			growthRatePercent: z
				.number()
				.nullable()
				.describe(
					"Consensus long-term EPS growth rate in percent, e.g. 12 for 12%. Null if unavailable.",
				),
		}),
	},
);

export { computeValuationMultiples };
