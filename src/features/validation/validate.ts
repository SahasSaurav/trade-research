import {
	analystReportSchema,
	RATING_SCALE,
} from "@src/features/analyst/schema.js";
import { financialsSchema } from "@src/features/financials/schema.js";
import { marketSchema } from "@src/features/market/schema.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { z } from "zod";

const validationSchema = z.object({
	pass: z.boolean(),
	issues: z.array(z.string()),
	/** Analyst issues a repair round can act on; see validateAnalystData. */
	analystRepairable: z.boolean(),
	analystIssues: z.array(z.string()),
	financialsIssues: z.array(z.string()),
	sentimentIssues: z.array(z.string()),
	marketIssues: z.array(z.string()),
});

type ValidationResult = z.infer<typeof validationSchema>;

type RawReport = {
	firm?: unknown;
	rating?: unknown;
	sourceUrl?: unknown;
};

function asText(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * The analyst artifact is checked report by report, on the raw payload.
 *
 * The schema enforces the normalized rating scale, so an off-scale rating
 * fails the parse — but a parse error is a blob, and the repair round needs to
 * be told *which* report said "Market Perform" and what to write instead. The
 * per-report checks therefore read the payload directly, and the schema parse
 * stays as the backstop for anything they cannot describe.
 *
 * `repairable` separates the two. A per-report issue names the firm, the field
 * and the expected value, so a re-run can act on it. The schema message alone
 * names nothing: re-invoking the analyst with a zod dump is a full agent run
 * spent on a message the model cannot use, so that case is reported but not
 * retried.
 */
function validateAnalystData(analyst: unknown): {
	issues: string[];
	repairable: boolean;
} {
	const issues: string[] = [];
	let repairable = false;

	const flag = (issue: string) => {
		issues.push(issue);
		repairable = true;
	};

	const rawReports =
		analyst &&
		typeof analyst === "object" &&
		Array.isArray((analyst as { reports?: unknown }).reports)
			? (analyst as { reports: RawReport[] }).reports
			: [];

	for (const report of rawReports) {
		const firm = asText(report.firm) ?? "unknown firm";
		const rating = asText(report.rating);

		if (rating === null) {
			flag(`report from ${firm} has no rating`);
		} else if (!(RATING_SCALE as readonly string[]).includes(rating)) {
			flag(
				`report from ${firm} has rating "${rating}"; normalize it to ${RATING_SCALE.join(", ")}`,
			);
		}

		if (asText(report.sourceUrl) === null) {
			flag(`report from ${firm} has no sourceUrl`);
		}
	}

	if (rawReports.length === 0) {
		flag("no analyst reports returned");
	} else {
		const firms = new Set(
			rawReports.map((report) => asText(report.firm) ?? ""),
		);
		if (firms.size !== rawReports.length) {
			flag("analyst reports contain duplicate firms");
		}
	}

	const parsed = analystReportSchema.safeParse(analyst);
	if (!parsed.success && issues.length === 0) {
		issues.push(`analyst data fails schema: ${parsed.error.message}`);
	}

	return { issues, repairable };
}

function validateFinancialsData(financials: unknown): string[] {
	const issues: string[] = [];

	const parsed = financialsSchema.safeParse(financials);
	if (!parsed.success) {
		issues.push(`financials data fails schema: ${parsed.error.message}`);
		return issues;
	}

	if (parsed.data.sourceUrls.length === 0) {
		issues.push("financials has no sourceUrls");
	}

	return issues;
}

function validateMarketData(market: unknown): string[] {
	const issues: string[] = [];

	const parsed = marketSchema.safeParse(market);
	if (!parsed.success) {
		issues.push(`market data fails schema: ${parsed.error.message}`);
		return issues;
	}

	if (parsed.data.sourceUrls.length === 0) {
		issues.push("market data has no sourceUrls");
	}

	return issues;
}

function validateSentimentData(sentiment: unknown): string[] {
	const issues: string[] = [];

	const parsed = sentimentSchema.safeParse(sentiment);
	if (!parsed.success) {
		issues.push(`sentiment data fails schema: ${parsed.error.message}`);
		return issues;
	}

	const daysOld = Date.now() - new Date(parsed.data.dateChecked).getTime();
	if (daysOld > 14 * 24 * 60 * 60 * 1000) {
		issues.push("sentiment data appears stale (>14 days old)");
	}

	return issues;
}

function validateArtifacts(
	financials: unknown,
	analyst: unknown,
	sentiment: unknown,
	market: unknown,
): ValidationResult {
	const financialsIssues = validateFinancialsData(financials);
	const analystValidation = validateAnalystData(analyst);
	const sentimentIssues = validateSentimentData(sentiment);
	const marketIssues = validateMarketData(market);
	const issues = [
		...financialsIssues,
		...analystValidation.issues,
		...sentimentIssues,
		...marketIssues,
	];
	return {
		pass: issues.length === 0,
		issues,
		analystRepairable: analystValidation.repairable,
		analystIssues: analystValidation.issues,
		financialsIssues,
		sentimentIssues,
		marketIssues,
	};
}

export type { ValidationResult };
export { validateArtifacts };
