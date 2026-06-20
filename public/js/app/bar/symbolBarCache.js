import { getPaneChartView } from "../../chart/pane/viewCache.js";
import { shiftBarsToChartTime, chartTimeZoneForPane } from "../../chart/timezone/chartTime.js";
import { getResolutionCacheBars } from "./resolutionCache.js";
import { getHtfBars } from "./htfBarCache.js";
import { requestSecuritySeries } from "./requestSecurity.js";

/** @param {string} symbol */
function symbolLookupKeys(symbol) {
  const keys = [symbol];
  const colon = symbol.indexOf(":");
  if (colon >= 0) keys.push(symbol.slice(colon + 1));
  return keys;
}

/** @param {string} a @param {string} b */
function symbolsMatch(a, b) {
  if (a === b) return true;
  const bare = (s) => (s.includes(":") ? s.slice(s.indexOf(":") + 1) : s);
  return bare(a).toUpperCase() === bare(b).toUpperCase();
}

/**
 * Sync lookup for symbol bars: active pane → any pane → resolution cache → HTF store.
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {string} opts.resolution
 * @param {object} [opts.pane]
 * @param {() => object[]} [opts.getAllChartPanes]
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} [opts.settingsStore]
 * @param {object | null} [opts.symbolInfoExtra]
 * @returns {{ utcBars: object[], chartBars: object[], source: string } | null}
 */
export function lookupSymbolBars(opts) {
  const { symbol, resolution, pane, getAllChartPanes, settingsStore, symbolInfoExtra } = opts;
  if (!symbol || !resolution) return null;

  const panes = getAllChartPanes?.() ?? (pane ? [pane] : []);
  const resolutions = opts.resolutions ?? [];
  for (const p of panes) {
    if (!symbolsMatch(p.symbol, symbol) || p.resolution !== resolution || !p.bars?.length) continue;
    if (!settingsStore) continue;
    const view = getPaneChartView(p, settingsStore, p.symbolInfo ?? symbolInfoExtra, resolutions);
    if (!view.utcBars.length) continue;
    return { utcBars: view.utcBars, chartBars: view.chartBars, source: `pane:${p.index}` };
  }

  const cached = symbolLookupKeys(symbol)
    .map((sym) => getResolutionCacheBars(sym, resolution))
    .find((bars) => bars?.length);
  if (cached?.length && settingsStore && pane) {
    const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfoExtra);
    const chartBars = shiftBarsToChartTime(cached, tz);
    return { utcBars: cached, chartBars, source: "resolution-cache" };
  }

  const stored = symbolLookupKeys(symbol)
    .map((sym) => getHtfBars(sym, resolution))
    .find((entry) => entry?.utcBars?.length);
  if (stored?.utcBars?.length) {
    return {
      utcBars: stored.utcBars,
      chartBars: stored.chartBars,
      source: "htf-store",
    };
  }

  return null;
}

/**
 * Ensure bars for any symbol+resolution (reuses resolution cache, then datafeed).
 * @param {object} opts
 */
export async function ensureSymbolBars(opts) {
  const series = await requestSecuritySeries(opts);
  if (!series) return null;
  return {
    utcBars: series.utcBars,
    chartBars: series.chartBars,
    source: series.source,
  };
}
