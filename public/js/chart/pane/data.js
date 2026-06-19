import {
  CHART_FUTURE_WHITESPACE_CHUNK,
  CHART_FUTURE_WHITESPACE_MARGIN,
  CHART_FUTURE_WHITESPACE_MAX,
  CHART_FUTURE_WHITESPACE_MIN,
  appendFutureWhitespaceTail,
  isFutureWhitespaceEnabled,
} from "../future/whitespace.js";
import { BAR_SEC } from "../constants.js";
import { chartDebug, chartDebugCount, chartDebugTime } from "../../debug/chart/index.js";
import {
  getPaneChartView,
  invalidatePaneChartView,
  patchFormingBarInView,
  rebuildPaneChartView,
  appendNewBarInView,
  utcBarsForPane,
} from "./viewCache.js";

export { invalidatePaneChartView, utcBarsForPane } from "./viewCache.js";

/**
 * @param {object} pane
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function barSecForPane(pane, resolutions) {
  const fromCfg = resolutions.find((r) => r.id === pane.resolution)?.sec;
  return fromCfg ?? BAR_SEC[pane.resolution] ?? 60;
}

/** @deprecated use utcBarsForPane */
export function barsForPane(pane, settingsStore, symbolInfo) {
  return utcBarsForPane(pane, settingsStore, symbolInfo);
}

/**
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function chartMapBarsForPane(pane, settingsStore, symbolInfo, resolutions) {
  const view = getPaneChartView(pane, settingsStore, symbolInfo, resolutions);
  return {
    timeAdapter: view.timeAdapter,
    bars: view.utcBars,
    mapBars: view.mapBars,
    barSec: view.barSec,
  };
}

/**
 * @param {object} pane
 * @param {object[]} _visible
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function buildChartSeriesForPane(pane, _visible, settingsStore, resolutions) {
  return getPaneChartView(pane, settingsStore, pane.symbolInfo ?? null, resolutions).seriesData;
}

/**
 * @param {object} opts
 */
export function ensureFutureWhitespace(opts) {
  if (opts.futureWhitespaceEnabled === false) return;
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

  if (opts.pane) {
    opts.pane.futureWhitespaceBars = nextHave;
  }

  if (opts.pane && opts.barSec != null && opts.pane._chartView?.mapBars?.length && add > 0) {
    const view = opts.pane._chartView;
    const appended = chartDebugTime("data", `append whitespace +${add}`, () => {
      const tailStart = view.mapBars.length;
      appendFutureWhitespaceTail(view.mapBars, opts.barSec, add);
      appendFutureWhitespaceTail(view.seriesData, opts.barSec, add);
      for (let i = tailStart; i < view.mapBars.length; i += 1) {
        try {
          series.update(view.seriesData[i], true);
        } catch {
          view.mapBars.length = tailStart;
          view.seriesData.length = tailStart;
          return false;
        }
      }
      view.futureWhitespace = nextHave;
      opts.pane.mapBars = view.mapBars;
      return true;
    });
    if (appended) return;
  }

  chartDebugTime("data", `setData whitespace ${visible.length}+${nextHave}`, () => {
    if (opts.pane) invalidatePaneChartView(opts.pane);
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
 * @param {{ deferSessionBg?: boolean }} [opts]
 */
export function refreshPaneCandleData(pane, settingsStore, symbolInfo, resolutions, onPrimaryPane, opts = {}) {
  chartDebugTime("data", `refreshPaneCandleData pane ${pane.index}`, () => {
    invalidatePaneChartView(pane);
    applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions);
    if (!opts.deferSessionBg) pane.sessionBg?.requestRefresh();
    onPrimaryPane?.(pane);
  });
}

/**
 * Push latest UTC bars to the series via cached chart view.
 */
export function applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions) {
  return chartDebugTime("data", `setData live pane ${pane.index}`, () => {
    if (!pane.bars?.length) return;
    const view = rebuildPaneChartView(pane, settingsStore, symbolInfo, resolutions);
    if (!view.utcBars.length) return;

    pane.timeAdapter = view.timeAdapter;
    delete pane.utcTimeToIdx;
    delete pane.chartTimeToIdx;
    delete pane.timeToIdx;
    const sc = settingsStore.get().scales ?? {};
    if (!isFutureWhitespaceEnabled(sc)) {
      pane.futureWhitespaceBars = 0;
    } else if (!pane.futureWhitespaceBars) {
      pane.futureWhitespaceBars = CHART_FUTURE_WHITESPACE_MIN;
    }

    pane.series.setData(view.seriesData);

    chartDebugCount("data", "setData");
    chartDebug("data", "setData live", {
      pane: pane.index,
      bars: view.utcBars.length,
      ws: view.futureWhitespace,
    });
  });
}

/**
 * Append a new closed candle via series.update (no full setData).
 * @returns {boolean}
 */
export function appendNewBarOnPaneSeries(pane, utcBar, settingsStore, symbolInfo, resolutions) {
  return chartDebugTime("data", `append bar pane ${pane.index}`, () => {
    const batch = appendNewBarInView(pane, utcBar, settingsStore, symbolInfo, resolutions);
    if (!batch) return false;

    try {
      if (batch.whitespace.length) {
        pane.series.setData(pane._chartView.seriesData);
      } else {
        if (batch.prevCandle) pane.series.update(batch.prevCandle, true);
        pane.series.update(batch.newCandle);
      }
      pane.timeAdapter = pane._chartView?.timeAdapter ?? pane.timeAdapter;
      delete pane.utcTimeToIdx;
      delete pane.chartTimeToIdx;
      delete pane.timeToIdx;
      chartDebugCount("data", "append");
      chartDebug("data", "append bar", {
        pane: pane.index,
        time: utcBar.time,
        close: utcBar.close,
        ws: batch.whitespace.length,
        mode: batch.whitespace.length ? "setData" : "update",
      });
      return true;
    } catch (err) {
      chartDebugCount("data", "appendFail");
      chartDebug("data", "append bar failed", { pane: pane.index, err: String(err) });
      invalidatePaneChartView(pane);
      return false;
    }
  });
}

/**
 * Patch the forming candle in-place (O(1)) using cached chart view.
 * @returns {boolean}
 */
export function updateFormingBarOnPaneSeries(pane, bar, settingsStore, symbolInfo, resolutions) {
  return chartDebugTime("data", `update forming pane ${pane.index}`, () => {
    const candle = patchFormingBarInView(pane, bar, settingsStore, symbolInfo, resolutions);
    if (!candle) return false;

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
