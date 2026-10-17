import { createRequire } from "node:module";
import path from "node:path";

import { analystReportSchema } from "@src/features/analyst/schema.js";
import { debateSchema } from "@src/features/debate/schema.js";
import { decisionSchema } from "@src/features/decision/schema.js";
import { financialsSchema } from "@src/features/financials/schema.js";
import { computeValuationMultiples } from "@src/features/financials/tool.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { geopoliticalResearchSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import { newsSentimentResearchSchema } from "@src/features/sentiment/subagents/news-sentiment/schema.js";
import { summarySchema } from "@src/features/summary/schema.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Regression guard for langchainjs#11328.
 *
 * Gemini's `Schema` proto types `type` as a single enum, so it rejects a
 * union-valued `type`: "Proto field is not repeating, cannot start list."
 * `@langchain/google` rewrites these in `schemaToGeminiParameters`, for both
 * Zod and pre-converted JSON Schema input.
 *
 * The invariant worth locking down is the *output* of the converter. It is
 * invisible to tsc and to oxlint, and decisionSchema is the case that hides
 * it: Zod 4 emits `anyOf` for `.nullable()` there, and `anyOf` is a legal proto
 * field, so it passes under a broken converter alike. financialsSchema is the
 * one that discriminates — which is why all eight schemas are checked.
 */

type JsonSchemaNode = {
	type?: unknown;
	[key: string]: unknown;
};

const require_ = createRequire(import.meta.url);

/**
 * `schemaToGeminiParameters` is internal to `@langchain/google` and not
 * re-exported. Resolving it by absolute path is deliberate: if the package
 * moves the file, this suite fails loudly instead of silently skipping the
 * guard.
 */
function loadGeminiConverter(): {
	schemaToGeminiParameters: (schema: unknown) => JsonSchemaNode;
} {
	const packageJson = require_.resolve("@langchain/google/package.json");
	const candidates = [
		path.join(path.dirname(packageJson), "dist/converters/tools.cjs"),
		path.join(path.dirname(packageJson), "dist/converters/tools.js"),
	];
	for (const candidate of candidates) {
		let mod: { schemaToGeminiParameters?: unknown };
		try {
			mod = require_(candidate) as { schemaToGeminiParameters?: unknown };
		} catch {
			continue;
		}
		const fn = mod.schemaToGeminiParameters;
		if (typeof fn === "function") {
			return { schemaToGeminiParameters: fn as (s: unknown) => JsonSchemaNode };
		}
	}
	throw new Error(
		"Could not load schemaToGeminiParameters from @langchain/google. " +
			"If the package reorganised its dist layout, update this guard; " +
			"do not delete it, because the Gemini nullable bug it protects " +
			"against returns as a hard 400 at runtime.",
	);
}

const { schemaToGeminiParameters } = loadGeminiConverter();

/** Collect every path whose `type` is an array, which Gemini cannot represent. */
function findArrayValuedTypes(node: unknown, at = "$"): string[] {
	if (Array.isArray(node)) {
		return node.flatMap((child, i) =>
			findArrayValuedTypes(child, `${at}[${i}]`),
		);
	}
	if (typeof node !== "object" || node === null) return [];

	const record = node as JsonSchemaNode;
	const found = Array.isArray(record.type)
		? [`${at}.type = ${JSON.stringify(record.type)}`]
		: [];
	return Object.entries(record).reduce<string[]>(
		(acc, [key, value]) =>
			acc.concat(findArrayValuedTypes(value, `${at}.${key}`)),
		found,
	);
}

const agentSchemas = [
	["financialsSchema", financialsSchema],
	["analystReportSchema", analystReportSchema],
	["decisionSchema", decisionSchema],
	["summarySchema", summarySchema],
	["sentimentSchema", sentimentSchema],
	["debateSchema", debateSchema],
	["geopoliticalResearchSchema", geopoliticalResearchSchema],
	["newsSentimentResearchSchema", newsSentimentResearchSchema],
] as const;

describe("Gemini schema compatibility", () => {
	it.each(agentSchemas)(
		"%s emits no array-valued `type` (Gemini proto has no repeated field)",
		(_name, schema) => {
			const parameters = schemaToGeminiParameters(schema);
			expect(findArrayValuedTypes(parameters)).toEqual([]);
		},
	);

	// The tool input schema travels the same path as the response schemas: it
	// is converted and sent inside the same `tools` payload, so the same proto
	// restriction applies.
	it("compute_valuation_multiples emits a convertible, Gemini-legal schema", () => {
		const parameters = schemaToGeminiParameters(
			// The tool object, not the response schema: the converter branches
			// on whether it is handed a zod schema or plain JSON Schema.
			(computeValuationMultiples as unknown as { schema: unknown }).schema,
		);

		expect(findArrayValuedTypes(parameters)).toEqual([]);

		const properties = parameters.properties as Record<string, JsonSchemaNode>;
		for (const field of [
			"price",
			"trailingEps",
			"forwardEps",
			"growthRatePercent",
		]) {
			// Single string type, not a union, and not nullable: the tool takes
			// required numbers and treats 0 as "could not verify".
			expect(properties[field]?.type, field).toBe("number");
			expect(properties[field]?.nullable, field).toBeUndefined();
		}
	});

	it("renders .nullable() as { type, nullable: true }, not a union", () => {
		const parameters = schemaToGeminiParameters(financialsSchema);
		const properties = parameters.properties as Record<string, JsonSchemaNode>;

		// financialsSchema is the discriminating case: @langchain/core's
		// toJsonSchema alone emits ["number","null"] for all five of these.
		for (const field of [
			"trailingEPS",
			"forwardEPS",
			"trailingPE",
			"forwardPE",
			"pegRatio",
		]) {
			expect(properties[field]?.type, field).toBe("number");
			expect(properties[field]?.nullable, field).toBe(true);
		}
	});

	it("strips keywords Gemini rejects", () => {
		const parameters = schemaToGeminiParameters(decisionSchema);
		const found: string[] = [];

		const walk = (node: unknown): void => {
			if (Array.isArray(node)) {
				node.forEach(walk);
				return;
			}
			if (typeof node !== "object" || node === null) return;
			for (const [key, value] of Object.entries(node as JsonSchemaNode)) {
				if (
					key === "additionalProperties" ||
					key === "$schema" ||
					key === "$ref"
				) {
					found.push(key);
				}
				walk(value);
			}
		};

		walk(parameters);
		expect(found).toEqual([]);
	});

	it("keeps numeric bounds that hand-written schemas had dropped", () => {
		// decisionSchema declares .min(-1).max(1) on sentimentScore. Verify the
		// bound survives to the wire.
		const parameters = schemaToGeminiParameters(decisionSchema);
		const properties = parameters.properties as Record<string, JsonSchemaNode>;
		const anyOf = properties.sentimentScore?.anyOf as
			| JsonSchemaNode[]
			| undefined;
		const numeric = anyOf?.find((entry) => entry.type === "number");

		expect(numeric?.minimum).toBe(-1);
		expect(numeric?.maximum).toBe(1);
	});

	it("sanitises pre-converted JSON Schema identically to a Zod schema", () => {
		// Guards a claim that is easy to get backwards: the Zod/JSON-Schema
		// ternary in schemaToGeminiParameters only chooses how to *obtain* the
		// JSON Schema. Sanitisation then runs on both forms, so raw JSON Schema
		// is not forwarded verbatim.
		const preConverted = z.toJSONSchema(financialsSchema);

		// The raw form does contain the fatal union...
		expect(findArrayValuedTypes(preConverted)).toContain(
			'$.properties.trailingEPS.type = ["number","null"]',
		);
		// ...and this package rewrites it either way.
		expect(
			findArrayValuedTypes(schemaToGeminiParameters(preConverted)),
		).toEqual([]);
		expect(schemaToGeminiParameters(preConverted)).toEqual(
			schemaToGeminiParameters(financialsSchema),
		);
	});
});

describe("schema constraints", () => {
	it("rejects a sentimentScore outside [-1, 1]", () => {
		const base = {
			recommendation: "buy",
			valuationAssessment: "undervalued",
			fairValueEstimate: 100,
			fairValueMethod: "DCF",
			entryPriceRange: { min: 90, max: 95, rationale: "r" },
			priceTriggers: [],
			executionPlan: {
				entryPrice: 92,
				stopLoss: 88,
				takeProfit: 130,
				positionSizing: "4%",
				rationale: "r",
			},
			sentimentAssessment: "positive",
			geopoliticalRisk: "low",
			geopoliticalFactors: [],
			keyRisks: [],
			keyUncertainties: [],
			dataDates: {
				financials: "2026-01-01",
				analyst: "2026-01-01",
				sentiment: "2026-01-01",
			},
			sourceUrls: ["https://example.com"],
			disclaimer: "d",
		};

		expect(
			decisionSchema.safeParse({ ...base, sentimentScore: 1 }).success,
		).toBe(true);
		expect(
			decisionSchema.safeParse({ ...base, sentimentScore: -1 }).success,
		).toBe(true);
		expect(
			decisionSchema.safeParse({ ...base, sentimentScore: null }).success,
		).toBe(true);
		expect(
			decisionSchema.safeParse({ ...base, sentimentScore: 1.5 }).success,
		).toBe(false);
		expect(
			decisionSchema.safeParse({ ...base, sentimentScore: -2 }).success,
		).toBe(false);
	});

	it("rejects sourceUrls that are not URLs in decision output", () => {
		const result = decisionSchema.safeParse({
			recommendation: "hold",
			valuationAssessment: "fairly_valued",
			fairValueEstimate: 1,
			fairValueMethod: "m",
			entryPriceRange: { min: 0, max: 0, rationale: "r" },
			priceTriggers: [],
			executionPlan: {
				entryPrice: null,
				stopLoss: null,
				takeProfit: null,
				positionSizing: null,
				rationale: "r",
			},
			sentimentAssessment: "unknown",
			geopoliticalRisk: "unknown",
			geopoliticalFactors: [],
			keyRisks: [],
			keyUncertainties: [],
			dataDates: { financials: "", analyst: "", sentiment: "" },
			sourceUrls: ["not-a-url"],
			disclaimer: "d",
		});

		expect(result.success).toBe(false);
	});

	it("keeps stop-loss out of the price triggers", () => {
		// priceTriggers carries the valuation/catalyst buy and sell thresholds
		// only; the concrete execution levels (stop-loss, take-profit, sizing)
		// live in executionPlan. If the trigger enum widened to accept
		// stop_loss, the same stop could be expressed two ways.
		const base = {
			recommendation: "buy",
			valuationAssessment: "undervalued",
			fairValueEstimate: 100,
			fairValueMethod: "DCF",
			entryPriceRange: { min: 90, max: 95, rationale: "r" },
			executionPlan: {
				entryPrice: 92,
				stopLoss: 88,
				takeProfit: 130,
				positionSizing: "4%",
				rationale: "r",
			},
			sentimentAssessment: "positive",
			sentimentScore: null,
			geopoliticalRisk: "low",
			geopoliticalFactors: [],
			keyRisks: [],
			keyUncertainties: [],
			dataDates: {
				financials: "2026-01-01",
				analyst: "2026-01-01",
				sentiment: "2026-01-01",
			},
			sourceUrls: ["https://example.com"],
			disclaimer: "d",
		};

		expect(
			decisionSchema.safeParse({
				...base,
				priceTriggers: [
					{ triggerType: "buy", price: 92, explanation: "e" },
					{ triggerType: "sell", price: 130, explanation: "e" },
				],
			}).success,
		).toBe(true);
		expect(
			decisionSchema.safeParse({
				...base,
				priceTriggers: [
					{ triggerType: "stop_loss", price: 88, explanation: "e" },
				],
			}).success,
		).toBe(false);
	});
});
