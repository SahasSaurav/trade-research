import { runResearch } from "@src/features/sentiment/workflow/research.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const schema = z.object({ value: z.number() });

/** An error shaped like the ones provider SDKs actually throw. */
function providerError(message: string, extra: Record<string, unknown>) {
	return Object.assign(new Error(message), extra);
}

describe("runResearch", () => {
	it("returns parsed data on success", async () => {
		const outcome = await runResearch(async () => ({ value: 42 }), schema);

		expect(outcome).toEqual({ data: { value: 42 }, error: null });
	});

	it("rejects data that does not match the schema without retrying", async () => {
		// A schema violation is deterministic; retrying it three times would
		// just burn quota on a guaranteed same answer.
		const invoke = vi.fn<() => Promise<{ value: string }>>(async () => ({
			value: "not a number",
		}));

		const outcome = await runResearch(invoke, schema);

		expect(outcome.data).toBeNull();
		expect(outcome.error).toMatch(/invalid structured data/i);
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	it("surfaces a provider error instead of throwing", async () => {
		const outcome = await runResearch(async () => {
			throw providerError("model not found", { status: 404 });
		}, schema);

		expect(outcome.data).toBeNull();
		expect(outcome.error).toBe("model not found");
	});

	it.each([
		["429 status", { status: 429 }],
		["500 status", { status: 503 }],
		["statusCode field", { statusCode: 429 }],
		["ECONNRESET code", { code: "ECONNRESET" }],
		["ETIMEDOUT code", { code: "ETIMEDOUT" }],
		["UND_ERR code", { code: "UND_ERR_SOCKET" }],
	])("retries a transient failure (%s)", async (_label, extra) => {
		let calls = 0;
		const outcome = await runResearch(async () => {
			calls += 1;
			if (calls < 3) throw providerError("transient", extra);
			return { value: 7 };
		}, schema);

		expect(calls).toBe(3);
		expect(outcome).toEqual({ data: { value: 7 }, error: null });
	});

	it("retries on a transient message with no status or code", async () => {
		let calls = 0;
		const outcome = await runResearch(async () => {
			calls += 1;
			if (calls < 2) throw new Error("fetch failed");
			return { value: 1 };
		}, schema);

		expect(calls).toBe(2);
		expect(outcome.data).toEqual({ value: 1 });
	});

	it("gives up after three attempts and reports the last error", async () => {
		const invoke = vi.fn<() => Promise<never>>(async () => {
			throw providerError("still failing", { status: 503 });
		});

		const outcome = await runResearch(invoke, schema);

		expect(invoke).toHaveBeenCalledTimes(3);
		expect(outcome.data).toBeNull();
		expect(outcome.error).toBe("still failing");
	});

	it("rethrows an error that is neither transient nor a provider error", async () => {
		// A programming bug must not be swallowed into a null result; that
		// would look like "research failed" and hide the real cause.
		const bug = new TypeError("cannot read property of undefined");

		await expect(
			runResearch(async () => {
				throw bug;
			}, schema),
		).rejects.toThrow(bug);
	});

	it("backs off between attempts", async () => {
		vi.useFakeTimers();
		try {
			const invoke = vi.fn<() => Promise<never>>(async () => {
				throw providerError("transient", { status: 500 });
			});

			const pending = runResearch(invoke, schema);
			await vi.advanceTimersByTimeAsync(5000);
			const outcome = await pending;

			expect(invoke).toHaveBeenCalledTimes(3);
			expect(outcome.data).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not sleep after the final attempt", async () => {
		vi.useFakeTimers();
		try {
			const invoke = vi.fn<() => Promise<never>>(async () => {
				throw providerError("transient", { status: 500 });
			});

			const pending = runResearch(invoke, schema);
			// Only enough time for the first two backoffs. A third sleep
			// would leave the promise unsettled and hang the test.
			await vi.advanceTimersByTimeAsync(1500);
			const outcome = await pending;

			expect(invoke).toHaveBeenCalledTimes(3);
			expect(outcome.error).toBe("transient");
		} finally {
			vi.useRealTimers();
		}
	});

	it("rethrows a thrown non-Error value unchanged", async () => {
		// A bare string is not transient, not a provider error, and not an
		// Error instance. It must propagate rather than be stringified into
		// a result, since `String(error)` on it would lose the stack.
		await expect(
			runResearch(async () => {
				throw "just a string";
			}, schema),
		).rejects.toBe("just a string");
	});

	it("stringifies a non-Error provider failure into the error field", async () => {
		// The counterpart to the case above. isProviderError matches on the
		// message, so a thrown object with a status is caught and reported
		// rather than rethrown — and since it is not an Error instance, the
		// `String(error)` fallback runs instead of `.message`.
		const outcome = await runResearch(async () => {
			throw { status: 500, detail: "upstream exploded" };
		}, schema);

		expect(outcome.data).toBeNull();
		expect(outcome.error).toBe("[object Object]");
	});

	describe("attempt budget", () => {
		it("defaults to three attempts when no budget is passed", async () => {
			// The default must equal the old hardcoded constant, or making the
			// budget configurable would quietly change every existing caller.
			const invoke = vi.fn<() => Promise<never>>(async () => {
				throw providerError("still failing", { status: 503 });
			});

			await runResearch(invoke, schema);

			expect(invoke).toHaveBeenCalledTimes(3);
		});

		it("honours a smaller attempt budget", async () => {
			// One attempt means no retry at all: a caller that already spent an
			// agent invocation in a sibling branch may not want three more.
			const invoke = vi.fn<() => Promise<never>>(async () => {
				throw providerError("transient", { status: 500 });
			});

			const outcome = await runResearch(invoke, schema, 1);

			expect(invoke).toHaveBeenCalledTimes(1);
			expect(outcome.error).toBe("transient");
		});

		it("retries up to the given budget and then stops", async () => {
			const invoke = vi.fn<() => Promise<never>>(async () => {
				throw providerError("transient", { status: 500 });
			});

			await runResearch(invoke, schema, 2);

			expect(invoke).toHaveBeenCalledTimes(2);
		});

		it("still succeeds inside a larger budget", async () => {
			let calls = 0;
			const outcome = await runResearch(
				async () => {
					calls += 1;
					if (calls < 2) throw providerError("transient", { status: 429 });
					return { value: 5 };
				},
				schema,
				5,
			);

			expect(calls).toBe(2);
			expect(outcome).toEqual({ data: { value: 5 }, error: null });
		});
	});
});
