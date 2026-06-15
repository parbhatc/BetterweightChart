import { fetchTradingViewBars } from "./client.mjs";
import { logoUrlFor, searchTradingViewSymbols } from "./search.mjs";
import { chartConfig } from "../fakeBars.mjs";

const RESOLUTIONS = [
  { id: "1", label: "1m", sec: 60 },
  { id: "5", label: "5m", sec: 300 },
  { id: "15", label: "15m", sec: 900 },
  { id: "60", label: "1h", sec: 3600 },
  { id: "D", label: "1D", sec: 86400 },
];

/** @type {Map<string, object>} */
const symbolCache = new Map();

export function tradingViewDatafeedConfig() {
  const { themes } = chartConfig();
  return {
    supported_resolutions: RESOLUTIONS.map((r) => r.id),
    resolutions: RESOLUTIONS,
    default_symbol: "CME_MINI:NQ1!",
    default_resolution: "5",
    exchanges: [],
    symbols_types: [],
    supports_search: true,
    supports_group_request: false,
    themes,
  };
}

export async function tradingViewSearch(query, limit = 50) {
  return searchTradingViewSymbols(query, limit);
}

/** @param {string} symbol */
export async function tradingViewResolve(symbol) {
  const sym = String(symbol || "").trim();
  if (symbolCache.has(sym)) return symbolCache.get(sym);

  const { symbolInfo } = await fetchTradingViewBars(sym, "D", 5);
  symbolCache.set(sym, symbolInfo);
  if (symbolInfo.logoid) symbolInfo.logoUrl = logoUrlFor(symbolInfo.logoid);
  return symbolInfo;
}

/**
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {string} opts.resolution
 * @param {number} [opts.countback]
 * @param {number} [opts.from]
 * @param {number} [opts.to]
 */
export async function tradingViewHistory(opts) {
  const countBack = opts.countback ?? 500;
  const { bars, symbolInfo } = await fetchTradingViewBars(opts.symbol, opts.resolution, countBack);
  symbolCache.set(opts.symbol, symbolInfo);

  let out = bars;
  if (opts.to != null) out = out.filter((b) => b.time <= opts.to);
  if (opts.from != null) out = out.filter((b) => b.time >= opts.from);

  if (!out.length) return { s: "no_data", bars: [] };
  return {
    s: "ok",
    t: out.map((b) => b.time),
    o: out.map((b) => b.open),
    h: out.map((b) => b.high),
    l: out.map((b) => b.low),
    c: out.map((b) => b.close),
    v: out.map((b) => b.volume ?? 0),
    meta: { symbolInfo },
  };
}
