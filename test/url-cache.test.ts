import { createUrlCache } from "@src/utils/url-cache.js";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The cache exists to stop the four branches paying for the same page. These
 * tests pin the two behaviours that make that safe: an entry stops being served
 * once it is stale, and the memory it uses stays bounded.
 */

afterEach(() => {
	vi.useRealTimers();
});

describe("createUrlCache", () => {
	it("stores and returns a value", () => {
		const cache = createUrlCache<string>();

		cache.set("https://example.com/a", "body");

		expect(cache.get("https://example.com/a")).toBe("body");
		expect(cache.size).toBe(1);
	});

	it("returns undefined for a key it has never seen", () => {
		const cache = createUrlCache<string>();

		expect(cache.get("https://example.com/missing")).toBeUndefined();
	});

	it("keeps an entry until its ttl passes", () => {
		vi.useFakeTimers();
		const cache = createUrlCache<string>({ ttlMs: 1000 });
		cache.set("a", "1");

		vi.advanceTimersByTime(999);

		expect(cache.get("a")).toBe("1");
	});

	it("expires an entry once its ttl passes", () => {
		vi.useFakeTimers();
		const cache = createUrlCache<string>({ ttlMs: 1000 });
		cache.set("a", "1");

		vi.advanceTimersByTime(1001);

		expect(cache.get("a")).toBeUndefined();
		// The expired entry is dropped, not merely hidden: otherwise a cache
		// of stale pages would fill up and evict the fresh ones.
		expect(cache.size).toBe(0);
	});

	it("evicts the least recently used entry when full", () => {
		const cache = createUrlCache<string>({ maxEntries: 2 });
		cache.set("a", "1");
		cache.set("b", "2");

		// Reading "a" makes "b" the oldest, so "b" is what a new entry evicts.
		cache.get("a");
		cache.set("c", "3");

		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("a")).toBe("1");
		expect(cache.get("c")).toBe("3");
		expect(cache.size).toBe(2);
	});

	it("replaces a value stored under the same key", () => {
		const cache = createUrlCache<string>();
		cache.set("a", "1");

		cache.set("a", "2");

		expect(cache.get("a")).toBe("2");
		expect(cache.size).toBe(1);
	});

	it("clears every entry", () => {
		const cache = createUrlCache<string>();
		cache.set("a", "1");
		cache.set("b", "2");

		cache.clear();

		expect(cache.size).toBe(0);
		expect(cache.get("a")).toBeUndefined();
	});
});
