import { renderStatusLine } from "../../chart/status/line.js";
import { precisionFromSettings } from "../../chart/timezone/list.js";
import { isScaleVisible, resolvePriceScalePlacement } from "../../chart/scale/settings.js";
import { rafThrottle, trackChartPanning } from "../../chart/pan/perf.js";
import { SessionBackgroundPrimitive } from "../../primitives/session/background.js";
import { attachPriceLineLabelPrimitive } from "../../primitives/priceLineLabel/index.js";
import {
  priceLineBarForPane,
  resolvePriceLineColorForPane,
} from "../symbol/lineStyle.js";
import { chartDebugCount, chartDebugTime } from "../../debug/chart/index.js";
import { HISTORY_EDGE_BARS } from "../bar/loader.js";
import {
  buildChartSeriesForPane,
  ensureFutureWhitespace as growFutureWhitespace,
  applyLiveBarToPaneSeries,
} from "../../chart/pane/data.js";
import { CHART_FUTURE_WHITESPACE_MIN } from "../../chart/future/whitespace.js";

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
  } = deps;

  /** @type {Map<number, object>} */
  const pendingStatusPanes = new Map();

  /** @param {object} pane @param {number} time */
  function statusBarAtTime(pane, time) {
    const idx = pane.timeToIdx?.get(time);
    if (idx == null) return undefined;
    return barsForPane(pane)[idx];
  }

  /** @param {object} pane */
  function refreshPaneStatusLine(pane) {
    if (!pane.statusEl) return;
    if (ui.barsLoading || !pane.bars.length) {
      pane.statusEl.innerHTML = "";
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
    if (ui.chartPanning) {
      pendingStatusPanes.set(pane.index, pane);
      return;
    }
    refreshPaneStatusLine(pane);
  });

  /** @param {object} pane */
  function attachSessionBackground(pane) {
    const bg = new SessionBackgroundPrimitive();
    bg.setSettingsProvider(() => settingsStore.get().symbol ?? {});
    bg.setSymbolProvider(() => pane.symbolInfo ?? symbolInfo);
    bg.setContextProvider(() => ({
      bars: barsForPane(pane),
      mapBars: pane.mapBars,
      barSec: barSecForPane(pane),
    }));
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
        const enabled = Boolean(sc.countdownToBarClose);
        const { close } = priceLineBarForPane(pane, settingsStore, symbolInfo);
        const precision = precisionFromSettings(settingsStore.get(), pane.symbolInfo ?? symbolInfo);
        const placement = resolvePriceScalePlacement(sc.scalesPlacement);
        return {
          enabled,
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

  /** @param {object} pane */
  function wirePaneCrosshair(pane) {
    pane.chart.subscribeCrosshairMove((param) => {
      if (ui.chartPanning) {
        chartDebugCount("crosshair", "skippedPan");
        return;
      }
      chartDebugCount("crosshair", "move");

      if (!ui.chartPanning && pane.bars.length) {
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

      const isActive = pane.index === (getLayoutManager()?.getActivePaneIndex() ?? 0);

      if (isActive && ui.lockCursorByTime && ui.lockedCrosshairTime != null && param?.point) {
        const price = pane.series.coordinateToPrice(param.point.y);
        if (price != null) pane.chart.setCrosshairPosition(price, ui.lockedCrosshairTime, pane.series);
      }

      if (isActive && !ui.chartPanning) {
        if (param?.point) {
          const p = pane.series.coordinateToPrice(param.point.y);
          ui.crosshairPrice = p != null && Number.isFinite(p) ? p : null;
        } else {
          ui.crosshairPrice = null;
        }
      }

      const seriesBar = param.seriesData?.get(pane.series);
      const seriesOhlc = seriesBar && "open" in seriesBar ? seriesBar : null;

      if (!param?.time) {
        pane.hoverBar = undefined;
        pane.hoverPrev = undefined;
        if (isActive) {
          ui.hoverBar = undefined;
          ui.hoverPrev = undefined;
          applySymbolLineStyleLocal();
        }
        scheduleStatusLine(pane);
        return;
      }

      const visible = barsForPane(pane);
      const idx = pane.timeToIdx?.get(param.time);
      let nextBar = idx != null ? visible[idx] : undefined;
      let prevBar = idx != null && idx > 0 ? visible[idx - 1] : undefined;
      if (!nextBar) {
        nextBar = seriesOhlc ?? undefined;
        if (!nextBar) return;
      }

      const barChanged = pane.hoverBar?.time !== nextBar.time;
      pane.hoverBar = nextBar;
      pane.hoverPrev = prevBar;
      if (isActive) {
        ui.hoverBar = pane.hoverBar;
        ui.hoverPrev = pane.hoverPrev;
        if (barChanged) applySymbolLineStyleLocal();
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
        flushPendingStatusLines();
        const active = getActivePane();
        if (active) scheduleStatusLine(active);
        if (deferWhitespacePane) {
          const p = deferWhitespacePane;
          deferWhitespacePane = null;
          ensurePaneFutureWhitespace(p);
        }
        const r = pane.chart.timeScale().getVisibleLogicalRange();
        if (r && r.from < HISTORY_EDGE_BARS && viewportDeps?.ensureHistoryNearEdge) {
          void viewportDeps.ensureHistoryNearEdge(pane);
        }
      },
    });
  }

  /** @type {object | null} */
  let deferWhitespacePane = null;

  /** @param {object} pane */
  function ensurePaneFutureWhitespace(pane) {
    const visible = barsForPane(pane);
    growFutureWhitespace({
      chart: pane.chart,
      series: pane.series,
      pane,
      barSec: barSecForPane(pane, resolutions),
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
      if (ui.barsLoading) return;
      chartDebugCount("perf", "visibleRange");
      chartDebugTime("perf", `visibleRangeHandler pane ${pane.index}`, () => {
        if (pane.index === 0) {
          viewportDeps?.maintainLockedRatio?.();
          if (viewportDeps?.getLayoutManager?.()?.getSync().dateRange) {
            viewportDeps?.syncLayoutDateRangeFrom?.(pane.chart);
          }
        }

        const r = pane.chart.timeScale().getVisibleLogicalRange();
        if (!r) return;
        const realCount = barsForPane(pane).length;

        if (r.from < HISTORY_EDGE_BARS && viewportDeps?.ensureHistoryNearEdge) {
          if (!historyScheduled) {
            historyScheduled = true;
            requestAnimationFrame(() => {
              historyScheduled = false;
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
