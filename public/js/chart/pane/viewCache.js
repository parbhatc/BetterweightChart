import { buildCandleSeriesData } from "../bar/data.js";
import { CHART_FUTURE_WHITESPACE_MIN, futureWhitespaceBarCount, isFutureWhitespaceEnabled, withFutureWhitespace } from "../future/whitespace.js";
import { isElectronicSession } from "../../primitives/session/background.js";
import { shiftBarsToChartTime, chartTimeZoneForPane } from "../timezone/chartTime.js";
import { resolveTimezone } from "../timezone/list.js";
import { createTimeAdapter } from "../time/timeAdapter.js";
import { BAR_SEC } from "../constants.js";

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
export function rebuildPaneChartView(pane, settingsStore, symbolInfo, resolutions) {
  const sym = settingsStore.get().symbol ?? {};
  const sc = settingsStore.get().scales ?? {};
  const session = sym.session ?? "electronic";
  const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfo);
  const utcBars = utcBarsForPane(pane, settingsStore, symbolInfo);
  const key = utcBarsKey(utcBars, session);
  const barSec = barSecForPane(pane, resolutions);
  const wsEnabled = isFutureWhitespaceEnabled(sc);
  const ws = futureWhitespaceBarCount(pane, sc);

  const chartBars = shiftBarsToChartTime(utcBars, tz);
  const mapBars = withFutureWhitespace(chartBars, barSec, ws);
  const seriesData = withFutureWhitespace(buildCandleSeriesData(chartBars, sym), barSec, ws);
  const timeAdapter = createTimeAdapter({ utcBars, chartBars, mapBars, barSec });

  const view = {
    timezone: tz,
    utcKey: key,
    session,
    utcBars,
    chartBars,
    mapBars,
    seriesData,
    barSec,
    futureWhitespace: ws,
    futureWhitespaceEnabled: wsEnabled,
    timeAdapter,
  };

  pane._chartView = view;
  pane.mapBars = mapBars;
  pane.shiftedBars = chartBars;
  pane._shiftedKey = key;
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
  const sc = settingsStore.get().scales ?? {};
  const session = sym.session ?? "electronic";
  const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfo);
  const utcBars = utcBarsForPane(pane, settingsStore, symbolInfo);
  const key = utcBarsKey(utcBars, session);
  const wsEnabled = isFutureWhitespaceEnabled(sc);
  const ws = futureWhitespaceBarCount(pane, sc);
  const view = pane._chartView;
  if (
    view &&
    view.timezone === tz &&
    view.utcKey === key &&
    view.futureWhitespace === ws &&
    view.futureWhitespaceEnabled === wsEnabled
  ) {
    return view;
  }
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
  return buildCandleSeriesData([chartBar], sym)[0] ?? null;
}
