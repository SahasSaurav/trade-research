/**
 * Pure helpers for reading Yahoo Finance payloads.
 *
 * Yahoo's types carry `[key: string]: any`, so every field is read through a
 * guard here rather than trusted: a missing or non-numeric value becomes null
 * and prints as n/a, never as 0. Nothing in this file touches the network — the
 * tool definitions in `tool.ts` own the calls, these own the interpretation, so
 * the coercion and the failure text stay testable without a request.
 */

import { errorMessage } from "@src/utils/errors.js";
import { unavailable } from "@src/utils/yahoo/format.js";
import { z } from "zod";

/** The ticker argument every Yahoo tool takes, declared once. */
const TICKER = z
	.string()
	.describe("Ticker symbol of the company under analysis, e.g. AAPL.");

/** The canonical quote page, so a value taken from a tool is still citable. */
function quotePageUrl(ticker: string, path = ""): string {
	return `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}${path}`;
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function asDate(value: unknown): Date | null {
	if (value instanceof Date) return value;
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
}

/**
 * Yahoo answers an unknown symbol with "Quote not found" or "No data found".
 * Those are the symbol's problem, not the vendor's, and the agents should hear
 * that distinction so they do not retry a delisted ticker.
 */
function isUnknownSymbol(message: string): boolean {
	return /quote not found|no data found|delisted|not found/i.test(message);
}

/** What a tool returns when a Yahoo call fails: a sentinel, never a throw. */
function failure(toolName: string, error: unknown): string {
	const message = errorMessage(error);
	if (isUnknownSymbol(message)) {
		return `NO_DATA_AVAILABLE: ${toolName} found no Yahoo Finance data for this symbol (${message}). The symbol may be invalid or delisted. Do not estimate or fabricate values — report the data as unavailable.`;
	}
	return unavailable(toolName, message);
}

/** Company identity block, repeated so every artifact can name the issuer. */
function identityRows(quote: Record<string, unknown>): [string, string][] {
	return [
		["Name", asString(quote.longName) ?? asString(quote.shortName)],
		["Symbol", asString(quote.symbol)],
		["Exchange", asString(quote.fullExchangeName) ?? asString(quote.exchange)],
		["Quote type", asString(quote.quoteType)],
		["Currency", asString(quote.currency)],
		["Market state", asString(quote.marketState)],
	]
		.filter((row): row is [string, string] => row[1] !== null)
		.map(([label, value]) => [label, value as string]);
}

function dayRange(quote: Record<string, unknown>): string | null {
	const low = asNumber(quote.regularMarketDayLow);
	const high = asNumber(quote.regularMarketDayHigh);
	if (low === null || high === null) return null;
	return `${low.toFixed(2)} – ${high.toFixed(2)}`;
}

function range(low: unknown, high: unknown): string | null {
	const l = asNumber(low);
	const h = asNumber(high);
	if (l === null || h === null) return null;
	return `${l.toFixed(2)} – ${h.toFixed(2)}`;
}

export {
	asDate,
	asNumber,
	asString,
	dayRange,
	failure,
	identityRows,
	quotePageUrl,
	range,
	TICKER,
};
