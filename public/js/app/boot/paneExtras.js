import { renderStatusLine } from "../../chart/status/line.js";
import { getMarketStatusDetails } from "../../chart/market/status.js";
import { precisionFromSettings } from "../../chart/timezone/list.js";
import { isScaleVisible, resolvePriceScalePlacement } from "../../chart/scale/settings.js";
import { rafThrottle, trackChartPanning } from "../../chart/pan/perf.js";
import { timeToBarIndex } from "../../chart/coords/timeScale.js";
import { nearestBarIndex, normalizeHoverBar, resolveUtcBarTime } from "../../chart/pane/hoverBar.js";
import { SessionBackgroundPrimitive } from "../../primitives/session/background.js";
import { attachPriceLineLabelPrimitive } from "../../primitives/priceLineLabel/index.js";
import {
  priceLineBarForPane,
  resolvePriceLineColorForPane,
} from "../symbol/lineStyle.js";
import { chartDebugCount, chartDebugTime } from "../../debug/chart/index.js";
import { isNearHistoryLeftEdge } from "../bar/loader.js";
import {
  buildChartSeriesForPane,
  ensureFutureWhitespace as growFutureWhitespace,
  applyLiveBarToPaneSeries,
} from "../../chart/pane/data.js";
import { CHART_FUTURE_WHITESPACE_MIN, isFutureWhitespaceEnabled } from "../../chart/future/whitespace.js";

/**
 * @param {object} deps
 */
export function createPaneExtras(deps) {
  const {
    settingsStore,
    symbolInfo,
    resolutions,
    barsForPane,
    barSecForPane,
    getLayoutManager,
    getActivePane,
    getAllChartPanes,
    panFps,
    syncLayoutCrosshairFrom,
    applySymbolLineStyleLocal,
    getDrawingHub,
    ui,
    viewportDeps,
    getReplayActive,
  } = deps;

  /** @type {Map<number, object>} */
  const pendingStatusPanes = new Map();

  /** @param {object} pane @param {number} utcTime */
  function statusBarAtTime(pane, utcTime) {
    return pane.timeAdapter?.index.utcBarByUtcTime(utcTime) ?? barsForPane(pane).find((b) => b.time === utcTime);
  }

  /** @param {object} pane @param {object | undefined} bar @param {number} idx */
  function setPaneHoverBar(pane, bar, idx, isActive) {
    if (!bar) {
      pane.hoverBar = undefined;
      pane.hoverPrev = undefined;
      pane.hoverBarIndex = undefined;
      if (isActive) {
        ui.hoverBar = undefined;
        ui.hoverPrev = undefined;
      }
      return false;
    }
    const normalized = normalizeHoverBar(pane, bar, barsForPane) ?? bar;
    const bars = barsForPane(pane);
    const utcTime = resolveUtcBarTime(pane.timeAdapter, normalized.time ?? bar.time);
    const resolvedIdx = nearestBarIndex(bars, utcTime);
    const barChanged = pane.hoverBar?.time !== normalized.time;
    pane.hoverBar = normalized;
    pane.hoverBarIndex = resolvedIdx;
    pane.hoverPrev = resolvedIdx > 0 ? bars[resolvedIdx - 1] : undefined;
    if (isActive) {
      ui.hoverBar = pane.hoverBar;
      ui.hoverPrev = pane.hoverPrev;
      if (barChanged) applySymbolLineStyleLocal();
    }
    return barChanged;
  }

  /** @param {object} pane */
  function refreshPaneStatusLine(pane) {
    if (!pane.statusEl) return;
    if (ui.barsLoading || !pane.bars.length) {
      const main = pane.statusEl.querySelector(".status-line__main");
      if (main) main.innerHTML = "";
      else pane.statusEl.innerHTML = "";
      return;
    }
    const visible = barsForPane(pane);
    const rawBar = pane.hoverBar ?? visible.at(-1);
    const bar = rawBar?.time != null ? (statusBarAtTime(pane, rawBar.time) ?? rawBar) : rawBar;
    const prev =
      pane.hoverBar != null
        ? pane.hoverPrev
        : visible.length > 1
          ? visible.at(-2)
          : undefined;
    renderStatusLine(pane.statusEl, {
      symbol: pane.symbol,
      symbolInfo: pane.symbolInfo,
      resolution: pane.resolution,
      bar,
      prevBar: prev,
      settings: settingsStore.get(),
    });
  }

  function refreshStatusLine() {
    for (const pane of getAllChartPanes()) refreshPaneStatusLine(pane);
  }

  const flushPendingStatusLines = () => {
    for (const pane of pendingStatusPanes.values()) refreshPaneStatusLine(pane);
    pendingStatusPanes.clear();
  };

  const scheduleStatusLine = rafThrottle((/** @type {object} */ pane) => {
    refreshPaneStatusLine(pane);
  });

  /** @param {object} pane */
  function attachSessionBackground(pane) {
    const bg = new SessionBackgroundPrimitive();
    bg.setSettingsProvider(() => settingsStore.get().symbol ?? {});
    bg.setSymbolProvider(() => pane.symbolInfo ?? symbolInfo);
    bg.setContextProvider(() => {
      const view = pane._chartView;
      const ta = view?.timeAdapter ?? pane.timeAdapter;
      return {
        bars: barsForPane(pane),
        barSec: barSecForPane(pane),
        timeAdapter: ta,
      };
    });
    pane.series.attachPrimitive(bg);
    pane.sessionBg = bg;
  }

  /** @param {object} pane */
  function attachPriceLineLabel(pane) {
    pane.priceLineLabel?.destroy();
    pane.priceLineLabel = attachPriceLineLabelPrimitive({
      series: pane.series,
      getState: () => {
        const sc = settingsStore.get().scales ?? {};
        const replayActive = getReplayActive?.() ?? false;
        const enabled = Boolean(sc.countdownToBarClose);
        const { close } = priceLineBarForPane(pane, settingsStore, symbolInfo);
        const precision = precisionFromSettings(settingsStore.get(), pane.symbolInfo ?? symbolInfo);
        const placement = resolvePriceScalePlacement(sc.scalesPlacement);
        const marketOpen = replayActive
          ? false
          : getMarketStatusDetails(pane.symbolInfo ?? symbolInfo).open;
        return {
          enabled,
          marketOpen,
          scaleVisible: isScaleVisible(sc.currencyUnitVisibility),
          lineVisible: Boolean(sc.symbolLabelLine),
          lineWidth: Number(sc.symbolLabelLineWidth) || 1,
          scaleId: placement.left ? "left" : "right",
          barSec: barSecForPane(pane),
          price: close,
          color: resolvePriceLineColorForPane(pane, settingsStore, symbolInfo),
          priceText:
            close == null || !Number.isFinite(close)
              ? ""
              : Number(close).toLocaleString(undefined, {
                  minimumFractionDigits: precision,
                  maximumFractionDigits: precision,
                }),
        };
      },
    });
  }

  /** @param {object} pane @param {import("lightweight-charts").MouseEventParams} param @returns {{ bar: object | undefined, prev: object | undefined, idx: number }} */
  function barFromCrosshairParam(pane, param) {
    const empty = { bar: undefined, prev: undefined, idx: -1 };
    if (!param?.time) return empty;

    const ta = pane.timeAdapter;
    const chartBars = pane._chartView?.chartBars ?? [];
    const barSec = barSecForPane(pane, resolutions);

    const seriesBar = param.seriesData?.get(pane.series);
    const seriesOhlc = seriesBar && "open" in seriesBar ? seriesBar : null;
    if (seriesOhlc?.time != null) {
      const utcTime = ta?.time.toUtc(seriesOhlc.time) ?? seriesOhlc.time;
      const bar = statusBarAtTime(pane, utcTime);
      if (bar) return { bar, prev: undefined, idx: -1 };
    }

    if (ta) {
      let idx = ta.index.chart(param.time);
      if ((idx == null || idx < 0) && chartBars.length) {
        idx = timeToBarIndex(param.time, chartBars, barSec);
      }
      if (idx != null && idx >= 0) {
        const bar = ta.index.utcBar(idx);
        if (bar) return { bar, prev: undefined, idx: -1 };
      }
    }

    return empty;
  }

  /** @param {object} pane @param {import("lightweight-charts").MouseEventParams} param @param {boolean} isActive @returns {boolean} */
  function applyCrosshairBar(pane, param, isActive) {
    if (!param?.time) {
      pane.lastCrosshairChartTime = undefined;
      if (isActive) applySymbolLineStyleLocal();
      return setPaneHoverBar(pane, undefined, -1, isActive);
    }

    pane.lastCrosshairChartTime = param.time;
    const { bar: nextBar, idx } = barFromCrosshairParam(pane, param);
    if (!nextBar) return false;
    return setPaneHoverBar(pane, nextBar, idx, isActive);
  }

  /** @param {object} pane @param {number} chartTime @param {boolean} isActive */
  function refreshHoverBarFromChartTime(pane, chartTime, isActive) {
    if (chartTime == null || !pane.timeAdapter) return;
    applyCrosshairBar(pane, { time: chartTime, seriesData: new Map() }, isActive);
  }

  /** @param {object} pane */
  function wirePaneCrosshair(pane) {
    pane.chart.subscribeCrosshairMove((param) => {
      const isActive = pane.index === (getLayoutManager()?.getActivePaneIndex() ?? 0);

      applyCrosshairBar(pane, param, isActive);

      if (ui.chartPanning) {
        chartDebugCount("crosshair", "skippedPan");
        scheduleStatusLine(pane);
        return;
      }
      chartDebugCount("crosshair", "move");

      if (pane.bars.length) {
        const hub = getDrawingHub?.();
        if (hub?.shouldUseGlobalCrosshair?.()) {
          const ctrl = hub.getController?.(pane.index);
          if (!hub.isCrosshairEcho?.(pane.chart) && !ctrl?.isApplyingCrosshairSync?.()) {
            hub.publishGlobalCrosshairFromLayout(pane, param);
          }
        } else {
          syncLayoutCrosshairFrom(pane.chart, pane.series, param);
        }
      }

      if (isActive && ui.lockCursorByTime && ui.lockedCrosshairTime != null && param?.point) {
        const price = pane.series.coordinateToPrice(param.point.y);
        const chartTime =
          pane.timeAdapter?.time.toChart(ui.lockedCrosshairTime) ?? ui.lockedCrosshairTime;
        if (price != null) pane.chart.setCrosshairPosition(price, chartTime, pane.series);
      }

      if (isActive && !ui.chartPanning) {
        if (param?.point) {
          const p = pane.series.coordinateToPrice(param.point.y);
          ui.crosshairPrice = p != null && Number.isFinite(p) ? p : null;
        } else {
          ui.crosshairPrice = null;
        }
      }

      scheduleStatusLine(pane);
    });
  }

  /** @param {object} pane */
  function wirePanePanPerf(pane) {
    trackChartPanning(pane.el, {
      onStart: () => {
        ui.chartPanning = true;
        panFps.start();
      },
      onEnd: () => {
        ui.chartPanning = false;
        panFps.stop();
        const active = getActivePane();
        const activeIdx = active?.index ?? 0;
        for (const p of getAllChartPanes()) {
          if (p.lastCrosshairChartTime != null) {
            refreshHoverBarFromChartTime(p, p.lastCrosshairChartTime, p.index === activeIdx);
          }
        }
        flushPendingStatusLines();
        if (active) scheduleStatusLine(active);
        if (deferWhitespacePane) {
          const p = deferWhitespacePane;
          deferWhitespacePane = null;
          ensurePaneFutureWhitespace(p);
        }
        const r = pane.chart.timeScale().getVisibleLogicalRange();
        if (
          r &&
          isNearHistoryLeftEdge(r) &&
          !pane._suppressHistoryPrefetch &&
          viewportDeps?.ensureHistoryNearEdge &&
          !pane._loadingHistory &&
          !pane._historyRestorePending
        ) {
          void viewportDeps.ensureHistoryNearEdge(pane);
        }
      },
    });
  }

  /** @type {object | null} */
  let deferWhitespacePane = null;

  /** @param {object} pane */
  function ensurePaneFutureWhitespace(pane) {
    const sc = settingsStore.get().scales ?? {};
    if (!isFutureWhitespaceEnabled(sc)) return;
    const visible = barsForPane(pane);
    growFutureWhitespace({
      chart: pane.chart,
      series: pane.series,
      pane,
      barSec: barSecForPane(pane, resolutions),
      futureWhitespaceEnabled: isFutureWhitespaceEnabled(settingsStore.get().scales),
      barsForChart: () => visible,
      buildChartSeriesForDisplay: (vis) =>
        buildChartSeriesForPane(pane, vis, settingsStore, resolutions),
      getFutureWhitespaceBars: () => pane.futureWhitespaceBars,
      setFutureWhitespaceBars: (n) => {
        const all = getAllChartPanes();
        const multi = all.length > 1;
        if (multi) {
          const maxN = Math.max(
            n,
            ...all.map((p) => p.futureWhitespaceBars ?? CHART_FUTURE_WHITESPACE_MIN),
          );
          for (const p of all) {
            const prev = p.futureWhitespaceBars ?? CHART_FUTURE_WHITESPACE_MIN;
            p.futureWhitespaceBars = maxN;
            if (p.index === 0) viewportDeps?.setPrimaryFutureWhitespace?.(maxN);
            if (p !== pane && p.bars.length && maxN > prev && !ui.barsLoading) {
              applyLiveBarToPaneSeries(p, settingsStore, symbolInfo, resolutions);
            }
          }
          return;
        }
        pane.futureWhitespaceBars = n;
        if (pane.index === 0) viewportDeps?.setPrimaryFutureWhitespace?.(n);
      },
      requestAllSessionBgRefresh: () => {
        for (const p of getAllChartPanes()) p.sessionBg?.requestRefresh();
      },
    });
  }

  /** @param {object} pane */
  function scheduleWhitespaceGrow(pane) {
    const sc = settingsStore.get().scales ?? {};
    if (!isFutureWhitespaceEnabled(sc)) return;
    if (ui.barsLoading || ui.chartPanning) {
      if (ui.chartPanning) deferWhitespacePane = pane;
      return;
    }
    ensurePaneFutureWhitespace(pane);
  }

  /** @param {object} pane */
  function wirePaneViewportHandlers(pane) {
    let growScheduled = false;
    let historyScheduled = false;

    pane.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (ui.barsLoading || pane._loadingHistory || pane._historyRestorePending || pane._suppressHistoryPrefetch) return;
      if (pane.lastCrosshairChartTime != null) {
        const isActive = pane.index === (getLayoutManager()?.getActivePaneIndex() ?? 0);
        refreshHoverBarFromChartTime(pane, pane.lastCrosshairChartTime, isActive);
        scheduleStatusLine(pane);
      }
      chartDebugCount("perf", "visibleRange");
      chartDebugTime("perf", `visibleRangeHandler pane ${pane.index}`, () => {
        if (pane.index === 0 && !pane._suppressHistoryPrefetch) {
          viewportDeps?.maintainLockedRatio?.();
        }

        const r = pane.chart.timeScale().getVisibleLogicalRange();
        if (!r) return;
        const realCount = barsForPane(pane).length;

        if (isNearHistoryLeftEdge(r) && viewportDeps?.ensureHistoryNearEdge) {
          if (!historyScheduled) {
            historyScheduled = true;
            requestAnimationFrame(() => {
              historyScheduled = false;
              if (pane._suppressHistoryPrefetch) return;
              void viewportDeps.ensureHistoryNearEdge(pane);
            });
          }
        }

        if (r.to < realCount - 16) return;

        if (growScheduled) return;
        growScheduled = true;
        requestAnimationFrame(() => {
          growScheduled = false;
          chartDebugTime("whitespace", `ensureFutureWhitespace pane ${pane.index}`, () =>
            scheduleWhitespaceGrow(pane),
          );
        });
      });
    });
  }

  /** @param {object} pane @param {HTMLElement} [statusLineEl] */
  function setupPaneExtras(pane, statusLineEl) {
    if (statusLineEl) pane.statusEl = statusLineEl;
    attachSessionBackground(pane);
    attachPriceLineLabel(pane);
    wirePanePanPerf(pane);
    wirePaneCrosshair(pane);
    wirePaneViewportHandlers(pane);
  }

  return {
    setupPaneExtras,
    refreshPaneStatusLine,
    refreshStatusLine,
    flushPendingStatusLines,
    scheduleStatusLine,
    attachPriceLineLabel,
  };
}
