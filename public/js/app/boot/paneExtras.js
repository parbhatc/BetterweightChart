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
import {
  buildChartSeriesForPane,
  ensureFutureWhitespace as growFutureWhitespace,
} from "../../chart/pane/data.js";

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

      if (!ui.chartPanning) syncLayoutCrosshairFrom(pane.chart, pane.series, param);

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
        void viewportDeps?.ensureHistoryNearEdge?.(pane)?.catch(() => {});
      },
    });
  }

  /** @param {object} pane */
  function ensurePaneFutureWhitespace(pane) {
    const visible = barsForPane(pane);
    growFutureWhitespace({
      chart: pane.chart,
      series: pane.series,
      barsForChart: () => visible,
      buildChartSeriesForDisplay: (vis) =>
        buildChartSeriesForPane(pane, vis, settingsStore, resolutions),
      getFutureWhitespaceBars: () => pane.futureWhitespaceBars,
      setFutureWhitespaceBars: (n) => {
        pane.futureWhitespaceBars = n;
        if (pane.index === 0) viewportDeps?.setPrimaryFutureWhitespace?.(n);
      },
      requestAllSessionBgRefresh: () => {
        for (const p of getAllChartPanes()) p.sessionBg?.requestRefresh();
      },
    });
  }

  /** @param {object} pane */
  function wirePaneViewportHandlers(pane) {
    let growScheduled = false;
    let historyScheduled = false;

    pane.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
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

        if (realCount > 0 && !pane._historyExhausted && !ui.chartPanning) {
          const nearEdge = r.from < 80;
          const barSec =
            resolutions.find((res) => res.id === pane.resolution)?.sec ?? 60;
          let gapNearStart = false;
          const bars = barsForPane(pane);
          if (bars.length > 1) {
            for (let i = 1; i < Math.min(bars.length, 64); i += 1) {
              if (bars[i].time - bars[i - 1].time > barSec * 1.5) {
                gapNearStart = true;
                break;
              }
            }
          }
          if (nearEdge || gapNearStart) {
            if (!historyScheduled) {
              historyScheduled = true;
              requestAnimationFrame(() => {
                historyScheduled = false;
                void viewportDeps?.ensureHistoryNearEdge?.(pane)?.catch(() => {});
              });
            }
          }
        }

        if (r.to < realCount - 16) return;

        if (growScheduled) return;
        growScheduled = true;
        requestAnimationFrame(() => {
          growScheduled = false;
          chartDebugTime("whitespace", `ensureFutureWhitespace pane ${pane.index}`, () =>
            ensurePaneFutureWhitespace(pane),
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
