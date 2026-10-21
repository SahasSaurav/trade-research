/**
 * A bounded, expiring cache for page content fetched off the web.
 *
 * The four research branches overlap: the financials agent, the analyst and the
 * market agent all end up on the same Yahoo quote page or the same
 * investor-relations page, and the news and geopolitical subagents read the
 * same story from different feeds. Each of those reads is billed, and each
 * result is re-sent to the model on every later call. The same page read three
 * times therefore costs three fetches and three copies of the same text.
 *
 * The cache lives as long as the tool that owns it, and the workflow builds one
 * page reader for every branch — so a page one branch reads is free for the
 * others. That sharing is the whole saving: a cache per call would never hit.
 *
 * Entries expire, because a page's content changes: a quote page cached an hour
 * ago is not the page a reader would see now. The TTL is long enough to cover
 * one run and short enough that a long-lived process does not serve stale
 * pages. The size is bounded too, because a page is tens of kilobytes.
 *
 * Failures are the caller's problem, not the cache's. This type stores whatever
 * it is given; the extract tool deliberately stores only successful reads, so a
 * transient error never becomes a permanent one for the length of the TTL.
 */

const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

type UrlCacheOptions = {
	/** How many entries to keep before the least recently used one is dropped. */
	maxEntries?: number;
	/** How long an entry stays fresh, in milliseconds. */
	ttlMs?: number;
};

type UrlCache<T> = {
	/** The cached value, or undefined when the key is absent or expired. */
	get(key: string): T | undefined;
	set(key: string, value: T): void;
	clear(): void;
	readonly size: number;
};

function createUrlCache<T>(options: UrlCacheOptions = {}): UrlCache<T> {
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

	// A Map iterates in insertion order, so the first key is the least recently
	// used and the last is the most recent. Re-inserting on a hit is what makes
	// eviction least-recently-used rather than first-in-first-out.
	const entries = new Map<string, { value: T; storedAt: number }>();

	return {
		get(key) {
			const entry = entries.get(key);
			if (!entry) return undefined;

			if (Date.now() - entry.storedAt > ttlMs) {
				entries.delete(key);
				return undefined;
			}

			entries.delete(key);
			entries.set(key, entry);
			return entry.value;
		},
		set(key, value) {
			entries.delete(key);
			entries.set(key, { value, storedAt: Date.now() });

			while (entries.size > maxEntries) {
				const oldest = entries.keys().next();
				if (oldest.done) break;
				entries.delete(oldest.value);
			}
		},
		clear() {
			entries.clear();
		},
		get size() {
			return entries.size;
		},
	};
}

export type { UrlCache, UrlCacheOptions };
export { createUrlCache };
