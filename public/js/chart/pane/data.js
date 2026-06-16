import { barIndex } from "../view/index.js";
import { buildCandleSeriesData } from "../bar/data.js";
import {
  CHART_FUTURE_WHITESPACE_CHUNK,
  CHART_FUTURE_WHITESPACE_MARGIN,
  CHART_FUTURE_WHITESPACE_MAX,
  CHART_FUTURE_WHITESPACE_MIN,
  appendFutureWhitespaceTail,
  withFutureWhitespace,
} from "../future/whitespace.js";
import { isElectronicSession } from "../../primitives/session/background.js";
import { resolveTimezone } from "../timezone/list.js";
import { chartTimeZoneForPane, shiftBarsToChartTime, utcToChartTime } from "../timezone/chartTime.js";
import { BAR_SEC } from "../constants.js";
import { chartDebug, chartDebugCount, chartDebugTime } from "../../debug/chart/index.js";

/**
 * Bars shown on chart + whitespace extension — must match series.setData for X mapping.
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function chartMapBarsForPane(pane, settingsStore, symbolInfo, resolutions) {
  const bars = barsForPane(pane, settingsStore, symbolInfo);
  const barSec = barSecForPane(pane, resolutions);
  return {
    bars,
    mapBars: pane.mapBars ?? [],
    barSec,
  };
}

/**
 * @param {object} pane
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function barSecForPane(pane, resolutions) {
  const fromCfg = resolutions.find((r) => r.id === pane.resolution)?.sec;
  return fromCfg ?? BAR_SEC[pane.resolution] ?? 60;
}

/**
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 */
export function barsForPane(pane, settingsStore, symbolInfo) {
  const sym = settingsStore.get().symbol ?? {};
  const tz = resolveTimezone(sym.timezone, pane.symbolInfo ?? symbolInfo);
  if (sym.session === "regular") {
    return pane.bars.filter((b) => !isElectronicSession(b.time, tz, pane.symbolInfo?.type ?? symbolInfo?.type));
  }
  return pane.bars;
}

/** @param {object} pane @param {object[]} visible @param {string} tz */
function ensureShiftedBars(pane, visible, tz) {
  const utc0 = visible[0]?.time;
  const utcN = visible.at(-1)?.time;
  const key = `${visible.length}|${utc0}|${utcN}|${tz}`;
  if (pane._shiftedKey === key && pane.shiftedBars?.length === visible.length) {
    return pane.shiftedBars;
  }
  const shifted = shiftBarsToChartTime(visible, tz);
  pane.shiftedBars = shifted;
  pane._shiftedKey = key;
  return shifted;
}

/**
 * @param {object} pane
 * @param {object[]} visible
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function buildChartSeriesForPane(pane, visible, settingsStore, resolutions) {
  const sym = settingsStore.get().symbol ?? {};
  const tz = chartTimeZoneForPane(pane, settingsStore, pane.symbolInfo ?? null);
  const shifted = ensureShiftedBars(pane, visible, tz);
  const candles = buildCandleSeriesData(shifted, sym);
  const barSec = barSecForPane(pane, resolutions);
  const ws = pane.futureWhitespaceBars ?? CHART_FUTURE_WHITESPACE_MIN;
  const seriesData = withFutureWhitespace(candles, barSec, ws);
  pane.mapBars = withFutureWhitespace(shifted, barSec, ws);
  return seriesData;
}

/**
 * @param {object} opts
 */
export function ensureFutureWhitespace(opts) {
  const {
    chart,
    series,
    barsForChart,
    buildChartSeriesForDisplay,
    getFutureWhitespaceBars,
    setFutureWhitespaceBars,
    requestAllSessionBgRefresh,
  } = opts;

  const visible = barsForChart();
  if (!visible.length) return;
  const r = chart.timeScale().getVisibleLogicalRange();
  if (!r || r.to == null || !Number.isFinite(r.to)) return;
  const realCount = visible.length;
  const have = getFutureWhitespaceBars() ?? CHART_FUTURE_WHITESPACE_MIN;
  if (r.to < realCount - 16) return;
  const neededAhead = Math.ceil(r.to) - realCount + CHART_FUTURE_WHITESPACE_MARGIN;
  if (neededAhead <= have) return;
  const nextHave = Math.min(
    CHART_FUTURE_WHITESPACE_MAX,
    Math.max(neededAhead, have + CHART_FUTURE_WHITESPACE_CHUNK),
  );
  chartDebug("whitespace", "grow", { have, nextHave, neededAhead, realCount, rangeTo: r.to });
  setFutureWhitespaceBars(nextHave);
  const add = nextHave - have;

  if (opts.pane && opts.barSec != null && opts.pane.mapBars?.length && add > 0) {
    const appended = chartDebugTime("data", `append whitespace +${add}`, () => {
      const tailStart = opts.pane.mapBars.length;
      appendFutureWhitespaceTail(opts.pane.mapBars, opts.barSec, add);
      for (let i = tailStart; i < opts.pane.mapBars.length; i += 1) {
        try {
          series.update(opts.pane.mapBars[i], true);
        } catch {
          opts.pane.mapBars.length = tailStart;
          return false;
        }
      }
      return true;
    });
    if (appended) return;
  }

  chartDebugTime("data", `setData whitespace ${visible.length}+${nextHave}`, () => {
    series.setData(buildChartSeriesForDisplay(visible));
  });
  requestAllSessionBgRefresh();
}

/**
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 * @param {{ id: string, sec?: number }[]} resolutions
 * @param {(pane: object) => void} [onPrimaryPane]
 */
export function refreshPaneCandleData(pane, settingsStore, symbolInfo, resolutions, onPrimaryPane) {
  chartDebugTime("data", `refreshPaneCandleData pane ${pane.index}`, () => {
    applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions);
    pane.sessionBg?.requestRefresh();
    onPrimaryPane?.(pane);
  });
}

/**
 * Push latest pane.bars to the series (includes future whitespace).
 * Used when a new bar is added or a fast-path update is not possible.
 */
export function applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions) {
  return chartDebugTime("data", `setData live pane ${pane.index}`, () => {
    if (!pane.bars?.length) return;
    const visible = barsForPane(pane, settingsStore, symbolInfo);
    if (!visible.length) return;
    const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfo);
    const shifted = ensureShiftedBars(pane, visible, tz);
    pane.timeToIdx = barIndex(shifted);
    if (pane.futureWhitespaceBars == null) pane.futureWhitespaceBars = CHART_FUTURE_WHITESPACE_MIN;
    const ws = pane.futureWhitespaceBars;
    pane.series.setData(buildChartSeriesForPane(pane, visible, settingsStore, resolutions));
    chartDebugCount("data", "setData");
    chartDebug("data", "setData live", { pane: pane.index, bars: visible.length, ws });
  });
}

/**
 * Patch the forming candle in-place (O(1)) while future whitespace trails the series.
 * @returns {boolean} false when caller should fall back to applyLiveBarToPaneSeries
 */
export function updateFormingBarOnPaneSeries(pane, bar, settingsStore, symbolInfo) {
  return chartDebugTime("data", `update forming pane ${pane.index}`, () => {
    const sym = settingsStore.get().symbol ?? {};
    const visible = barsForPane(pane, settingsStore, symbolInfo);
    const idx = visible.findIndex((b) => b.time === bar.time);
    if (idx < 0) return false;

    const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfo);
    const context = visible.slice(Math.max(0, idx - 1), idx + 1);
    const candle = buildCandleSeriesData(context, sym).at(-1);
    if (!candle) return false;
    candle.time = utcToChartTime(bar.time, tz);

    try {
      pane.series.update(candle, true);
      chartDebugCount("data", "update");
      chartDebug("data", "update forming", { pane: pane.index, time: bar.time, close: bar.close });
      return true;
    } catch (err) {
      chartDebugCount("data", "updateFail");
      chartDebug("data", "update forming failed", { pane: pane.index, err: String(err) });
      return false;
    }
  });
}
