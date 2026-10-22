/**
 * One line of text for a caught value.
 *
 * Everything that catches in this pipeline treats the failure as data — a
 * warning, a sentinel, an artifact that degrades — so it needs the message and
 * never the original error. `String(error)` alone prints `[object Object]` for
 * anything that is not an `Error`, which is the one case worth guarding.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { errorMessage };
