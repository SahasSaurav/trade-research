import type { TavilySearch } from "@langchain/tavily";

type TickerValidation =
	| { ok: true; ticker: string; name: string | null; sourceUrl: string }
	| {
			ok: false;
			reason: "empty" | "malformed" | "not_found" | "lookup_failed";
			message: string;
	  };

type SearchResult = { title?: string; url?: string; content?: string };

const TICKER_SHAPE = /^[A-Z]{1,5}(?:\.[A-Z])?$/;
function normalizeTicker(raw: string): string {
	return raw.trim().toUpperCase();
}

function checkTickerShape(
	raw: string,
): { ok: true; ticker: string } | Extract<TickerValidation, { ok: false }> {
	const ticker = normalizeTicker(raw);
	if (!ticker) {
		return { ok: false, reason: "empty", message: "Enter a ticker symbol." };
	}
	if (!TICKER_SHAPE.test(ticker)) {
		return {
			ok: false,
			reason: "malformed",
			message: `"${raw.trim()}" is not a supported US stock ticker.`,
		};
	}
	return { ok: true, ticker };
}

function toSearchResults(value: unknown): SearchResult[] {
	if (typeof value === "string") {
		try {
			return toSearchResults(JSON.parse(value));
		} catch {
			return [];
		}
	}
	if (!value || typeof value !== "object") return [];
	const results = (value as { results?: unknown }).results;
	return Array.isArray(results) ? (results as SearchResult[]) : [];
}

/** Confirms the symbol against exchange or SEC results found through Tavily. */
async function validateTicker(
	raw: string,
	search: TavilySearch,
): Promise<TickerValidation> {
	const shape = checkTickerShape(raw);
	if (!shape.ok) return shape;

	try {
		const response = await search.invoke({
			query: `US stock ticker ${shape.ticker} company name listed exchange`,
			includeDomains: ["nasdaq.com", "nyse.com", "sec.gov"],
			searchDepth: "basic",
		});
		const match = toSearchResults(response).find((result) => {
			const url = result.url ?? "";
			const content = `${result.title ?? ""} ${result.content ?? ""}`;
			const exactTicker = new RegExp(
				`(^|[^A-Z0-9])${shape.ticker.replace(".", "\\.")}([^A-Z0-9]|$)`,
				"i",
			).test(content);
			const trustedDomain = /(^|\.)((nasdaq|nyse)\.com|sec\.gov)$/i.test(
				new URL(url).hostname,
			);
			return exactTicker && trustedDomain;
		});

		if (!match) {
			return {
				ok: false,
				reason: "not_found",
				message: `Tavily could not confirm ${shape.ticker} as a US-listed stock from Nasdaq, NYSE, or SEC sources.`,
			};
		}

		const name = match.title?.replace(/\s*[|–-].*$/, "").trim() || null;
		return {
			ok: true,
			ticker: shape.ticker,
			name,
			sourceUrl: match.url ?? "",
		};
	} catch {
		return {
			ok: false,
			reason: "lookup_failed",
			message:
				"Tavily ticker verification failed. Check the search API configuration and retry.",
		};
	}
}

export type { TickerValidation };
export { checkTickerShape, normalizeTicker, validateTicker };
