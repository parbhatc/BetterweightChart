import { fetchTradingViewBars } from "./client.mjs";
import { fetchTradingViewBarsReplay } from "./replayClient.mjs";
import { logoUrlFor, searchTradingViewSymbols } from "./search.mjs";
import { chartConfig } from "../fakeBars.mjs";
import { CHART_RESOLUTIONS, isSymbolResolutionSupported, resolutionSec } from "../resolutions.mjs";

/** @type {Map<string, object>} */
const symbolCache = new Map();

/** Symbols where live TV history failed — subsequent requests use replay only. */
/** @type {Set<string>} */
const replayOnlyKeys = new Set();

/** @param {string} symbol @param {string} resolution */
function seriesReplayKey(symbol, resolution) {
  return `${symbol}|${resolution}`;
}

/**
 * @param {object} result
 * @param {number} countBack
 */
function formatHistoryOk(result, countBack) {
  const { bars, symbolInfo, noData, meta } = result;
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
  const resSec = resolutionSec(opts.resolution);
  const cached = symbolCache.get(opts.symbol);
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

  const replayKey = seriesReplayKey(opts.symbol, opts.resolution);
  const useReplayOnly = replayOnlyKeys.has(replayKey);

  /** @param {object} result */
  function rememberSymbol(result) {
    if (result?.symbolInfo) symbolCache.set(opts.symbol, result.symbolInfo);
  }

  try {
    if (!useReplayOnly) {
      const tv = await fetchTradingViewBars(opts.symbol, opts.resolution, countBack, range);
      rememberSymbol(tv);
      if (tv.bars.length) return formatHistoryOk(tv, countBack);

      const replay = await fetchTradingViewBarsReplay(opts.symbol, opts.resolution, countBack, range);
      rememberSymbol(replay);
      if (replay.bars.length) {
        replayOnlyKeys.add(replayKey);
        return formatHistoryOk(replay, countBack);
      }
      return { s: "no_data", bars: [], meta: { ...(tv.meta ?? {}), ...(replay.meta ?? {}), noData: true } };
    }

    const replay = await fetchTradingViewBarsReplay(opts.symbol, opts.resolution, countBack, range);
    rememberSymbol(replay);
    if (replay.bars.length) return formatHistoryOk(replay, countBack);
    return { s: "no_data", bars: [], meta: { ...(replay.meta ?? {}), noData: true, source: "replay" } };
  } catch (err) {
    if (!useReplayOnly) {
      try {
        const replay = await fetchTradingViewBarsReplay(opts.symbol, opts.resolution, countBack, range);
        rememberSymbol(replay);
        if (replay.bars.length) {
          replayOnlyKeys.add(replayKey);
          return formatHistoryOk(replay, countBack);
        }
      } catch {
        // fall through
      }
    }
    return { s: "no_data", bars: [], meta: { error: err?.message ?? String(err) } };
  }
}
