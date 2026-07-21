import { fetchTradingViewBars, symbolInfoFromResolved } from "./client.mjs";
import { logoUrlFor, searchTradingViewSymbols } from "./search.mjs";
import { normalizeTradingViewSymbol } from "./symbols.mjs";
import { chartConfig } from "../fakeBars.mjs";
import { CHART_RESOLUTIONS, isSymbolResolutionSupported, resolutionSec } from "../resolutions.mjs";
import { csvHistoryBars } from "../csv/history.mjs";

const TRADINGVIEW_DATA_DELAY_MINUTES = 10;

const FALLBACK_SYMBOLS = [
  { symbol: "CME_MINI:NQ1!", ticker: "NQ1!", name: "E-mini Nasdaq-100 Futures", exchange: "CME_MINI", type: "futures" },
  { symbol: "CME_MINI:MNQ1!", ticker: "MNQ1!", name: "Micro E-mini Nasdaq-100 Futures", exchange: "CME_MINI", type: "futures" },
  { symbol: "CME_MINI:ES1!", ticker: "ES1!", name: "E-mini S&P 500 Futures", exchange: "CME_MINI", type: "futures" },
  { symbol: "CME_MINI:MES1!", ticker: "MES1!", name: "Micro E-mini S&P 500 Futures", exchange: "CME_MINI", type: "futures" },
  { symbol: "CBOT_MINI:YM1!", ticker: "YM1!", name: "E-mini Dow Futures", exchange: "CBOT_MINI", type: "futures" },
  { symbol: "CME_MINI:RTY1!", ticker: "RTY1!", name: "E-mini Russell 2000 Futures", exchange: "CME_MINI", type: "futures" },
  { symbol: "NYMEX:CL1!", ticker: "CL1!", name: "Crude Oil Futures", exchange: "NYMEX", type: "futures" },
  { symbol: "COMEX:GC1!", ticker: "GC1!", name: "Gold Futures", exchange: "COMEX", type: "futures" },
];

/** @type {Map<string, object>} */
const symbolCache = new Map();

export function tradingViewDatafeedConfig() {
  const { themes } = chartConfig();
  return {
    supported_resolutions: CHART_RESOLUTIONS.map((r) => r.id),
    resolutions: CHART_RESOLUTIONS,
    default_symbol: "CME_MINI:NQ1!",
    default_resolution: "1",
    exchanges: [],
    symbols_types: [],
    supports_search: true,
    supports_group_request: false,
    supports_quotes: true,
    data_delay_minutes: TRADINGVIEW_DATA_DELAY_MINUTES,
    themes,
  };
}

export function fallbackTradingViewSearch(query, limit = 50) {
  const needle = String(query ?? "").trim().toLowerCase();
  return FALLBACK_SYMBOLS.filter((row) => {
    if (!needle) return true;
    return [row.symbol, row.ticker, row.name, row.exchange]
      .some((value) => value.toLowerCase().includes(needle));
  }).slice(0, Math.max(0, Number(limit) || 0));
}

export async function tradingViewSearch(query, limit = 50) {
  try {
    return await searchTradingViewSymbols(query, limit);
  } catch {
    return fallbackTradingViewSearch(query, limit);
  }
}

export function fallbackTradingViewSymbolInfo(symbol) {
  const sym = normalizeTradingViewSymbol(symbol);
  const known = FALLBACK_SYMBOLS.find((row) => row.symbol === sym);
  return symbolInfoFromResolved(sym, known ? {
    name: known.ticker,
    ticker: known.symbol,
    description: known.name,
    type: known.type,
    exchange: known.exchange,
    listed_exchange: known.exchange,
  } : {});
}

/** @param {string} symbol */
export async function tradingViewResolve(symbol) {
  const sym = normalizeTradingViewSymbol(symbol);
  if (symbolCache.has(sym)) return symbolCache.get(sym);

  let symbolInfo;
  try {
    ({ symbolInfo } = await fetchTradingViewBars(sym, "D", 5));
  } catch {
    symbolInfo = fallbackTradingViewSymbolInfo(sym);
  }
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
  const symbol = normalizeTradingViewSymbol(opts.symbol);
  const countBack = opts.countback ?? 500;
  const resSec = resolutionSec(opts.resolution);
  const cached = symbolCache.get(symbol);
  if (cached && !isSymbolResolutionSupported(cached, opts.resolution)) {
    return {
      s: "no_data",
      bars: [],
      meta: {
        invalidResolution: opts.resolution,
        noData: true,
        reason: "unsupported_resolution",
      },
    };
  }
  /** @type {{ from?: number, to?: number } | null} */
  let range = null;
  if (opts.to != null) {
    const to = Number(opts.to);
    const from = opts.from != null ? Number(opts.from) : to - countBack * resSec;
    range = { from, to };
  }

  try {
    const { bars, symbolInfo, noData, meta } = await fetchTradingViewBars(
      symbol,
      opts.resolution,
      countBack,
      range,
    );
    symbolCache.set(symbol, symbolInfo);

    if (bars.length) {
      return {
        s: "ok",
        t: bars.map((b) => b.time),
        o: bars.map((b) => b.open),
        h: bars.map((b) => b.high),
        l: bars.map((b) => b.low),
        c: bars.map((b) => b.close),
        v: bars.map((b) => b.volume ?? 0),
        meta: { symbolInfo, noData: Boolean(noData) || bars.length < countBack * 0.2, ...meta },
      };
    }

    const csv = csvHistoryBars({
      symbol,
      resolution: opts.resolution,
      countback: countBack,
      from: range?.from,
      to: range?.to,
    });
    if (csv?.bars?.length) {
      const csvBars = csv.bars;
      return {
        s: "ok",
        t: csvBars.map((b) => b.time),
        o: csvBars.map((b) => b.open),
        h: csvBars.map((b) => b.high),
        l: csvBars.map((b) => b.low),
        c: csvBars.map((b) => b.close),
        v: csvBars.map((b) => b.volume ?? 0),
        meta: {
          symbolInfo,
          noData: csvBars.length < countBack * 0.2,
          ...csv.meta,
          tvFallback: meta?.error ?? "no_tv_bars",
        },
      };
    }

    return { s: "no_data", bars: [], meta: meta ?? {} };
  } catch (err) {
    const csv = csvHistoryBars({
      symbol,
      resolution: opts.resolution,
      countback: countBack,
      from: range?.from,
      to: range?.to,
    });
    if (csv?.bars?.length) {
      const csvBars = csv.bars;
      return {
        s: "ok",
        t: csvBars.map((b) => b.time),
        o: csvBars.map((b) => b.open),
        h: csvBars.map((b) => b.high),
        l: csvBars.map((b) => b.low),
        c: csvBars.map((b) => b.close),
        v: csvBars.map((b) => b.volume ?? 0),
        meta: { ...csv.meta, tvError: err?.message ?? String(err) },
      };
    }
    return { s: "no_data", bars: [], meta: { error: err?.message ?? String(err) } };
  }
}
