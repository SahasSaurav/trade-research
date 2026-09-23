import { analystReportSchema } from "@src/features/analyst/schema.js";
import { sentimentSchema } from "@src/features/sentiment/schema.js";
import { valuationSchema } from "@src/features/valuation/schema.js";
import { z } from "zod";

const validationSchema = z.object({
	pass: z.boolean(),
	issues: z.array(z.string()),
});

type ValidationResult = z.infer<typeof validationSchema>;

function validateAnalystData(analyst: unknown): string[] {
	const issues: string[] = [];

	const parsed = analystReportSchema.safeParse(analyst);
	if (!parsed.success) {
		issues.push(`analyst data fails schema: ${parsed.error.message}`);
		return issues;
	}

	if (parsed.data.reports.length === 0) {
		issues.push("no analyst reports returned");
		return issues;
	}

	const firms = new Set(parsed.data.reports.map((report) => report.firm));
	if (firms.size !== parsed.data.reports.length) {
		issues.push("analyst reports contain duplicate firms");
	}

	for (const report of parsed.data.reports) {
		if (!report.sourceUrl) {
			issues.push(`report from ${report.firm} has no sourceUrl`);
		}
		if (!report.rating) {
			issues.push(`report from ${report.firm} has no rating`);
		}
	}

	return issues;
}

function validateValuationData(valuation: unknown): string[] {
	const issues: string[] = [];

	const parsed = valuationSchema.safeParse(valuation);
	if (!parsed.success) {
		issues.push(`valuation data fails schema: ${parsed.error.message}`);
		return issues;
	}

	if (parsed.data.sourceUrls.length === 0) {
		issues.push("valuation has no sourceUrls");
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

	const daysOld =
		new Date().getTime() - new Date(parsed.data.dateChecked).getTime();
	if (daysOld > 14 * 24 * 60 * 60 * 1000) {
		issues.push("sentiment data appears stale (>14 days old)");
	}

	return issues;
}

function validateArtifacts(
	valuation: unknown,
	analyst: unknown,
	sentiment: unknown,
): ValidationResult {
	const issues = [
		...validateValuationData(valuation),
		...validateAnalystData(analyst),
		...validateSentimentData(sentiment),
	];
	return { pass: issues.length === 0, issues };
}

export type { ValidationResult };
export { validateArtifacts, validationSchema };
