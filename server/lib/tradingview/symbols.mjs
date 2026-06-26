/**
 * Map short / fake-feed tickers to TradingView continuous futures symbols.
 * Bare "NQ" resolves on TV to unrelated seed symbols without intraday data.
 */
const TV_SYMBOL_ALIASES = {
  NQ: "CME_MINI:NQ1!",
  MNQ: "CME_MINI:MNQ1!",
  ES: "CME_MINI:ES1!",
  MES: "CME_MINI:MES1!",
  YM: "CBOT_MINI:YM1!",
  RTY: "CME_MINI:RTY1!",
  CL: "NYMEX:CL1!",
  GC: "COMEX:GC1!",
};

/**
 * @param {string | null | undefined} symbol
 * @returns {string}
 */
export function normalizeTradingViewSymbol(symbol) {
  const raw = String(symbol ?? "").trim();
  if (!raw) return "CME_MINI:NQ1!";
  if (raw.includes(":")) return raw;
  const upper = raw.toUpperCase();
  return TV_SYMBOL_ALIASES[upper] ?? raw;
}
