import { fetchTradingViewBars } from "./client.mjs";
import { logoUrlFor, searchTradingViewSymbols } from "./search.mjs";
import { normalizeTradingViewSymbol } from "./symbols.mjs";
import { chartConfig } from "../fakeBars.mjs";
import { CHART_RESOLUTIONS, isSymbolResolutionSupported, resolutionSec } from "../resolutions.mjs";
import { csvHistoryBars } from "../csv/history.mjs";

const TRADINGVIEW_DATA_DELAY_MINUTES = 10;

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

export async function tradingViewSearch(query, limit = 50) {
  return searchTradingViewSymbols(query, limit);
}

/** @param {string} symbol */
export async function tradingViewResolve(symbol) {
  const sym = normalizeTradingViewSymbol(symbol);
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
