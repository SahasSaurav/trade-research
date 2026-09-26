import {
	renderInline,
	renderReport,
	renderSummary,
	stripAnsi,
} from "@src/report/render.js";
import { describe, expect, it } from "vitest";

/**
 * The report is markdown produced by a model, so the renderer is doing real
 * work: wrapping, column alignment and list handling. These pin the layout
 * decisions that are easy to break silently — a blank line between "1." and
 * "2." looks like a formatting nit on screen but means the model output was
 * mangled.
 *
 * Colour is off under the test runner (stdout is not a TTY), which is what
 * makes the plain-text assertions below possible.
 */

const decision = {
	recommendation: "avoid",
	valuationAssessment: "overvalued",
	fairValueEstimate: 280,
	fairValueMethod: "32x forward P/E",
	entryPriceRange: { min: 225, max: 265, rationale: "margin of safety" },
	priceTriggers: [
		{ triggerType: "buy", price: 245, explanation: "15-20% below fair value" },
	],
	sentimentAssessment: "positive",
	geopoliticalRisk: "high",
	keyRisks: ["Multiple compression toward 28-30x implies 20-25% downside."],
	keyUncertainties: ["Apple Intelligence monetization timeline."],
	disclaimer: "Not personalised financial advice.",
};

const summary = `**RECOMMENDATION: AVOID**
Fair value $280.00 vs. price $341.10 -> **-17.9%**.

**Key data**
Price: $341.10
Trailing EPS: $8.72
Forward EPS: $8.83

**Risks & catalysts**
Risks to thesis:
1. Apple Intelligence monetization slips.
2. China revenue decelerates.

**Bottom line**
Avoid on a 38.63x forward P/E.`;

describe("renderInline", () => {
	it("wraps without exceeding the requested width", () => {
		const lines = renderInline("word ".repeat(40).trim(), 30, false);

		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(30);
		}
	});

	it("preserves runs of spaces so column padding survives wrapping", () => {
		// renderInline normalises nothing: a run of spaces is the mechanism the
		// report uses to align columns, so collapsing it to one space would
		// silently undo every table in the output.
		const [line] = renderInline("Label:      $8.72", 80, false);

		expect(line).toBe("Label:      $8.72");
	});

	it("drops leading whitespace introduced by a wrap", () => {
		const lines = renderInline("aaaa bbbb cccc dddd", 10, false);

		for (const line of lines) {
			expect(line).toBe(line.trimStart());
		}
	});

	it("does not split a word to fit", () => {
		const lines = renderInline(
			"short averyveryverylongsingleword end",
			12,
			false,
		);

		expect(lines).toEqual(["short", "averyveryverylongsingleword", "end"]);
	});

	it("emits no escape codes when colour is off", () => {
		const [line] = renderInline("plain **bold** text", 80, false);

		expect(line).toBe("plain bold text");
	});

	it("emits escape codes when colour is on", () => {
		const [line] = renderInline("**bold**", 80, true);

		expect(line).toContain("bold");
		expect(stripAnsi(line)).toBe("bold");
		expect(line.length).toBeGreaterThan("bold".length);
	});
});

describe("renderSummary", () => {
	it("aligns consecutive key/value lines into one column", () => {
		const lines = renderSummary(
			"**Key data**\nPrice: $341.10\nTrailing EPS: $8.72\nForward EPS: $8.83",
			{ color: false },
		);

		// Every value in the block must start at the same column; that is the
		// whole point of collecting the run instead of wrapping each line.
		const valueOffsets = lines
			.filter((line) => line.includes("$"))
			.map((line) => line.indexOf("$"));

		expect(valueOffsets).toHaveLength(3);
		expect(new Set(valueOffsets).size).toBe(1);
	});

	it("keeps consecutive list items together", () => {
		const lines = renderSummary(summary, { color: false });
		const first = lines.findIndex((line) =>
			line.includes("monetization slips"),
		);
		const second = lines.findIndex((line) => line.includes("China revenue"));

		expect(second).toBe(first + 1);
	});

	it("keeps the bullet glyph and indents continuations under the text", () => {
		const long = "x ".repeat(80);
		const lines = renderSummary(`- ${long.trim()}`, { color: false });

		expect(lines[0].startsWith("•")).toBe(true);
		expect(lines[1].startsWith("   ")).toBe(true);
	});

	it("omits the recommendation badge when the caller already shows one", () => {
		const shown = renderSummary(summary, { color: false, badge: true });
		const hidden = renderSummary(summary, { color: false, badge: false });

		expect(shown.join("\n")).toContain("[AVOID]");
		expect(hidden.join("\n")).not.toContain("[AVOID]");
	});

	it("turns a bare-bold heading into an underlined section title", () => {
		const lines = renderSummary("**Key data**\nPrice: $1.00", { color: false });

		expect(lines[0]).toBe("KEY DATA");
		expect(lines[1]).toMatch(/^─+$/);
	});
});

describe("renderReport", () => {
	it("leads with the recommendation and the figures behind it", () => {
		const out = renderReport({ ticker: "NVDA", decision, summary });

		expect(out).toContain("[AVOID]");
		expect(out).toContain("$280.00");
		expect(out).toContain("$225.00 – $265.00");
		expect(out).toContain("overvalued");
	});

	it("prints the decision and the note's own call only once", () => {
		const out = renderReport({ ticker: "NVDA", decision, summary });

		expect(out.match(/\[AVOID\]/g)).toHaveLength(1);
	});

	it("says so when the run never reached a decision", () => {
		const out = renderReport({
			ticker: "NVDA",
			validationIssues: ["valuation data fails schema: expected object"],
		});

		expect(out).toContain("NO RECOMMENDATION");
		expect(out).toContain("valuation data fails schema");
		// No figures are invented for a run that produced no decision.
		expect(out).not.toContain("Fair value");
	});

	it("never emits escape codes when stdout is not a terminal", () => {
		const out = renderReport({ ticker: "NVDA", decision, summary });

		expect(stripAnsi(out)).toBe(out);
	});

	it("renders a report with no summary at all", () => {
		const out = renderReport({ ticker: "NVDA", decision });

		expect(out).toContain("[AVOID]");
		expect(out).toContain("No analyst note available");
	});
});
