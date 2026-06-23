/**
 * @typedef {{ symbol: string, bid: number, ask: number, last?: number, spread?: number }} MarketQuote
 */

/**
 * @param {import("./types.js").Datafeed | null | undefined} datafeed
 */
export function datafeedSupportsQuotes(datafeed) {
  return typeof datafeed?.subscribeQuotes === "function";
}

/**
 * @param {import("./types.js").SymbolInfo} symbolInfo
 */
export function quoteSymbolKey(symbolInfo) {
  return String(symbolInfo?.ticker ?? symbolInfo?.name ?? "").trim();
}
