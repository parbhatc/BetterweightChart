import { renderStatusLine } from "../../chart/status/line.js";
import { getMarketStatusDetails } from "../../chart/market/status.js";
import { precisionFromSettings } from "../../chart/timezone/list.js";
import { formatDisplayPrice } from "../../chart/format.js";
import { resolvePriceScalePlacement } from "../../chart/scale/settings.js";
import { rafThrottle, trackChartPanning } from "../../chart/pan/perf.js";
import { timeToBarIndex } from "../../chart/coords/timeScale.js";
import { nearestBarIndex, normalizeHoverBar, resolveUtcBarTime } from "../../chart/pane/hoverBar.js";
import { SessionBackgroundPrimitive } from "../../primitives/session/background.js";
import { attachPriceLineLabelPrimitive } from "../../primitives/priceLineLabel/index.js";
import { attachBidAskLinesPrimitive } from "../../primitives/bidAskLines/index.js";
import { symbolLabelAnchorsForPane } from "../../chart/scale/symbolLabelAnchors.js";
import {
  priceLineBarForPane,
  resolvePriceLineColorForPane,
} from "../symbol/lineStyle.js";
import { chartDebugCount, chartDebugTime } from "../../debug/chart/index.js";
import { resolvePaneBackgroundColor } from "../../chart/canvas/settings.js";
import { syncStatusLineLayout, wireStatusLineLayout } from "../../chart/status/layout.js";
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
    quotesEnabled,
    getQuoteForSymbol,
  } = deps;

  /** @type {Map<number, object>} */
  const pendingStatusPanes = new Map();

  /** @param {object} pane @param {number} utcTime */
  function statusBarAtTime(pane, utcTime) {
    return pane.timeAdapter?.index.utcBarByUtcTime(utcTime) ?? barsForPane(pane).find((b) => b.time === utcTime);
  }

  /** Prefer live `pane.bars` so forming-candle OHLC stays current on ticks. */
  function liveBarAtTime(pane, utcTime) {
    if (utcTime == null) return undefined;
    return pane.bars.find((b) => b.time === utcTime) ?? statusBarAtTime(pane, utcTime);
  }

  /** @param {object} pane */
  function latestStatusBar(pane) {
    const visible = barsForPane(pane);
    const tailTime = visible.at(-1)?.time ?? pane.bars.at(-1)?.time;
    if (tailTime == null) return visible.at(-1) ?? pane.bars.at(-1);
    return liveBarAtTime(pane, tailTime) ?? visible.at(-1) ?? pane.bars.at(-1);
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

  /** @param {object} pane @param {import("lightweight-charts").MouseEventParams | null | undefined} param */
  function isCrosshairOverFuture(pane, param) {
    if (!param?.time || !param?.point) return false;
    const chartBars = pane._chartView?.chartBars ?? [];
    if (!chartBars.length) return false;
    const lastRealChartTime = chartBars[chartBars.length - 1].time;
    return param.time > lastRealChartTime;
  }

  /** Touch devices: only while finger is down; mouse/hover devices: active crosshair position. */
  function statusPointerSelectsHover(pane) {
    if (!pane.crosshairOverChart || pane.crosshairOverFuture) return false;
    const pt = pane._statusPointerType;
    const touchLike =
      pt === "touch" || (pt !== "mouse" && window.matchMedia?.("(hover: none)")?.matches);
    if (touchLike) return Boolean(pane.crosshairPointerActive);
    return true;
  }

  /** @param {object} pane @returns {object | null | undefined} */
  function statusHoverBarForPane(pane) {
    const activeIdx = getLayoutManager()?.getActivePaneIndex() ?? 0;
    const isActive = pane.index === activeIdx;
    if (isActive && ui.lockCursorByTime && ui.lockedCrosshairTime != null) {
      return liveBarAtTime(pane, ui.lockedCrosshairTime) ?? pane.hoverBar ?? null;
    }
    const ctrl = getDrawingHub?.()?.getController?.(pane.index);
    if (ctrl?.isValuesTooltipPinned?.()) {
      return pane.hoverBar ? liveBarAtTime(pane, pane.hoverBar.time) ?? pane.hoverBar : null;
    }
    if (statusPointerSelectsHover(pane) && pane.hoverBar) {
      return liveBarAtTime(pane, pane.hoverBar.time) ?? pane.hoverBar;
    }
    return null;
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
    const hoverBar = statusHoverBarForPane(pane);
    const useHover = hoverBar != null;
    const rawBar = hoverBar ?? latestStatusBar(pane);
    const bar = rawBar?.time != null ? (liveBarAtTime(pane, rawBar.time) ?? rawBar) : rawBar;
    const prev = useHover
      ? pane.hoverPrev ??
        (hoverBar?.time != null
          ? (() => {
              const idx = nearestBarIndex(visible, hoverBar.time);
              return idx > 0 ? visible[idx - 1] : undefined;
            })()
          : undefined)
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
    for (const pane of getAllChartPanes()) {
      syncStatusLineLayout(pane, () => settingsStore.get());
      refreshPaneStatusLine(pane);
    }
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
          scaleVisible: true,
          lineVisible: Boolean(sc.symbolLabelLine),
          axisLabelVisible: Boolean(sc.symbolLabelValue),
          lineWidth: Number(sc.symbolLabelLineWidth) || 1,
          lineStyle: Number(sc.symbolLabelLineStyle ?? 2),
          scaleId: placement.left ? "left" : "right",
          barSec: barSecForPane(pane),
          price: close,
          color: resolvePriceLineColorForPane(pane, settingsStore, symbolInfo),
          title: sc.symbolLabelName ? pane.symbol : "",
          priceText:
            close == null || !Number.isFinite(close)
              ? ""
              : formatDisplayPrice(close, precision),
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
    pane.crosshairOverFuture = isCrosshairOverFuture(pane, param);

    if (!param?.time || !param?.point) {
      pane.lastCrosshairChartTime = undefined;
      if (isActive) applySymbolLineStyleLocal();
      return setPaneHoverBar(pane, undefined, -1, isActive);
    }

    pane.lastCrosshairChartTime = param.time;

    if (pane.crosshairOverFuture) {
      if (isActive) applySymbolLineStyleLocal();
      return setPaneHoverBar(pane, undefined, -1, isActive);
    }

    const { bar: nextBar, idx } = barFromCrosshairParam(pane, param);
    if (!nextBar) {
      if (isActive) applySymbolLineStyleLocal();
      return setPaneHoverBar(pane, undefined, -1, isActive);
    }
    return setPaneHoverBar(pane, nextBar, idx, isActive);
  }

  /** @param {object} pane @param {number} chartTime @param {boolean} isActive */
  function refreshHoverBarFromChartTime(pane, chartTime, isActive) {
    if (chartTime == null || !pane.timeAdapter) return;
    applyCrosshairBar(pane, { time: chartTime, seriesData: new Map() }, isActive);
  }

  /** @param {object} pane */
  function wirePaneStatusCrosshairPointer(pane) {
    if (pane._statusCrosshairPointerWired) return;
    pane._statusCrosshairPointerWired = true;

    const onDown = (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      pane._statusPointerType = ev.pointerType;
      pane.crosshairPointerActive = true;
    };

    const onUp = () => {
      if (!pane.crosshairPointerActive) return;
      pane.crosshairPointerActive = false;
      scheduleStatusLine(pane);
    };

    pane.el.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  /** @param {object} pane */
  function wirePaneCrosshair(pane) {
    pane.chart.subscribeCrosshairMove((param) => {
      const isActive = pane.index === (getLayoutManager()?.getActivePaneIndex() ?? 0);

      pane.crosshairOverChart = Boolean(param?.point);
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
    /** @type {ReturnType<typeof setTimeout> | null} */
    let historyPrefetchTimer = null;
    const HISTORY_PREFETCH_IDLE_MS = 150;

    const cancelHistoryPrefetch = () => {
      if (historyPrefetchTimer == null) return;
      clearTimeout(historyPrefetchTimer);
      historyPrefetchTimer = null;
    };

    const scheduleHistoryPrefetch = () => {
      const r = pane.chart.timeScale().getVisibleLogicalRange();
      if (
        !r ||
        !isNearHistoryLeftEdge(r) ||
        pane._suppressHistoryPrefetch ||
        !viewportDeps?.ensureHistoryNearEdge ||
        pane._loadingHistory ||
        pane._historyRestorePending
      ) {
        return;
      }
      cancelHistoryPrefetch();
      historyPrefetchTimer = setTimeout(() => {
        historyPrefetchTimer = null;
        if (
          ui.chartPanning ||
          pane._suppressHistoryPrefetch ||
          pane._loadingHistory ||
          pane._historyRestorePending
        ) {
          return;
        }
        void viewportDeps.ensureHistoryNearEdge(pane);
      }, HISTORY_PREFETCH_IDLE_MS);
    };

    trackChartPanning(pane.el, {
      onStart: () => {
        ui.chartPanning = true;
        cancelHistoryPrefetch();
        viewportDeps?.onChartPanStart?.();
        panFps.start();
      },
      onEnd: () => {
        ui.chartPanning = false;
        panFps.stop();
        viewportDeps?.onChartPanEnd?.();
        if (pane.index === 0) viewportDeps?.maintainLockedRatio?.();
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
        scheduleHistoryPrefetch();
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
      if (!ui.chartPanning && pane.lastCrosshairChartTime != null) {
        const isActive = pane.index === (getLayoutManager()?.getActivePaneIndex() ?? 0);
        refreshHoverBarFromChartTime(pane, pane.lastCrosshairChartTime, isActive);
        scheduleStatusLine(pane);
      } else if (ui.chartPanning) {
        chartDebugCount("perf", "visibleRangeSkippedPan");
      }
      chartDebugCount("perf", "visibleRange");
      chartDebugTime("perf", `visibleRangeHandler pane ${pane.index}`, () => {
        if (pane.index === 0 && !pane._suppressHistoryPrefetch && !ui.chartPanning) {
          viewportDeps?.maintainLockedRatio?.();
        }

        const r = pane.chart.timeScale().getVisibleLogicalRange();
        if (!r) return;
        const realCount = barsForPane(pane).length;

        if (isNearHistoryLeftEdge(r) && viewportDeps?.ensureHistoryNearEdge && !ui.chartPanning) {
          if (!historyScheduled) {
            historyScheduled = true;
            requestAnimationFrame(() => {
              historyScheduled = false;
              if (pane._suppressHistoryPrefetch || ui.chartPanning) return;
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

  /** @param {object} pane */
  function attachBidAskLines(pane) {
    pane.bidAskLines?.destroy();
    pane.bidAskLines = attachBidAskLinesPrimitive({
      series: pane.series,
      getState: () => {
        if (!quotesEnabled?.()) return { enabled: false };
        const sc = settingsStore.get().scales ?? {};
        const quote =
          pane.quote ?? getQuoteForSymbol?.(pane.symbol) ?? null;
        if (!quote || quote.bid == null || quote.ask == null) return { enabled: false };
        const precision = precisionFromSettings(settingsStore.get(), pane.symbolInfo ?? symbolInfo);
        const fmt = (n) => formatDisplayPrice(n, precision);
        const placement = resolvePriceScalePlacement(sc.scalesPlacement);
        const scaleVisible = true;
        const cv = settingsStore.get().canvas ?? {};
        const lineWidth = Number(sc.bidAskLabelLineWidth) || 1;
        const lineStyle = Number(sc.bidAskLabelLineStyle ?? 1);
        const anyVisible =
          sc.bidLabelLine || sc.bidLabelValue || sc.askLabelLine || sc.askLabelValue;
        return {
          enabled: Boolean(anyVisible) && scaleVisible,
          scaleVisible,
          scaleId: placement.left ? "left" : "right",
          fontSize: Number(cv.scalesFontSize) || 12,
          paneBackground: resolvePaneBackgroundColor(cv),
          lineWidth,
          lineStyle,
          noOverlappingLabels: sc.noOverlappingLabels !== false,
          reservedAnchors: symbolLabelAnchorsForPane(pane, settingsStore, pane.symbolInfo ?? symbolInfo),
          bid: {
            price: quote.bid,
            color: sc.bidLabelLineColor ?? "#2962FF",
            lineVisible: Boolean(sc.bidLabelLine),
            valueVisible: Boolean(sc.bidLabelValue),
            text: fmt(quote.bid),
          },
          ask: {
            price: quote.ask,
            color: sc.askLabelLineColor ?? "#F23645",
            lineVisible: Boolean(sc.askLabelLine),
            valueVisible: Boolean(sc.askLabelValue),
            text: fmt(quote.ask),
          },
        };
      },
    });
  }

  /** @param {object} pane @param {HTMLElement} [statusLineEl] */
  function setupPaneExtras(pane, statusLineEl) {
    if (statusLineEl) pane.statusEl = statusLineEl;
    wireStatusLineLayout(pane, () => settingsStore.get());
    attachSessionBackground(pane);
    attachPriceLineLabel(pane);
    attachBidAskLines(pane);
    wirePanePanPerf(pane);
    wirePaneCrosshair(pane);
    wirePaneStatusCrosshairPointer(pane);
    wirePaneViewportHandlers(pane);
  }

  return {
    setupPaneExtras,
    refreshPaneStatusLine,
    refreshStatusLine,
    flushPendingStatusLines,
    scheduleStatusLine,
    attachPriceLineLabel,
    attachBidAskLines,
  };
}
