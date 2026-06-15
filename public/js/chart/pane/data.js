import { barIndex } from "../view/index.js";
import { buildCandleSeriesData } from "../bar/data.js";
import {
  CHART_FUTURE_WHITESPACE_CHUNK,
  CHART_FUTURE_WHITESPACE_MARGIN,
  CHART_FUTURE_WHITESPACE_MAX,
  CHART_FUTURE_WHITESPACE_MIN,
  withFutureWhitespace,
} from "../future/whitespace.js";
import { isElectronicSession } from "../../primitives/session/background.js";
import { resolveTimezone } from "../timezone/list.js";
import { BAR_SEC } from "../constants.js";
import { chartDebug, chartDebugTime } from "../../debug/chart/index.js";

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
  const ws = pane.futureWhitespaceBars ?? CHART_FUTURE_WHITESPACE_MIN;
  return {
    bars,
    mapBars: withFutureWhitespace(bars, barSec, ws),
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

/**
 * @param {object} pane
 * @param {object[]} visible
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function buildChartSeriesForPane(pane, visible, settingsStore, resolutions) {
  const sym = settingsStore.get().symbol ?? {};
  const candles = buildCandleSeriesData(visible, sym);
  const ws = pane.futureWhitespaceBars ?? CHART_FUTURE_WHITESPACE_MIN;
  return withFutureWhitespace(candles, barSecForPane(pane, resolutions), ws);
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
  // Only grow data when the viewport extends into future space — not while panning history.
  if (r.to < realCount - 16) return;
  const neededAhead = Math.ceil(r.to) - realCount + CHART_FUTURE_WHITESPACE_MARGIN;
  if (neededAhead <= have) return;
  const nextHave = Math.min(
    CHART_FUTURE_WHITESPACE_MAX,
    Math.max(neededAhead, have + CHART_FUTURE_WHITESPACE_CHUNK),
  );
  chartDebug("whitespace", "grow", { have, nextHave, neededAhead, realCount, rangeTo: r.to });
  setFutureWhitespaceBars(nextHave);
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
    const visible = barsForPane(pane, settingsStore, symbolInfo);
    pane.timeToIdx = barIndex(visible);
    if (pane.futureWhitespaceBars == null) pane.futureWhitespaceBars = CHART_FUTURE_WHITESPACE_MIN;
    pane.series.setData(buildChartSeriesForPane(pane, visible, settingsStore, resolutions));
    pane.sessionBg?.requestRefresh();
    onPrimaryPane?.(pane);
  });
}
