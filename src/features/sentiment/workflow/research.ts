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

	const message = error instanceof Error ? error.message : String(error);
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
 * Retries only ever fire on a transient provider error — a 429, a 5xx, a
 * dropped socket — never on a bad artifact, which returns immediately.
 *
 * Each attempt re-invokes the whole agent, so this is a multiplier on the most
 * expensive part of a sentiment branch rather than an increment. It is
 * overridable per call because a caller that has already burned one agent
 * invocation in a sibling branch may not want three more.
 */
async function runResearch<T>(
	invoke: () => Promise<unknown>,
	schema: z.ZodType<T>,
	maxAttempts: number = MAX_RESEARCH_ATTEMPTS,
): Promise<ResearchOutcome<T>> {
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const result = schema.safeParse(await invoke());
			if (!result.success) {
				return {
					data: null,
					error: `Agent returned invalid structured data: ${result.error.message}`,
				};
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
					error: error instanceof Error ? error.message : String(error),
				};
			}
			throw error;
		}
	}

	return { data: null, error: "Research failed after retry attempts." };
}

export { runResearch };
