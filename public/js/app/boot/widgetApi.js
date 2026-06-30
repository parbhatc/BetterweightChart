import { chartDebug, destroyDebugHud } from "../../debug/chart/index.js";
import { getChartViewportStats } from "../../debug/chart/viewportStats.js";
import {
  captureViewportBarLayout,
  restoreViewportBarLayout,
} from "../../chart/pane/viewportBarLayout.js";
import {
  createOrderLineManager,
  createTradingViewChartApi,
  createPositionOverlay,
  getOrderLineTheme,
  setOrderLineTheme,
} from "../../chart/orderLine/index.js";
import { createExecutionShapeManager } from "../../chart/executionShape/index.js";
import { createWidgetShortcutRegistry } from "../../chart/widgetShortcuts.js";
import {
  showChartPendingOverlay,
  hideChartPendingOverlay,
} from "../../ui/loader/chartPendingOverlay.js";
import { createReplayControlApi } from "../../replay/controlApi.js";
import { createToolbarApi } from "../../ui/header/toolbarHost.js";
import { clearResolutionCache } from "../bar/resolutionCache.js";
import { repositionVisibleFloatingToolbars } from "../../drawings/toolbars/floating/reposition.js";
import {
  finishSeriesReload,
  paintPaneAfterTimeframeLoad,
  preparePanesForSeriesReload,
  seedPaneResolutionAsHtf,
} from "./chart/pickers.js";

/**
 * Public chart widget API returned from bootChart().
 * @param {object} ctx
 */
export function createChartWidgetApi(ctx) {
  const {
    releaseTouchScrollLock,
    datafeed,
    chart,
    series,
    settingsStore,
    getActivePane,
    getAllChartPanes,
    getBarsSnapshot,
    getSymbol,
    getResolution,
    getSymbolInfo,
    loadBars,
    loadPaneBars,
    loadBarsForPanes,
    pushLiveBar,
    upsertLiveBar,
    prependHistory,
    ensureHistoryNearEdge,
    stashPaneResolutionCache,
    resetChartView,
    resetTimeScale,
    scrollToLatest,
    applyThemeMode,
    applySymbolFormat,
    refreshWatermark,
    refreshStatusLine,
    barTimeLabel,
    mountChartSettingsUi,
    layoutManager,
    drawing,
    lastBar,
    countBack,
    getReplayState,
    replayEngine,
    replay: ctxReplay,
    resolutions,
    activePriceScaleId,
    chartOverlayLoader,
    opts,
    afterTimeframeChange,
    setViewportRestorePending,
    refreshPaneCandleData,
    indicatorController,
    ensureIndicatorData,
    refreshIndicatorsImmediate,
    refreshIndicatorLegends,
    ensureIndicatorChartHistory,
  } = ctx;

  const tfSwitchCtx = {
    refreshPaneCandleData,
    indicatorController,
    ensureIndicatorData,
    refreshIndicatorsImmediate,
    refreshIndicatorLegends,
    ensureIndicatorChartHistory,
    settingsStore,
    resolutions,
    activePriceScaleId,
    replayEngine,
  };

  const orderLines = createOrderLineManager(getActivePane, {
    settingsStore,
    symbolInfo: getSymbolInfo,
    getIsPanning: () => Boolean(ctx.ui?.chartPanning),
  });
  const toolbar = createToolbarApi(ctx);
  const executionShapes = createExecutionShapeManager(getActivePane);
  const shortcutRegistry = createWidgetShortcutRegistry(getActivePane);
  /** @type {ReturnType<typeof createTradingViewChartApi> | null} */
  let tvChartApi = null;
  /** @type {Array<() => void>} */
  const readyCallbacks = [];
  /** @type {Set<(pnl: number) => void>} */
  const positionUplListeners = new Set();
  let chartReady = false;

  const widget = {
    /** Order-line manager (position / bracket overlays). */
    orderLines,

    /** Host toolbar slots (mount custom header controls). */
    toolbar,

    /** True while the user is dragging the time scale (pan). */
    isChartPanning() {
      return Boolean(ctx.ui?.chartPanning);
    },

    /**
     * Subscribe to live bar ticks on the active pane (forming candle updates).
     * @param {(bar: object, meta?: object) => void} cb
     * @returns {() => void} unsubscribe
     */
    onLiveBar(cb) {
      if (typeof cb !== "function") return () => {};
      const listeners = ctx.liveBarListeners;
      if (!listeners) {
        console.warn("[BWC] onLiveBar unavailable — liveBarListeners not wired");
        return () => {};
      }
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    /**
     * Position overlay UPL (single source — avoids duplicate onLiveBar subscribers).
     * @param {(pnl: number) => void} cb
     * @returns {() => void} unsubscribe
     */
    onPositionUpl(cb) {
      if (typeof cb !== "function") return () => {};
      positionUplListeners.add(cb);
      return () => positionUplListeners.delete(cb);
    },

    /** @param {number} pnl */
    emitPositionUpl(pnl) {
      if (!Number.isFinite(pnl)) return;
      for (const cb of positionUplListeners) {
        try {
          cb(pnl);
        } catch {
          //
        }
      }
    },

    /** Raw lightweight-charts IChartApi instance. */
    lcChart: chart,
    series,
    settings: settingsStore,
    datafeed,
    lastBar,

    /** Bars currently loaded on the active pane (snapshot). */
    getBars() {
      return getBarsSnapshot();
    },

    getAllChartPanes() {
      return getAllChartPanes();
    },

    syncHostReplayPanes() {
      replayEngine?.syncHostReplayAllPanes?.();
    },

    getSymbol,
    getResolution,

    /**
     * TradingView-compatible chart API (symbol, resolution, createOrderLine).
     * @returns {ReturnType<typeof createTradingViewChartApi>}
     */
    chart() {
      if (!tvChartApi) {
        tvChartApi = createTradingViewChartApi({
          getSymbol,
          setSymbol: (sym) => widget.setSymbol(sym),
          getResolution,
          orderLines,
          executionShapes,
        });
      }
      return tvChartApi;
    },

    /** TV widget API — run after chart history is loaded. */
    onChartReady(cb) {
      if (typeof cb !== "function") return;
      if (chartReady) {
        cb();
        return;
      }
      readyCallbacks.push(cb);
    },

    /**
     * TV widget API — register keyboard shortcut (e.g. `["ctrl", 66]`).
     * @param {(string | number)[]} shortcut
     * @param {() => void} cb
     */
    onShortcut(shortcut, cb) {
      shortcutRegistry.onShortcut(shortcut, cb);
    },

    /** @internal Called by bootChart when the widget is ready. */
    _notifyChartReady() {
      if (chartReady) return;
      chartReady = true;
      const cbs = readyCallbacks.splice(0);
      for (const cb of cbs) {
        try {
          cb();
        } catch (err) {
          console.error("[BWC] onChartReady callback failed:", err);
        }
      }
    },

    /** Active symbol metadata from datafeed.resolveSymbol(). */
    getSymbolInfo,

    /**
     * History request via datafeed.getBars().
     * @param {import("../../datafeed/types.js").PeriodParams} [periodParams]
     */
    async fetchBars(periodParams = {}) {
      const pane = getActivePane();
      if (!pane?.symbolInfo) return { bars: [], noData: true };
      chartDebug("data", "widget.fetchBars", {
        symbol: pane.symbol,
        resolution: pane.resolution,
        ...periodParams,
      });
      return datafeed.getBars(pane.symbolInfo, pane.resolution, {
        countBack,
        ...periodParams,
      });
    },

    /**
     * Upsert one bar by `time` — updates OHLC when the bar exists, appends when it is new.
     *
     * @example
     * widget.update({ time: 1710000060, open: 100, high: 101, low: 99, close: 100.5 });
     *
     * @param {import("../../datafeed/types.js").Bar} bar
     * @param {{ pane?: object }} [opts]
     * @returns {boolean} whether the chart accepted the bar
     */
    update(bar, opts = {}) {
      const pane = opts.pane ?? getActivePane();
      if (!pane) return false;
      if (typeof datafeed.pushBar === "function") {
        return datafeed.pushBar(bar, pane.symbol) != null;
      }
      upsertLiveBar(pane, bar);
      return true;
    },

    /** @deprecated use update */
    pushLiveBar(bar, opts = {}) {
      return widget.update(bar, opts);
    },

    /**
     * Reset chart viewport and/or refetch history from the datafeed.
     *
     * @param {{ price?: boolean, time?: boolean, data?: boolean, viewport?: boolean }} [opts]
     * - `{ data: true }` — clear resolution cache and force a fresh `getBars` load
     *   (e.g. after a live feed reconnect). `viewport` defaults to `true`.
     * - default — reset viewport only (price + time + scroll to latest).
     */
    async reset(opts = {}) {
      if (opts.data) {
        clearResolutionCache();
        const panes = getAllChartPanes();
        const sync = layoutManager?.getSync();
        const loadAll = sync?.symbol || sync?.interval || panes.length > 1;
        const targets = loadAll ? panes : [getActivePane()].filter(Boolean);
        const resetViewport = opts.viewport !== false;
        const preserveViewport = !resetViewport;
        chartDebug("data", "widget.reset", {
          mode: "data",
          panes: targets.length,
          preserveViewport,
        });
        const savedLayouts = preserveViewport
          ? targets.map((p) => captureViewportBarLayout(p, settingsStore, resolutions))
          : null;

        await loadBarsForPanes(targets, {
          force: true,
          avoidPreserveViewport: resetViewport,
          deferChartRefresh: preserveViewport,
          skipPriceScaleMargins: preserveViewport,
        });

        try {
          const indicatorPanes = getAllChartPanes();
          if (preserveViewport && savedLayouts) {
            for (let i = 0; i < targets.length; i += 1) {
              paintPaneAfterTimeframeLoad(tfSwitchCtx, targets[i], savedLayouts[i]);
            }
            await Promise.all(
              indicatorPanes.map((pane) =>
                ensureIndicatorChartHistory?.(pane) ?? Promise.resolve(),
              ),
            );
            refreshIndicatorsImmediate?.();
            refreshIndicatorLegends?.();
          } else {
            await Promise.all(
              indicatorPanes.map((pane) =>
                ensureIndicatorChartHistory?.(pane) ?? Promise.resolve(),
              ),
            );
            if (resetViewport) {
              const resetPrice = opts.price !== false;
              const resetTime = opts.time !== false;
              if (resetPrice) resetChartView();
              else if (resetTime) resetTimeScale();
              else scrollToLatest(getBarsSnapshot().length);
              refreshIndicatorsImmediate?.();
              refreshIndicatorLegends?.();
            }
          }
        } catch (err) {
          chartDebug("data", "widget.reset indicators refresh failed", { err: String(err) });
        }
        repositionVisibleFloatingToolbars();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("bwc:reposition-floating-toolbars"));
        }
        return;
      }
      const resetPrice = opts.price !== false;
      const resetTime = opts.time !== false;
      if (resetPrice) resetChartView();
      else if (resetTime) resetTimeScale();
      else scrollToLatest(getBarsSnapshot().length);
    },

    /** Reload history from datafeed (initial countBack). Pass `{ force: true }` to refetch even when bars exist. */
    reload: (opts = {}) => {
      const panes = getAllChartPanes();
      const sync = layoutManager?.getSync();
      const loadAll = sync?.symbol || sync?.interval || panes.length > 1;
      return loadBarsForPanes(loadAll ? panes : [getActivePane()].filter(Boolean), {
        force: Boolean(opts.force),
      });
    },

    /**
     * Replace all bars (static/simple feeds).
     * @param {import("../../datafeed/types.js").Bar[]} newBars
     * @param {string} [sym]
     */
    async setBars(newBars, sym) {
      if (typeof datafeed.setBars !== "function") {
        throw new Error("setBars requires a static or simple datafeed");
      }
      datafeed.setBars(sym ?? getSymbol(), newBars);
      await loadBars();
    },

    /** Change symbol and reload. */
    async setSymbol(sym) {
      const sync = layoutManager?.getSync();
      if (layoutManager && sync?.symbol) {
        const panes = getAllChartPanes();
        if (panes.length && ctx.symbol === sym && panes.every((p) => p.symbol === sym)) return;
      } else {
        const pane = getActivePane();
        if (pane?.symbol === sym) return;
      }
      if (layoutManager && sync?.symbol) {
        const panes = getAllChartPanes();
        for (const pane of panes) pane.symbol = sym;
        refreshWatermark();
        await showChartPendingOverlay({ chartOverlayLoader }, panes);
        try {
          await loadBarsForPanes(panes, { force: true, deferChartRefresh: true });
          const active = getActivePane();
          if (active) applySymbolFormat(active.symbolInfo);
          opts?.onSymbolChange?.(sym);
        } finally {
          await hideChartPendingOverlay({ chartOverlayLoader });
        }
        return;
      }
      const pane = getActivePane();
      if (!pane) return;
      pane.symbol = sym;
      refreshWatermark();
      await showChartPendingOverlay({ chartOverlayLoader }, pane);
      try {
        pane.symbolInfo = await datafeed.resolveSymbol(sym);
        applySymbolFormat(pane.symbolInfo);
        await loadPaneBars(pane, { force: true, deferChartRefresh: true });
        refreshStatusLine();
        opts?.onSymbolChange?.(sym);
      } finally {
        await hideChartPendingOverlay({ chartOverlayLoader });
      }
    },

    /** Change interval and reload. */
    async setResolution(res) {
      const sync = layoutManager?.getSync();
      if (layoutManager && sync?.interval) {
        const panes = getAllChartPanes();
        preparePanesForSeriesReload(tfSwitchCtx, panes);
        const savedLayouts = panes.map((p) =>
          captureViewportBarLayout(p, settingsStore, resolutions),
        );
        for (const pane of panes) {
          seedPaneResolutionAsHtf(tfSwitchCtx, pane);
          replayEngine?.beforeResolutionChange?.(pane);
          stashPaneResolutionCache(pane, pane.resolution);
          pane.resolution = res;
        }
        refreshWatermark();
        refreshStatusLine();
        await showChartPendingOverlay({ chartOverlayLoader }, panes);
        try {
          await loadBarsForPanes(panes, {
            force: true,
            deferChartRefresh: true,
            skipPriceScaleMargins: true,
          });
          const replayLocked = replayEngine?.isReplayLocked?.() ?? false;
          if (replayLocked) {
            setViewportRestorePending?.(true);
            try {
              await afterTimeframeChange?.();
            } finally {
              setViewportRestorePending?.(false);
            }
            await finishSeriesReload(tfSwitchCtx, panes);
          } else {
            for (let i = 0; i < panes.length; i += 1) {
              paintPaneAfterTimeframeLoad(tfSwitchCtx, panes[i], savedLayouts[i]);
            }
            await finishSeriesReload(tfSwitchCtx, panes);
            setViewportRestorePending?.(true);
            try {
              await afterTimeframeChange?.();
            } finally {
              setViewportRestorePending?.(false);
            }
          }
        } finally {
          await hideChartPendingOverlay({ chartOverlayLoader });
        }
        return;
      }
      const pane = getActivePane();
      if (!pane) return;
      const savedLayout = captureViewportBarLayout(pane, settingsStore, resolutions);
      preparePanesForSeriesReload(tfSwitchCtx, [pane]);
      seedPaneResolutionAsHtf(tfSwitchCtx, pane);
      replayEngine?.beforeResolutionChange?.(pane);
      stashPaneResolutionCache(pane, pane.resolution);
      pane.resolution = res;
      refreshWatermark();
      refreshStatusLine();
      await showChartPendingOverlay({ chartOverlayLoader }, pane);
      try {
        await loadPaneBars(pane, {
          force: true,
          deferChartRefresh: true,
          skipPriceScaleMargins: true,
        });
        const replayLocked = replayEngine?.isReplayLocked?.() ?? false;
        if (replayLocked) {
          setViewportRestorePending?.(true);
          try {
            await afterTimeframeChange?.();
          } finally {
            setViewportRestorePending?.(false);
          }
          await finishSeriesReload(tfSwitchCtx, [pane]);
        } else {
          paintPaneAfterTimeframeLoad(tfSwitchCtx, pane, savedLayout);
          await finishSeriesReload(tfSwitchCtx, [pane]);
          setViewportRestorePending?.(true);
          try {
            await afterTimeframeChange?.();
          } finally {
            setViewportRestorePending?.(false);
          }
        }
      } finally {
        await hideChartPendingOverlay({ chartOverlayLoader });
      }
    },

    /**
     * Load older bars when panning left (uses getBars with to = first bar time).
     * @returns {Promise<boolean>} true if bars were prepended
     */
    loadMoreHistory: () => {
      const pane = getActivePane();
      return pane ? ensureHistoryNearEdge(pane) : Promise.resolve(false);
    },

    openSettings: (section) => mountChartSettingsUi().open(section),
    setTheme: (mode) => applyThemeMode(mode),
    /**
     * Programmatically add a drawing.
     * @param {string} shape e.g. "trendline", "trend-line", "rectangle", "rect"
     * @param {{ time: number, price: number }[]} points
     * @param {{ paneIndex?: number, locked?: boolean, props?: object }} [opts]
     */
    drawShape(shape, points, opts = {}) {
      if (!drawing?.drawShape) {
        throw new Error("Drawing API is not available");
      }
      return drawing.drawShape(shape, points, opts);
    },
    barTimeLabel,

    /**
     * Visible bar range + replay cursor stats (console helper).
     * @example window.__BWC_WIDGET__.visibleBars()
     * @param {{ log?: boolean }} [opts] pass { log: false } to return data without printing
     */
    visibleBars(opts) {
      return getChartViewportStats(
        {
          getActivePane,
          settingsStore,
          resolutions,
          getReplayState,
          replayEngine,
        },
        opts,
      );
    },

    /** Bar replay controls for host UI (see replayToolbar: "external" boot option). */
    replay: createReplayControlApi({ replay: ctxReplay, replayEngine }),

    /**
     * Position / order-line pill text colors (see chart/orderLine/theme.js).
     * @param {{ positionTextColor?: string, bracketTextColor?: string, defaultTextColor?: string, axisLabelTextColor?: string }} theme
     */
    setOrderLineTheme(theme) {
      setOrderLineTheme(theme);
      widget.positionOverlay?.setTheme?.(theme);
      widget.orderLines?.requestRefresh?.();
      return getOrderLineTheme();
    },

    getOrderLineTheme() {
      return getOrderLineTheme();
    },

    /** Tear down host-global side effects (touch scroll lock, clocks, debug HUD). */
    destroy() {
      widget.positionOverlay?.destroy?.();
      toolbar.destroy?.();
      releaseTouchScrollLock?.();
      destroyDebugHud();
      ctx.tzClock?.destroy?.();
      if (typeof window !== "undefined" && window.__BWC_WIDGET__ === widget) {
        delete window.__BWC_WIDGET__;
      }
    },
  };

  widget.positionOverlay = createPositionOverlay(widget);

  const scheduleOrderLineLayout = () => {
    widget.orderLines?.requestRefresh?.();
    widget.positionOverlay?.refreshLayout?.();
  };
  const layoutMount = ctx.el?.closest?.(".tv-chart-wrap__stage") ?? ctx.el;
  /** @type {ResizeObserver | null} */
  let layoutResizeObs = null;
  if (layoutMount instanceof HTMLElement && typeof ResizeObserver !== "undefined") {
    layoutResizeObs = new ResizeObserver(() => scheduleOrderLineLayout());
    layoutResizeObs.observe(layoutMount);
  }
  const onViewportResize = () => scheduleOrderLineLayout();
  if (typeof window !== "undefined") {
    window.visualViewport?.addEventListener("resize", onViewportResize);
  }

  const baseDestroy = widget.destroy.bind(widget);
  widget.destroy = () => {
    layoutResizeObs?.disconnect();
    layoutResizeObs = null;
    if (typeof window !== "undefined") {
      window.visualViewport?.removeEventListener("resize", onViewportResize);
    }
    baseDestroy();
  };

  const baseNotifyReady = widget._notifyChartReady?.bind(widget);
  widget._notifyChartReady = () => {
    baseNotifyReady?.();
    requestAnimationFrame(scheduleOrderLineLayout);
  };

  return widget;
}
