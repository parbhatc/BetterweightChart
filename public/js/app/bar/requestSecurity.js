/**
 * Pine `request.security()`-style bar series resolver (any symbol + resolution).
 * Reuses data in priority order: chart pane → other panes → resolution cache → bar store → datafeed.
 */
import { normalizeResolutionId } from "../../chart/resolutionFormat.js";
import { chartDebug } from "../../debug/chart/index.js";
import { lookupSymbolBars } from "./symbolBarCache.js";
import { ensureHtfBars, getHtfBars, seedHtfBars } from "./htfBarCache.js";

/** @typedef {{ utcBars: object[], chartBars: object[], source: string, symbol: string, resolution: string, barCount: number, sufficient: boolean }} SecuritySeries */

/**
 * Sync lookup — no network. Use chart / pane / cache / bar store when available.
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {string} opts.resolution any resolution id ("1", "15", "60", "D", …)
 * @param {number} [opts.countBack] minimum bars required (0 = any)
 * @param {object} [opts.pane]
 * @param {() => object[]} [opts.getAllChartPanes]
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} [opts.settingsStore]
 * @param {object | null} [opts.symbolInfoExtra]
 * @param {{ id: string, sec?: number }[]} [opts.resolutions]
 * @returns {SecuritySeries | null}
 */
export function lookupSecuritySeries(opts) {
  const symbol = opts.symbol;
  const resolution = normalizeResolutionId(opts.resolution);
  if (!symbol || !resolution) return null;

  const want = Math.max(0, Number(opts.countBack) || 0);
  const hit = lookupSymbolBars({
    symbol,
    resolution,
    pane: opts.pane,
    getAllChartPanes: opts.getAllChartPanes,
    settingsStore: opts.settingsStore,
    symbolInfoExtra: opts.symbolInfoExtra,
    resolutions: opts.resolutions ?? [],
  });

  if (!hit?.utcBars?.length) return null;

  const sufficient = !want || hit.utcBars.length >= want;
  return {
    utcBars: hit.utcBars,
    chartBars: hit.chartBars,
    source: hit.source,
    symbol,
    resolution,
    barCount: hit.utcBars.length,
    sufficient,
  };
}

/**
 * Async resolve — lookup first, fetch only when cache is missing or too short.
 * @param {object} opts
 * @param {import("../../datafeed/types.js").Datafeed} opts.datafeed
 * @param {object} opts.symbolInfo
 * @param {string} opts.symbol
 * @param {string} opts.resolution
 * @param {number} [opts.countBack]
 * @param {object} opts.pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} opts.settingsStore
 * @param {object | null} [opts.symbolInfoExtra]
 * @param {() => object[]} [opts.getAllChartPanes]
 * @param {{ id: string, sec?: number }[]} [opts.resolutions]
 * @returns {Promise<SecuritySeries | null>}
 */
export async function requestSecuritySeries(opts) {
  const symbol = opts.symbol;
  const resolution = normalizeResolutionId(opts.resolution);
  const want = Math.max(50, Math.min(2000, Number(opts.countBack) || 300));

  const hit = lookupSecuritySeries({ ...opts, symbol, resolution, countBack: want });
  if (hit?.sufficient) {
    seedSecurityBars(symbol, resolution, hit.utcBars, hit.chartBars, hit.source);
    chartDebug("data", "request.security cache hit", {
      symbol,
      resolution,
      source: hit.source,
      bars: hit.barCount,
    });
    return hit;
  }

  const entry = await ensureSecurityBars({ ...opts, symbol, resolution, countBack: want });
  if (!entry?.utcBars?.length) return hit;

  return {
    utcBars: entry.utcBars,
    chartBars: entry.chartBars,
    source: hit ? `${hit.source}+datafeed` : "datafeed",
    symbol,
    resolution,
    barCount: entry.utcBars.length,
    sufficient: entry.utcBars.length >= want,
  };
}

/** Publish into shared bar store (any resolution). */
export function seedSecurityBars(symbol, resolution, utcBars, chartBars, source = "seed") {
  return seedHtfBars(symbol, resolution, utcBars, chartBars, source);
}

/** Fetch / ensure bars for any symbol+resolution. */
export function ensureSecurityBars(opts) {
  return ensureHtfBars(opts);
}

/** Read shared bar store. */
export function getSecurityBarsFromStore(symbol, resolution) {
  return getHtfBars(symbol, resolution);
}

/**
 * Overlay / indicator helpers — Pine `request.security(sym, tf, expr)` style access.
 * All methods are plain functions (safe to pass as callbacks without `this`).
 * @param {object} deps
 */
export function createSecurityContext(deps) {
  const {
    pane,
    getAllChartPanes,
    settingsStore,
    datafeed,
    symbolInfo,
    resolutions,
    scheduleFetch,
    scheduleCompareFetch,
  } = deps;

  const baseOpts = () => ({
    pane,
    getAllChartPanes,
    settingsStore,
    symbolInfoExtra: pane.symbolInfo ?? symbolInfo,
    resolutions,
  });

  /** @param {string} [symbol] @param {string} resolution @param {number} [countBack] */
  const lookupSecurity = (symbol, resolution, countBack = 0) => {
    const sym = symbol ?? pane.symbol;
    return lookupSecuritySeries({
      symbol: sym,
      resolution,
      countBack,
      ...baseOpts(),
    });
  };

  /** @param {string} [symbol] @param {string} resolution */
  const getSecurityBars = (symbol, resolution) => {
    const hit = lookupSecurity(symbol, resolution);
    if (!hit) return null;
    return { utcBars: hit.utcBars, chartBars: hit.chartBars, source: hit.source };
  };

  /** Same symbol as chart pane — any resolution. */
  const getBars = (resolution) => getSecurityBars(undefined, resolution);

  /** @param {string} [symbol] @param {string} resolution @param {number} countBack */
  const requestSecurityBars = (symbol, resolution, countBack) => {
    const sym = symbol ?? pane.symbol;
    const resId = normalizeResolutionId(resolution);
    const want = Math.max(50, Number(countBack) || 300);
    const hit = lookupSecuritySeries({
      symbol: sym,
      resolution: resId,
      countBack: want,
      ...baseOpts(),
    });
    if (hit?.sufficient) {
      seedSecurityBars(sym, resId, hit.utcBars, hit.chartBars, hit.source);
      return;
    }
    scheduleFetch(sym, resId, want);
  };

  const requestBars = (resolution, countBack) => requestSecurityBars(undefined, resolution, countBack);

  /** @param {string} symbol @param {string} [resolution] */
  const getCompareBars = (symbol, resolution) => {
    const resId = normalizeResolutionId(resolution ?? pane.resolution);
    return lookupSymbolBars({
      symbol,
      resolution: resId,
      ...baseOpts(),
    });
  };

  const requestCompareBars = (symbol, countBack) => {
    scheduleCompareFetch?.(symbol, pane.resolution, countBack);
  };

  const request = {
    security: (symbol, resolution, countBack = 300) => {
      const sym = symbol ?? pane.symbol;
      const resId = normalizeResolutionId(resolution);
      const hit = lookupSecuritySeries({
        symbol: sym,
        resolution: resId,
        countBack,
        ...baseOpts(),
      });
      if (hit && !hit.sufficient) {
        scheduleFetch(sym, resId, countBack);
      } else if (hit?.sufficient) {
        seedSecurityBars(sym, resId, hit.utcBars, hit.chartBars, hit.source);
      }
      return hit;
    },
  };

  return {
    lookupSecurity,
    getSecurityBars,
    getBars,
    requestSecurityBars,
    requestBars,
    getCompareBars,
    requestCompareBars,
    request,
    /** @deprecated use getBars / getSecurityBars */
    getHtfBars: getBars,
    /** @deprecated use requestBars / requestSecurityBars */
    requestHtfBars: requestBars,
    datafeed,
    chartResolution: pane.resolution ?? null,
    primarySymbol: pane.symbol ?? null,
  };
}

/** @param {string} symbol @param {string} resolution @returns {SecuritySeries | null} */
export function getStoredSecuritySeries(symbol, resolution) {
  const resId = normalizeResolutionId(resolution);
  const entry = getSecurityBarsFromStore(symbol, resId);
  if (!entry?.utcBars?.length) return null;
  return {
    utcBars: entry.utcBars,
    chartBars: entry.chartBars,
    source: "bar-store",
    symbol,
    resolution: resId,
    barCount: entry.utcBars.length,
    sufficient: true,
  };
}
