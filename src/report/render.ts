/**
 * Terminal rendering for the research report.
 *
 * The summary is model-written markdown and the decision is a structured
 * artifact, so both are turned into something scannable: a badge for the call,
 * aligned figures for the numbers, headings that look like headings.
 *
 * Colour is applied last, after wrapping, so escape codes never corrupt the
 * layout, and it is suppressed when the output is not a terminal.
 */

const ANSI = {
	reset: "\u001B[0m",
	bold: "\u001B[1m",
	dim: "\u001B[2m",
	red: "\u001B[31m",
	green: "\u001B[32m",
	yellow: "\u001B[33m",
	blue: "\u001B[34m",
	cyan: "\u001B[36m",
	gray: "\u001B[90m",
	bgRed: "\u001B[41m",
	bgGreen: "\u001B[42m",
	bgYellow: "\u001B[43m",
} as const;

/**
 * Built from a string rather than a regex literal: the linter rejects control
 * characters inside a regex literal outright.
 */
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

const DEFAULT_WIDTH = 88;
const MIN_WIDTH = 48;

type Recommendation = "buy" | "hold" | "avoid";

const RECOMMENDATION_BACKGROUND: Record<Recommendation, keyof typeof ANSI> = {
	buy: "bgGreen",
	hold: "bgYellow",
	avoid: "bgRed",
};

function supportsColor(stream: NodeJS.WriteStream): boolean {
	return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}

function paint(text: string, code: keyof typeof ANSI, color: boolean): string {
	return color ? `${ANSI[code]}${text}${ANSI.reset}` : text;
}

/** Visible length, ignoring escape codes and markdown markers. */
function visibleWidth(text: string): number {
	return stripAnsi(text).replace(/[*`]/g, "").length;
}

function terminalWidth(): number {
	const columns = process.stdout.columns;
	if (!columns) return DEFAULT_WIDTH;
	return Math.max(MIN_WIDTH, Math.min(columns, DEFAULT_WIDTH));
}

type Segment = { text: string; bold?: boolean; code?: boolean };

/**
 * Splits a line into styled runs. Only the two markers the summary prompt
 * actually produces are handled: **bold** and `code`.
 */
function tokenizeInline(line: string): Segment[] {
	const segments: Segment[] = [];
	const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
	let cursor = 0;
	let match: RegExpExecArray | null = pattern.exec(line);

	while (match) {
		if (match.index > cursor) {
			segments.push({ text: line.slice(cursor, match.index) });
		}
		segments.push(
			match[1] !== undefined
				? { text: match[1], bold: true }
				: { text: match[2] ?? "", code: true },
		);
		cursor = match.index + match[0].length;
		match = pattern.exec(line);
	}

	if (cursor < line.length) segments.push({ text: line.slice(cursor) });
	return segments.length > 0 ? segments : [{ text: line }];
}

function styleSegment(segment: Segment, color: boolean): string {
	if (segment.bold) return paint(segment.text, "bold", color);
	if (segment.code) return paint(segment.text, "cyan", color);
	return segment.text;
}

/**
 * Word-wraps inline-marked text. Wrapping happens on the marker-bearing source
 * and styling afterwards, so the visible width is what drives the break.
 */
function renderInline(line: string, width: number, color: boolean): string[] {
	const words = tokenizeInline(line).flatMap((segment) =>
		segment.text
			.split(/(\s+)/)
			.filter((part) => part.length > 0)
			.map((part) => ({
				part,
				space: /^\s+$/.test(part),
				bold: segment.bold,
				code: segment.code,
			})),
	);

	const lines: string[] = [];
	let current = "";
	let currentWidth = 0;

	const push = () => {
		lines.push(current.trimEnd());
		current = "";
		currentWidth = 0;
	};

	for (const { part, space, bold, code } of words) {
		const tokenWidth = visibleWidth(part);
		if (space) {
			// Whitespace runs are preserved, not collapsed: column padding is
			// built from runs of spaces, so normalising them to one would undo
			// the alignment. Leading whitespace after a wrap is dropped, since
			// the caller owns indentation.
			if (currentWidth === 0) continue;
			const run = Math.min(part.length, Math.max(1, width - currentWidth));
			current += " ".repeat(run);
			currentWidth += run;
			continue;
		}
		if (currentWidth + tokenWidth > width && currentWidth > 0) push();
		current += styleSegment({ text: part, bold, code }, color);
		currentWidth += tokenWidth;
	}

	if (current.length > 0) push();
	return lines.length > 0 ? lines : [""];
}

const HEADING = /^#{1,6}\s+(.*)$/;
const WHOLE_LINE_BOLD = /^\*\*(.+)\*\*$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^(\d+)\.\s+(.*)$/;
const KEY_VALUE = /^([A-Za-z][A-Za-z0-9 %/().-]{0,28}):\s+(.+)$/;

/**
 * Turns the summary markdown into terminal output. Consecutive "Label: value"
 * lines are aligned into columns, which is what makes the Key data block
 * readable — as separate wrapped paragraphs it reads like a list of unrelated
 * assertions.
 */
function renderSummary(
	markdown: string,
	options: { color: boolean; badge?: boolean },
): string[] {
	const { color, badge = true } = options;
	const width = terminalWidth();
	const out: string[] = [];
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");

	let pending: { key: string; value: string }[] = [];

	const flushKeyValues = () => {
		if (pending.length === 0) return;
		const keyWidth = Math.max(...pending.map((item) => item.key.length));
		for (const item of pending) {
			const pad = " ".repeat(keyWidth - item.key.length);
			const rendered = renderInline(
				`${paint(item.key, "gray", color)}${pad}   ${item.value}`,
				width,
				color,
			);
			out.push(...rendered);
		}
		pending = [];
	};

	/**
	 * Inserts a blank line before a new block, but never directly after a
	 * heading rule or between items of the same list — a blank between "1." and
	 * "2." reads as two separate thoughts.
	 */
	let lastKind: "none" | "heading" | "list" | "para" | "kv" = "none";
	const blank = () => {
		if (
			out.length > 0 &&
			out[out.length - 1] !== "" &&
			lastKind !== "heading"
		) {
			out.push("");
		}
	};

	for (const raw of lines) {
		const line = raw.trimEnd();

		if (line.trim() === "") {
			flushKeyValues();
			lastKind = "none";
			continue;
		}

		// The recommendation is the one line that must not be missed, so it
		// gets a badge rather than a heading. The caller already shows one
		// above the note, hence the opt-out.
		const recommendation = WHOLE_LINE_BOLD.exec(line)?.[1];
		const match = /^RECOMMENDATION:\s*(BUY|HOLD|AVOID|NONE)\b/i.exec(
			recommendation ?? "",
		);
		if (recommendation && match) {
			flushKeyValues();
			if (badge) {
				const label = match[1].toUpperCase();
				const known = label.toLowerCase() as Recommendation;
				const background = RECOMMENDATION_BACKGROUND[known] ?? "bgYellow";
				// Reversed badge: the background is set first, then the label is
				// bolded on top of it, and the reset closes the whole thing.
				blank();
				out.push(
					color
						? `${ANSI[background]}${paint(`  ${label}  `, "bold", color)}`
						: `  [${label}]`,
				);
				lastKind = "para";
			}
			continue;
		}

		const heading = HEADING.exec(line)?.[1] ?? WHOLE_LINE_BOLD.exec(line)?.[1];
		if (heading) {
			flushKeyValues();
			blank();
			out.push(paint(heading.toUpperCase(), "bold", color));
			out.push(paint("─".repeat(width), "gray", color));
			lastKind = "heading";
			continue;
		}

		const bullet = BULLET.exec(line)?.[1];
		if (bullet) {
			flushKeyValues();
			if (lastKind === "para") blank();
			out.push(
				...renderInline(`•  ${bullet}`, width, color).map((text, index) =>
					index === 0 ? text : `   ${text}`,
				),
			);
			lastKind = "list";
			continue;
		}

		const numbered = NUMBERED.exec(line);
		if (numbered) {
			flushKeyValues();
			if (lastKind === "para") blank();
			const marker = `${paint(`${numbered[1]}.`, "bold", color)}  `;
			const indent = " ".repeat(String(numbered[1]).length + 3);
			out.push(
				...renderInline(`${marker}${numbered[2]}`, width, color).map(
					(text, index) => (index === 0 ? `  ${text}` : `${indent}${text}`),
				),
			);
			lastKind = "list";
			continue;
		}

		const kv = KEY_VALUE.exec(line);
		if (kv) {
			// The colon is part of the key so the column reads as a table
			// rather than as prose that lost a character.
			if (lastKind === "para") blank();
			pending.push({ key: `${kv[1]}:`, value: kv[2] });
			lastKind = "kv";
			continue;
		}

		flushKeyValues();
		blank();
		out.push(...renderInline(line, width, color));
		lastKind = "para";
	}

	flushKeyValues();
	return out.filter(
		(line, index) => !(line === "" && (index === 0 || out[index - 1] === "")),
	);
}

type ReportInput = {
	ticker: string;
	tickerValidation?:
		| { ok: true; ticker: string; name: string | null }
		| { ok: false; message: string };
	companyName?: string | null;
	dateChecked?: string;
	decision?: {
		recommendation: string;
		valuationAssessment: string;
		fairValueEstimate: number;
		fairValueMethod: string;
		entryPriceRange: { min: number; max: number; rationale: string };
		priceTriggers: {
			triggerType: string;
			price: number;
			explanation: string;
		}[];
		executionPlan: {
			entryPrice: number | null;
			stopLoss: number | null;
			takeProfit: number | null;
			positionSizing: string | null;
			rationale: string;
		};
		sentimentAssessment: string;
		geopoliticalRisk: string;
		keyRisks: string[];
		keyUncertainties: string[];
		disclaimer: string;
	};
	validationIssues?: string[];
	summary?: string;
};

const money = (value: number) => `$${value.toFixed(2)}`;

/**
 * Aligns a block of "label  value" lines on the label column.
 */
function align(
	rows: [string, string][],
	width: number,
	color: boolean,
): string[] {
	const labelWidth = Math.min(
		Math.max(...rows.map(([label]) => label.length)),
		24,
	);
	return rows.flatMap(([label, value]) => {
		const pad = " ".repeat(Math.max(0, labelWidth - label.length));
		const head = `${paint(label, "gray", color)}${pad}   `;
		return renderInline(`${head}${value}`, width, color).map((text, index) =>
			index === 0 ? `  ${text}` : `  ${" ".repeat(labelWidth + 3)}${text}`,
		);
	});
}

function section(title: string, width: number, color: boolean): string[] {
	return [
		"",
		`${paint(title.toUpperCase(), "bold", color)} ${paint("─".repeat(Math.max(0, width - title.length - 1)), "gray", color)}`,
	];
}

function renderReport(input: ReportInput): string {
	const { color } = { color: supportsColor(process.stdout) };
	const width = terminalWidth();
	const rule = "═".repeat(width);
	const out: string[] = [];

	out.push(paint(rule, "gray", color));
	out.push(
		`${paint("EQUITY RESEARCH", "bold", color)}  ${paint("·", "gray", color)}  ${paint(input.ticker, "bold", color)}` +
			`${input.companyName ? `${paint(`  ·  ${input.companyName}`, "gray", color)}` : ""}` +
			`${input.dateChecked ? `${paint(`  ·  ${input.dateChecked}`, "gray", color)}` : ""}`,
	);
	out.push(paint(rule, "gray", color));

	const { decision, summary, validationIssues } = input;

	if (decision) {
		const known = decision.recommendation.toLowerCase() as Recommendation;
		const label = decision.recommendation.toUpperCase();
		out.push("");
		out.push(
			color
				? `${ANSI[RECOMMENDATION_BACKGROUND[known] ?? "bgYellow"]}${paint(`  ${label}  `, "bold", color)}`
				: `[${label}]`,
		);

		const { entryPriceRange: entry } = decision;
		const rows: [string, string][] = [
			["Fair value", money(decision.fairValueEstimate)],
			["Entry range", `${money(entry.min)} – ${money(entry.max)}`],
			["Valuation", decision.valuationAssessment.replace(/_/g, " ")],
			["Sentiment", decision.sentimentAssessment],
			["Geopolitical risk", decision.geopoliticalRisk],
		];
		out.push("");
		out.push(...align(rows, width, color));
		out.push("");
		out.push(
			...renderInline(entry.rationale, width - 2, color).map((t) => `  ${t}`),
		);

		if (decision.priceTriggers.length > 0) {
			out.push(...section("Price triggers", width, color));
			for (const trigger of decision.priceTriggers) {
				const kind = trigger.triggerType.replace(/_/g, " ");
				out.push(
					...renderInline(
						`${paint(kind, "bold", color)} at ${money(trigger.price)} — ${trigger.explanation}`,
						width - 2,
						color,
					).map((text, index) => (index === 0 ? `  ${text}` : `    ${text}`)),
				);
			}
		}

		if (decision.executionPlan) {
			const plan = decision.executionPlan;
			out.push(...section("Trade plan", width, color));
			const tradeRows: [string, string][] = [];
			if (plan.entryPrice !== null) {
				tradeRows.push(["Entry", money(plan.entryPrice)]);
			}
			if (plan.stopLoss !== null) {
				tradeRows.push(["Stop-loss", money(plan.stopLoss)]);
			}
			if (plan.takeProfit !== null) {
				tradeRows.push(["Take-profit", money(plan.takeProfit)]);
			}
			if (plan.positionSizing) {
				tradeRows.push(["Position size", plan.positionSizing]);
			}
			if (tradeRows.length > 0) out.push(...align(tradeRows, width, color));
			if (plan.rationale) {
				out.push("");
				out.push(
					...renderInline(plan.rationale, width - 2, color).map(
						(text) => `  ${text}`,
					),
				);
			}
		}

		if (decision.keyRisks.length > 0) {
			out.push(...section("Key risks", width, color));
			for (const risk of decision.keyRisks) {
				out.push(
					...renderInline(`•  ${risk}`, width - 2, color).map((text, index) =>
						index === 0 ? `  ${text}` : `     ${text}`,
					),
				);
			}
		}

		if (decision.keyUncertainties.length > 0) {
			out.push(...section("Key uncertainties", width, color));
			for (const item of decision.keyUncertainties) {
				out.push(
					...renderInline(`•  ${item}`, width - 2, color).map((text, index) =>
						index === 0 ? `  ${text}` : `     ${text}`,
					),
				);
			}
		}
	} else {
		out.push("");
		out.push(paint("  NO RECOMMENDATION", "bold", color));
		out.push("");
		out.push(
			...renderInline(
				"This run did not reach the decision step, so there is no call to report.",
				width - 2,
				color,
			).map((text) => `  ${text}`),
		);
		if (validationIssues?.length) {
			out.push(...section("Blocking issues", width, color));
			for (const issue of validationIssues) {
				out.push(
					...renderInline(
						`•  ${issue.replace(/\s+/g, " ").trim()}`,
						width - 2,
						color,
					).map((text, index) => (index === 0 ? `  ${text}` : `     ${text}`)),
				);
			}
		}
	}

	if (summary) {
		out.push("");
		out.push(paint(rule, "gray", color));
		out.push(paint("ANALYST NOTE", "bold", color));
		out.push(paint(rule, "gray", color));
		// The badge is already shown above, so the note's own recommendation
		// line is dropped rather than printed twice.
		out.push(...renderSummary(summary, { color, badge: false }));
	} else {
		out.push("");
		out.push(paint("  No analyst note available.", "gray", color));
	}

	if (decision?.disclaimer) {
		out.push("");
		out.push(paint(rule, "gray", color));
		out.push(
			...renderInline(decision.disclaimer, width, color).map((text) =>
				paint(text, "gray", color),
			),
		);
	}

	out.push("");
	return out.join("\n");
}

function generateReport(input: ReportInput): string {
	const validation = input.tickerValidation;
	if (!validation?.ok) {
		return renderReport({
			...input,
			decision: undefined,
			summary: undefined,
			validationIssues: [
				validation?.message ?? "Ticker validation did not run.",
			],
		});
	}
	return renderReport({
		...input,
		ticker: validation.ticker,
		companyName: validation.name,
	});
}

export type { ReportInput };
export { generateReport, renderInline, renderReport, renderSummary, stripAnsi };
