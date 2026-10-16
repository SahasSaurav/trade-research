import { validateArtifacts } from "@src/features/validation/validate.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const goodValuation = {
	ticker: "AAPL",
	dateChecked: TODAY,
	trailingEPS: 6.1,
	forwardEPS: 6.8,
	trailingPE: 29.5,
	forwardPE: 26.4,
	pegRatio: 2.1,
	sourceUrls: ["https://example.com/10-k"],
};

function goodReport(overrides: Record<string, unknown> = {}) {
	return {
		firm: "Goldman Sachs",
		reportTitle: "Initiation",
		rating: "Buy",
		priceTarget: 250,
		reportDate: TODAY,
		sourceUrl: "https://example.com/gs",
		summary: "s",
		...overrides,
	};
}

const goodAnalyst = {
	ticker: "AAPL",
	dateChecked: TODAY,
	reports: [goodReport()],
};

function goodSentiment(overrides: Record<string, unknown> = {}) {
	return {
		ticker: "AAPL",
		dateChecked: TODAY,
		overallSentiment: "neutral",
		sentimentScore: 0.1,
		newsSentimentSources: [],
		newsSentimentSummary: null,
		geopoliticalRisks: [],
		geopoliticalSummary: null,
		sourceUrls: ["https://example.com/news"],
		researchStatus: { news: "complete", geopolitical: "complete" },
		...overrides,
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe("validateArtifacts", () => {
	it("passes when every artifact is well formed", () => {
		const result = validateArtifacts(
			goodValuation,
			goodAnalyst,
			goodSentiment(),
		);

		expect(result).toEqual({
			pass: true,
			issues: [],
			analystIssues: [],
			valuationIssues: [],
			sentimentIssues: [],
		});
	});

	it("separates issues by artifact so a failing node can be retried", () => {
		// graph.ts routes on validation.analystIssues specifically, sending
		// only the analyst back for repair. A merged list would make every
		// failure look analyst-shaped.
		const result = validateArtifacts(
			{ ...goodValuation, sourceUrls: [] },
			{ ...goodAnalyst, reports: [] },
			goodSentiment(),
		);

		expect(result.pass).toBe(false);
		expect(result.valuationIssues).toHaveLength(1);
		expect(result.analystIssues).toHaveLength(1);
		expect(result.sentimentIssues).toHaveLength(0);
		expect(result.issues).toHaveLength(2);
	});

	describe("valuation", () => {
		it("rejects data that does not match the schema", () => {
			const result = validateArtifacts(
				{ ticker: "AAPL" },
				goodAnalyst,
				goodSentiment(),
			);

			expect(result.valuationIssues[0]).toMatch(/fails schema/i);
			// One issue, not one per missing field: it short-circuits.
			expect(result.valuationIssues).toHaveLength(1);
		});

		it("flags a missing sourceUrls array", () => {
			const result = validateArtifacts(
				{ ...goodValuation, sourceUrls: [] },
				goodAnalyst,
				goodSentiment(),
			);

			expect(result.valuationIssues[0]).toMatch(/no sourceUrls/i);
		});

		it("accepts null multiples, since those mean 'could not verify'", () => {
			const result = validateArtifacts(
				{
					...goodValuation,
					trailingPE: null,
					forwardPE: null,
					pegRatio: null,
					trailingEPS: null,
					forwardEPS: null,
				},
				goodAnalyst,
				goodSentiment(),
			);

			expect(result.pass).toBe(true);
		});
	});

	describe("analyst", () => {
		it("flags an empty report list", () => {
			const result = validateArtifacts(
				goodValuation,
				{ ...goodAnalyst, reports: [] },
				goodSentiment(),
			);

			expect(result.analystIssues[0]).toMatch(/no analyst reports/i);
		});

		it("flags duplicate firms", () => {
			// The same analyst twice means the agent searched twice rather
			// than broadening coverage, so the consensus is not independent.
			const result = validateArtifacts(
				goodValuation,
				{
					...goodAnalyst,
					reports: [goodReport(), goodReport({ reportTitle: "Update" })],
				},
				goodSentiment(),
			);

			expect(result.analystIssues[0]).toMatch(/duplicate firms/i);
		});

		it("flags a report with no sourceUrl", () => {
			const result = validateArtifacts(
				goodValuation,
				{ ...goodAnalyst, reports: [goodReport({ sourceUrl: "" })] },
				goodSentiment(),
			);

			expect(result.analystIssues[0]).toMatch(/no sourceUrl/i);
		});

		it("flags a report with no rating", () => {
			const result = validateArtifacts(
				goodValuation,
				{ ...goodAnalyst, reports: [goodReport({ rating: "" })] },
				goodSentiment(),
			);

			expect(result.analystIssues[0]).toMatch(/no rating/i);
		});

		it("collects every per-report problem, not just the first", () => {
			const result = validateArtifacts(
				goodValuation,
				{
					...goodAnalyst,
					reports: [
						goodReport({ firm: "A", sourceUrl: "", rating: "" }),
						goodReport({ firm: "B", sourceUrl: "", rating: "Buy" }),
					],
				},
				goodSentiment(),
			);

			expect(result.analystIssues).toHaveLength(3);
		});
	});

	describe("sentiment", () => {
		it("flags data older than fourteen days", () => {
			const result = validateArtifacts(
				goodValuation,
				goodAnalyst,
				goodSentiment({ dateChecked: daysAgo(15) }),
			);

			expect(result.sentimentIssues[0]).toMatch(/stale/i);
		});

		it("accepts data exactly at the fourteen day boundary", () => {
			const result = validateArtifacts(
				goodValuation,
				goodAnalyst,
				goodSentiment({ dateChecked: daysAgo(13) }),
			);

			expect(result.sentimentIssues).toEqual([]);
		});

		it("does not flag an unparseable dateChecked", () => {
			// Documented gap, not an endorsement. `dateChecked` is typed
			// `z.string()`, so "not a date" parses; new Date(...).getTime() is
			// then NaN and `NaN > threshold` is false, so a garbage date reads
			// as fresh. Tightening this means z.iso.date() on dateChecked across
			// the schemas, which would also reject the model's free-form dates.
			const result = validateArtifacts(
				goodValuation,
				goodAnalyst,
				goodSentiment({ dateChecked: "not a date" }),
			);

			expect(result.sentimentIssues).toEqual([]);
			expect(result.pass).toBe(true);
		});

		it("accepts a failed subagent as long as the shape is valid", () => {
			// Partial research is a designed outcome: researchStatus records
			// which half failed, and the merge node already fell back.
			const result = validateArtifacts(
				goodValuation,
				goodAnalyst,
				goodSentiment({
					researchStatus: { news: "complete", geopolitical: "failed" },
					geopoliticalRisks: [],
					geopoliticalSummary: null,
				}),
			);

			expect(result.pass).toBe(true);
		});
	});

	it("treats all three artifacts missing as a failure", () => {
		const result = validateArtifacts(undefined, undefined, undefined);

		expect(result.pass).toBe(false);
		expect(result.issues).toHaveLength(3);
	});
});
