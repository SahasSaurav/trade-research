import { errorMessage } from "@src/utils/errors.js";
import type { z } from "zod";

type ResearchOutcome<T> =
	| { data: T; error: null }
	| { data: null; error: string };

const MAX_RESEARCH_ATTEMPTS = 3;

function getErrorProperty(error: unknown, property: string): unknown {
	if (typeof error !== "object" || error === null) return undefined;
	return Reflect.get(error, property);
}

function isTransientError(error: unknown): boolean {
	const status = Number(
		getErrorProperty(error, "status") ?? getErrorProperty(error, "statusCode"),
	);
	if (status === 408 || status === 429 || status >= 500) return true;

	const code = String(getErrorProperty(error, "code") ?? "");
	if (
		/^(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|UND_ERR_)/.test(
			code,
		)
	) {
		return true;
	}

	const message = errorMessage(error);
	return /fetch failed|network|timed? ?out|rate.?limit|temporarily unavailable/i.test(
		message,
	);
}

function isProviderError(error: unknown): boolean {
	return (
		getErrorProperty(error, "status") !== undefined ||
		getErrorProperty(error, "statusCode") !== undefined ||
		getErrorProperty(error, "code") !== undefined ||
		isTransientError(error)
	);
}

/**
 * Retries fire only on transient provider errors, never on a bad artifact.
 * Each attempt re-invokes the whole agent, so this multiplies cost.
 *
 * `isUsable` adds one more retry: a parsed artifact the caller cannot use is a
 * silent failure — nothing downstream can tell it from a real finding — so it
 * is worth one more attempt. Exactly one: if the second attempt is unusable
 * too, the artifact is returned and the caller degrades on its own terms.
 */
async function runResearch<T>(
	invoke: () => Promise<unknown>,
	schema: z.ZodType<T>,
	maxAttempts: number = MAX_RESEARCH_ATTEMPTS,
	isUsable?: (data: T) => boolean,
): Promise<ResearchOutcome<T>> {
	let retriedUnusable = false;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const result = schema.safeParse(await invoke());
			if (!result.success) {
				return {
					data: null,
					error: `Agent returned invalid structured data: ${result.error.message}`,
				};
			}
			if (
				isUsable &&
				!isUsable(result.data) &&
				!retriedUnusable &&
				attempt < maxAttempts
			) {
				retriedUnusable = true;
				continue;
			}
			return { data: result.data, error: null };
		} catch (error) {
			if (isTransientError(error) && attempt < maxAttempts) {
				await new Promise((resolve) =>
					setTimeout(resolve, 500 * 2 ** (attempt - 1)),
				);
				continue;
			}
			if (isProviderError(error)) {
				return {
					data: null,
					error: errorMessage(error),
				};
			}
			throw error;
		}
	}

	return { data: null, error: "Research failed after retry attempts." };
}

export { runResearch };
