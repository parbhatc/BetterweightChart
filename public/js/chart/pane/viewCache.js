import { buildCandleSeriesData, buildCandleBarEntry } from "../bar/data.js";
import { isElectronicSession } from "../../primitives/session/background.js";
import { chartTimeZoneForPane } from "../timezone/chartTime.js";
import { resolveTimezone } from "../timezone/list.js";
import { createTimeAdapter } from "../time/timeAdapter.js";
import { BAR_SEC } from "../constants.js";
import { logChartViewResolve } from "../../debug/chart/historyPrependDebug.js";

/** @param {object} pane @param {{ id: string, sec?: number }[]} resolutions */
function barSecForPane(pane, resolutions) {
  const fromCfg = resolutions.find((r) => r.id === pane.resolution)?.sec;
  return fromCfg ?? BAR_SEC[pane.resolution] ?? 60;
}

/** @param {object[]} bars @param {string} session */
function utcBarsKey(bars, session) {
  if (!bars.length) return `0|${session}`;
  return `${bars.length}|${bars[0].time}|${bars.at(-1).time}|${session}`;
}

/**
 * Visible UTC bars (session filter only — no timezone shift).
 * @param {object} pane
 * @param {object} settingsStore
 * @param {object | null} symbolInfo
 */
export function utcBarsForPane(pane, settingsStore, symbolInfo) {
  const sym = settingsStore.get().symbol ?? {};
  const tz = resolveTimezone(sym.timezone, pane.symbolInfo ?? symbolInfo);
  if (sym.session === "regular") {
    return pane.bars.filter(
      (b) => !isElectronicSession(b.time, tz, pane.symbolInfo?.type ?? symbolInfo?.type),
    );
  }
  return pane.bars;
}

/** @param {object} pane */
export function invalidatePaneChartView(pane) {
  pane._chartView = null;
  pane.mapBars = null;
  pane.shiftedBars = null;
  pane._shiftedKey = null;
}

/**
 * Rebuild chart view layer (shifted times + series payload). Call only on data/tz/session change.
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function rebuildPaneChartView(pane, settingsStore, symbolInfo, resolutions, utcBarsOverride) {
  const sym = settingsStore.get().symbol ?? {};
  const session = sym.session ?? "electronic";
  const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfo);
  const utcBars = (utcBarsOverride ?? utcBarsForPane(pane, settingsStore, symbolInfo)).slice();
  const key = utcBarsKey(utcBars, session);
  const barSec = barSecForPane(pane, resolutions);

  const chartBars = utcBars;
  const mapBars = chartBars.map((b) => ({ time: b.time }));
  const seriesData = buildCandleSeriesData(utcBars, sym);
  const timeAdapter = createTimeAdapter({ utcBars, chartBars, mapBars, barSec });

  const view = {
    timezone: tz,
    resolution: pane.resolution ?? null,
    utcKey: key,
    session,
    utcBars,
    chartBars,
    mapBars,
    seriesData,
    barSec,
    timeAdapter,
  };

  pane._chartView = view;
  pane.mapBars = mapBars;
  pane.shiftedBars = chartBars;
  pane._shiftedKey = key;
  logChartViewResolve(pane, "rebuild", {
    paneBars: pane.bars?.length ?? 0,
    viewBars: utcBars.length,
    utcKey: key,
  });
  return view;
}

/**
 * Cached chart view; rebuilds only when cache is missing or stale.
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function getPaneChartView(pane, settingsStore, symbolInfo, resolutions) {
  const sym = settingsStore.get().symbol ?? {};
  const session = sym.session ?? "electronic";
  const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfo);
  const utcBars = utcBarsForPane(pane, settingsStore, symbolInfo);
  const key = utcBarsKey(utcBars, session);
  const view = pane._chartView;
  const viewAheadOfPane =
    Boolean(pane._historyRestorePending && view?.utcBars?.length && view.utcBars.length > utcBars.length);
  const resolution = pane.resolution ?? null;
  if (
    view &&
    view.timezone === tz &&
    view.resolution === resolution &&
    (view.utcKey === key || viewAheadOfPane)
  ) {
    logChartViewResolve(pane, viewAheadOfPane ? "keep-ahead" : "hit", {
      paneBars: utcBars.length,
      viewBars: view.utcBars.length,
      utcKey: key,
      viewKey: view.utcKey,
    });
    return view;
  }
  logChartViewResolve(pane, "rebuild", {
    paneBars: utcBars.length,
    viewBars: view?.utcBars?.length ?? 0,
    utcKey: key,
    viewKey: view?.utcKey ?? null,
    reason: "key-mismatch",
  });
  return rebuildPaneChartView(pane, settingsStore, symbolInfo, resolutions);
}

/**
 * Patch forming bar OHLC in cached view (no time remap).
 * @returns {object | null} candle for series.update
 */
export function patchFormingBarInView(pane, utcBar, settingsStore, symbolInfo, resolutions) {
  const view = getPaneChartView(pane, settingsStore, symbolInfo, resolutions);
  const idx = view.utcBars.findIndex((b) => b.time === utcBar.time);
  if (idx < 0) return null;

  view.utcBars[idx] = utcBar;
  const paneIdx = pane.bars.findIndex((b) => b.time === utcBar.time);
  if (paneIdx >= 0) pane.bars[paneIdx] = utcBar;
  const chartBar = {
    ...view.chartBars[idx],
    open: utcBar.open,
    high: utcBar.high,
    low: utcBar.low,
    close: utcBar.close,
    volume: utcBar.volume,
  };
  view.chartBars[idx] = chartBar;

  const sym = settingsStore.get().symbol ?? {};
  const prevUtcBar = idx > 0 ? view.utcBars[idx - 1] : undefined;
  const candle = buildCandleBarEntry(chartBar, prevUtcBar, sym);
  if (candle && view.seriesData[idx] != null) {
    view.seriesData[idx] = candle;
  }
  return candle;
}

/**
 * Extend cached view by one real bar (O(1) — avoids full setData on new candle).
 * @returns {{ newCandle: object, prevCandle: object | null } | null}
 */
export function appendNewBarInView(pane, utcBar, settingsStore, symbolInfo, resolutions) {
  const sym = settingsStore.get().symbol ?? {};
  const session = sym.session ?? "electronic";
  const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfo);
  ensurePaneChartViewStackAligned(pane, settingsStore, symbolInfo, resolutions);
  const allUtc = utcBarsForPane(pane, settingsStore, symbolInfo);
  if (allUtc.at(-1)?.time !== utcBar.time) return null;

  const prevUtcOnly = allUtc.slice(0, -1);
  const prevUtc = prevUtcOnly.at(-1);
  if (!prevUtc || utcBar.time <= prevUtc.time) return null;

  const tailKey = utcBarsKey(prevUtcOnly, session);
  let view = pane._chartView;
  if (
    !view?.utcBars?.length ||
    view.timezone !== tz ||
    view.session !== session ||
    view.utcKey !== tailKey
  ) {
    view = rebuildPaneChartView(pane, settingsStore, symbolInfo, resolutions, prevUtcOnly);
  }
  if (view.utcBars.length !== prevUtcOnly.length) return null;

  view.utcBars.push(utcBar);
  const chartBar = utcBar;
  view.chartBars.push(chartBar);

  const candles = buildCandleSeriesData(view.utcBars, sym);
  const newCandle = candles[candles.length - 1];
  const prevCandle = candles.length >= 2 ? candles[candles.length - 2] : null;

  view.seriesData.push(newCandle);
  view.mapBars.push({ time: chartBar.time });

  view.utcKey = utcBarsKey(allUtc, session);
  pane.mapBars = view.mapBars;
  pane.shiftedBars = view.chartBars;
  pane._shiftedKey = view.utcKey;
  view.timeAdapter = createTimeAdapter({
    utcBars: view.utcBars,
    chartBars: view.chartBars,
    mapBars: view.mapBars,
    barSec: view.barSec,
  });

  return { newCandle, prevCandle };
}

/**
 * Rebuild cached chart view when utc/map/series stacks diverge or drift from pane.bars.
 * @returns {boolean} true when the view was rebuilt
 */
export function ensurePaneChartViewStackAligned(pane, settingsStore, symbolInfo, resolutions) {
  const view = pane._chartView;
  if (!view?.utcBars?.length) return false;

  const n = view.utcBars.length;
  const stacksMatch = view.mapBars?.length === n && view.seriesData?.length === n;
  const paneLen = utcBarsForPane(pane, settingsStore, symbolInfo).length;
  if (stacksMatch && paneLen === n) return false;

  invalidatePaneChartView(pane);
  rebuildPaneChartView(pane, settingsStore, symbolInfo, resolutions);
  return true;
}

/**
 * Extend cached view at the head with older UTC bars (O(n) on prepended chunk only).
 * @returns {{ candles: object[], added: number } | null}
 */
export function prependBarsInView(pane, olderUtcBars, settingsStore, symbolInfo, resolutions) {
  if (!olderUtcBars.length) return null;

  ensurePaneChartViewStackAligned(pane, settingsStore, symbolInfo, resolutions);

  const view = getPaneChartView(pane, settingsStore, symbolInfo, resolutions);
  if (!view.utcBars.length) return null;

  const sym = settingsStore.get().symbol ?? {};
  const session = sym.session ?? "electronic";
  const firstTime = view.utcBars[0].time;
  const filtered = olderUtcBars.filter((b) => b.time < firstTime);
  if (!filtered.length) return null;

  const newCandles = buildCandleSeriesData(filtered, sym);

  view.utcBars = filtered.concat(view.utcBars);
  view.chartBars = filtered.concat(view.chartBars);
  view.mapBars = filtered.map((b) => ({ time: b.time })).concat(view.mapBars);
  view.seriesData = newCandles.concat(view.seriesData);
  view.utcKey = utcBarsKey(view.utcBars, session);
  view.timeAdapter = createTimeAdapter({
    utcBars: view.utcBars,
    chartBars: view.chartBars,
    mapBars: view.mapBars,
    barSec: view.barSec,
  });

  pane._chartView = view;
  pane.mapBars = view.mapBars;
  pane.shiftedBars = view.chartBars;
  pane._shiftedKey = view.utcKey;
  pane.timeAdapter = view.timeAdapter;

  return { candles: newCandles, added: filtered.length };
}
