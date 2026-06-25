import { BAR_SEC } from "../constants.js";
import {
  chartDebug,
  chartDebugCount,
  chartDebugForming,
  chartDebugTime,
} from "../../debug/chart/index.js";
import { withPreservedViewport } from "./viewport.js";
import {
  getPaneChartView,
  invalidatePaneChartView,
  patchFormingBarInView,
  rebuildPaneChartView,
  appendNewBarInView,
  prependBarsInView,
  utcBarsForPane,
} from "./viewCache.js";
import { logBarStackSnapshot } from "../../debug/chart/historyPrependDebug.js";

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
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 * @param {{ id: string, sec?: number }[]} resolutions
 * @param {(pane: object) => void} [onPrimaryPane]
 * @param {{ deferSessionBg?: boolean, logicalRange?: { from: number, to: number } }} [opts]
 */
export function refreshPaneCandleData(pane, settingsStore, symbolInfo, resolutions, onPrimaryPane, opts = {}) {
  chartDebugTime("data", `refreshPaneCandleData pane ${pane.index}`, () => {
    invalidatePaneChartView(pane);
    applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions, opts);
    if (!opts.deferSessionBg) pane.sessionBg?.requestRefresh();
    onPrimaryPane?.(pane);
  });
}

/**
 * Prepend older UTC bars via cached view + series.setData.
 * Avoids series.prepend(), which leaves LWC series rows ahead of mapBars/view
 * and shifts overlay indicators until a full resync.
 * @returns {boolean}
 */
export function prependHistoryToPaneSeries(pane, olderUtcBars, settingsStore, symbolInfo, resolutions, opts = {}) {
  return chartDebugTime("data", `prepend pane ${pane.index}`, () => {
    logBarStackSnapshot(pane, "before-prepend", { offered: olderUtcBars.length });

    const batch = prependBarsInView(pane, olderUtcBars, settingsStore, symbolInfo, resolutions);
    if (!batch) {
      chartDebug("data", "prepend skipped (no new bars vs series head)", {
        pane: pane.index,
        offered: olderUtcBars.length,
        seriesBars: pane._chartView?.utcBars?.length ?? pane.bars.length,
      });
      return false;
    }

    const view = pane._chartView;
    if (!view?.seriesData?.length) {
      chartDebug("data", "prepend skipped (empty chart view)", { pane: pane.index });
      return false;
    }

    // LWC may synchronously fire visible-range handlers during setData. Sync pane.bars
    // to the prepended view first so getPaneChartView does not rebuild stale data.
    pane.bars = view.utcBars.slice();
    pane.shiftedBars = view.chartBars;
    pane._shiftedKey = view.utcKey;
    pane.mapBars = view.mapBars;
    pane.timeAdapter = view.timeAdapter;
    delete pane.utcTimeToIdx;
    delete pane.chartTimeToIdx;
    delete pane.timeToIdx;

    try {
      pane.series.setData(view.seriesData);
      chartDebugCount("data", "prepend");
      logBarStackSnapshot(pane, "after-prepend", { added: batch.added });
      chartDebug("data", "prepend history (setData)", {
        pane: pane.index,
        added: batch.added,
        utcBars: view.utcBars.length,
        seriesPoints: pane.series.data?.().length ?? null,
      });
      pane.sessionBg?.requestRefresh();
      return true;
    } catch (err) {
      chartDebugCount("data", "prependFail");
      chartDebug("data", "prepend history failed", { pane: pane.index, err: String(err) });
      invalidatePaneChartView(pane);
      applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions, opts);
      if (!opts.deferSessionBg) pane.sessionBg?.requestRefresh();
      return false;
    }
  });
}

/**
 * Push latest UTC bars to the series via cached chart view.
 */
export function applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions, opts = {}) {
  return chartDebugTime("data", `setData live pane ${pane.index}`, () => {
    if (!pane.bars?.length) return;
    const view = rebuildPaneChartView(pane, settingsStore, symbolInfo, resolutions);
    if (!view.utcBars.length) return;

    pane.timeAdapter = view.timeAdapter;
    delete pane.utcTimeToIdx;
    delete pane.chartTimeToIdx;
    delete pane.timeToIdx;

    const logicalRange = opts.logicalRange;
    const setData = () => {
      pane.series.setData(view.seriesData);
    };

    if (logicalRange && Number.isFinite(logicalRange.from) && Number.isFinite(logicalRange.to)) {
      setData();
      pane.chart.timeScale().setVisibleLogicalRange({
        from: logicalRange.from,
        to: logicalRange.to,
      });
    } else {
      withPreservedViewport(pane.chart, setData, { followUpFrames: 1 });
    }

    chartDebugCount("data", "setData");
    chartDebug("data", "setData live", {
      pane: pane.index,
      bars: view.utcBars.length,
      logicalRange: logicalRange ?? null,
    });
  });
}

/**
 * Upsert one bar on the pane series — update when `time` exists, append when it is new at the tail.
 * @returns {{ ok: boolean, isNewBar: boolean }}
 */
export function upsertBarOnPaneSeries(pane, utcBar, settingsStore, symbolInfo, resolutions) {
  const visible = utcBarsForPane(pane, settingsStore, symbolInfo);
  if (!visible.length) return { ok: false, isNewBar: false };

  const idx = visible.findIndex((b) => b.time === utcBar.time);
  if (idx >= 0 && idx < visible.length - 1) {
    return {
      ok: updateFormingBarOnPaneSeries(pane, utcBar, settingsStore, symbolInfo, resolutions),
      isNewBar: false,
    };
  }

  if (idx === visible.length - 1) {
    const appended = appendNewBarOnPaneSeries(pane, utcBar, settingsStore, symbolInfo, resolutions);
    if (appended) return { ok: true, isNewBar: true };
    return {
      ok: updateFormingBarOnPaneSeries(pane, utcBar, settingsStore, symbolInfo, resolutions),
      isNewBar: false,
    };
  }

  const lastTime = visible.at(-1)?.time;
  if (lastTime == null || utcBar.time <= lastTime) {
    return { ok: false, isNewBar: false };
  }

  return {
    ok: appendNewBarOnPaneSeries(pane, utcBar, settingsStore, symbolInfo, resolutions),
    isNewBar: true,
  };
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
      withPreservedViewport(pane.chart, () => {
        if (batch.prevCandle) pane.series.update(batch.prevCandle, true);
        pane.series.update(batch.newCandle);
      }, { followUpFrames: 2 });
      pane.timeAdapter = pane._chartView?.timeAdapter ?? pane.timeAdapter;
      delete pane.utcTimeToIdx;
      delete pane.chartTimeToIdx;
      delete pane.timeToIdx;
      chartDebugCount("data", "append");
      chartDebug("data", "append bar", {
        pane: pane.index,
        time: utcBar.time,
        close: utcBar.close,
      });
      return true;
    } catch (err) {
      chartDebugCount("data", "appendFail");
      chartDebug("data", "append bar failed", { pane: pane.index, err: String(err) });
      try {
        withPreservedViewport(pane.chart, () => {
          pane.series.setData(pane._chartView.seriesData);
        }, { followUpFrames: 1 });
        pane.timeAdapter = pane._chartView?.timeAdapter ?? pane.timeAdapter;
        delete pane.utcTimeToIdx;
        delete pane.chartTimeToIdx;
        delete pane.timeToIdx;
        chartDebug("data", "append bar recovered via setData", { pane: pane.index });
        return true;
      } catch (fallbackErr) {
        chartDebug("data", "append bar setData fallback failed", {
          pane: pane.index,
          err: String(fallbackErr),
        });
        invalidatePaneChartView(pane);
        return false;
      }
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
      chartDebugForming("update forming", { pane: pane.index, time: bar.time, close: bar.close });
      return true;
    } catch (err) {
      chartDebugCount("data", "updateFail");
      chartDebugForming("update forming failed", { pane: pane.index, err: String(err) });
      return false;
    }
  });
}
