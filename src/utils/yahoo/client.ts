import YahooFinance from "yahoo-finance2";
import type { ModuleOptionsWithValidateTrue } from "yahoo-finance2/lib/moduleCommon";

/**
 * One Yahoo Finance client for the process.
 *
 * The survey notice is suppressed because it prints to stdout on first use,
 * which corrupts the rendered report. The queue is serialised: Yahoo rate-limits
 * bursts, and the research branches run in parallel, so concurrent calls from
 * four agents are the normal case, not the exception.
 */
function createYahooClient() {
	return new YahooFinance({
		suppressNotices: ["yahooSurvey"],
		queue: { concurrency: 1, interval: 250 },
		// Yahoo's schema check is stricter than Yahoo's own payloads — it
		// rejects the `TTM` periodType the statements endpoint returns — so
		// result validation is left off and the fields we read are guarded by
		// hand in the tools.
		validation: { logErrors: false },
	});
}

const yahooClient = createYahooClient();

/** Per-call ceiling: a hung Yahoo request must not hold a research node open. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Typed as the validating overload so callers get Yahoo's result types rather
 * than `unknown`. Instance-level `validation` already turned result checking
 * off; this annotation only picks the return type.
 */
const moduleOptions: ModuleOptionsWithValidateTrue = {
	fetchOptions: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
};

export { createYahooClient, moduleOptions, REQUEST_TIMEOUT_MS, yahooClient };
