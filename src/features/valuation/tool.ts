import { tool } from "langchain";
import { z } from "zod";

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

const isUsableDivisor = (value: number | null): value is number =>
	value !== null && Number.isFinite(value) && value !== 0;

/**
 * Deterministic valuation multiples. Left to the agent, decimal division
 * drifts in-head and the emitted multiple can disagree with the EPS values in
 * the same response. Computing here also turns an uncomputable multiple into a
 * null the schema permits, rather than a confident wrong number.
 *
 * PEG follows the standard convention: trailing P/E divided by the growth rate
 * expressed in percent, so P/E 18 with 12% growth yields 1.5.
 *
 * INPUTS ARE REQUIRED NUMBERS, NOT NULLABLE FIELDS. Gemini's Schema proto
 * types `type` as a single enum, so it rejects the JSON Schema union zod emits
 * for `.nullable()` — `"type": ["number", "null"]` fails the request with
 * "Proto field is not repeating, cannot start list". `.optional()` emits a safe
 * single type, but @langchain/core throws ToolInputParsingException on a null
 * argument before any error handling, so a weaker model sending an explicit
 * null would break the run. Passing 0 for "could not verify" sidesteps both:
 * every field already treats 0 as not computable.
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

		if (!Number.isFinite(price) || price <= 0) {
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

		if (!Number.isFinite(growthRatePercent) || growthRatePercent <= 0) {
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
			"Compute trailing P/E, forward P/E and PEG from verified inputs. Call this instead of dividing by hand. All four inputs are required numbers: pass 0 for any input you could not verify, and the matching output comes back null with a reason rather than an estimate. PEG uses the growth rate in percent, so P/E 18 with growth 12 gives 1.5.",
		schema: z.object({
			price: z
				.number()
				.describe("Current share price in USD. Pass 0 if unverified."),
			trailingEps: z
				.number()
				.describe("Trailing twelve-month diluted EPS. Pass 0 if unverified."),
			forwardEps: z
				.number()
				.describe("Consensus forward diluted EPS. Pass 0 if unverified."),
			growthRatePercent: z
				.number()
				.describe(
					"Consensus long-term EPS growth rate in percent, e.g. 12 for 12%. Pass 0 if unavailable.",
				),
		}),
	},
);

export { computeValuationMultiples };
