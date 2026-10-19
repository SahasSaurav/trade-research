/**
 * Formatting for Yahoo Finance payloads.
 *
 * Two rules drive this file. Numbers are printed exactly, not abbreviated —
 * the agents copy them into structured output, and "416.2B" cannot be copied
 * into a `number` field without inventing precision. Units are printed with
 * every value, because Yahoo returns margins as fractions and debt/equity as a
 * percent, and the two mistakes are indistinguishable once the unit is gone.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD in UTC; Yahoo timestamps are UTC and a local shift moves the day. */
function formatDate(value: Date | string | number | null | undefined): string {
	if (value === null || value === undefined) return "n/a";
	if (typeof value === "string" && DATE_ONLY.test(value)) return value;

	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "n/a";
	return date.toISOString().slice(0, 10);
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return "n/a";
	}
	return value.toFixed(decimals);
}

/** Yahoo margins, growth and returns are fractions; the schema wants percent. */
function formatPercent(
	fraction: number | null | undefined,
	decimals = 2,
): string {
	if (
		fraction === null ||
		fraction === undefined ||
		!Number.isFinite(fraction)
	) {
		return "n/a";
	}
	return `${(fraction * 100).toFixed(decimals)}%`;
}

function formatRatio(value: number | null | undefined, decimals = 2): string {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return "n/a";
	}
	return `${value.toFixed(decimals)}x`;
}

/**
 * A number Yahoo already expresses in percent. Debt/equity is the case that
 * forces this: Yahoo reports 78.445 meaning 78.4%, while every margin and
 * return beside it is a fraction (0.4865 meaning 48.65%). Running both through
 * the same formatter would print Apple's leverage as 7844.50%.
 */
function formatPercentValue(
	value: number | null | undefined,
	decimals = 2,
): string {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return "n/a";
	}
	return `${value.toFixed(decimals)}%`;
}

/** `[label, value]` pairs rendered as a two-column markdown table. */
function table(
	heading: string,
	rows: [string, string | null | undefined][],
): string {
	const present = rows.filter(([, value]) => value !== null && value !== "");
	if (present.length === 0) return "";

	return [
		`### ${heading}`,
		"",
		"| Field | Value |",
		"| --- | --- |",
		...present.map(([label, value]) => `| ${label} | ${value} |`),
		"",
	].join("\n");
}

/**
 * What a tool returns when Yahoo cannot answer. It must be a string, not a
 * throw: a tool exception ends the whole research node, and "this symbol has no
 * data" is a finding, not a crash.
 */
function unavailable(tool: string, reason: string): string {
	return `DATA_UNAVAILABLE: ${tool} could not retrieve data from Yahoo Finance (${reason}). This says nothing about the instrument itself. Do not estimate or fabricate the missing values — use web search instead, and report anything still unverified as null.`;
}

export {
	formatDate,
	formatPercentValue,
	formatNumber,
	formatPercent,
	formatRatio,
	table,
	unavailable,
};
