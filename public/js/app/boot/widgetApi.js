import { chartDebug } from "../../debug/chart/index.js";
import { getChartViewportStats } from "../../debug/chart/viewportStats.js";
import {
  captureViewportBarLayout,
  restoreViewportBarLayout,
} from "../../chart/pane/viewportBarLayout.js";
import {
  createOrderLineManager,
  createTradingViewChartApi,
} from "../../chart/orderLine/index.js";

/**
 * Public chart widget API returned from bootChart().
 * @param {object} ctx
 */
export function createChartWidgetApi(ctx) {
  const {
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
    resolutions,
    activePriceScaleId,
  } = ctx;

  const orderLines = createOrderLineManager(getActivePane);
  /** @type {ReturnType<typeof createTradingViewChartApi> | null} */
  let tvChartApi = null;

  const widget = {
    /** Raw lightweight-charts IChartApi instance. */
    lcChart: chart,
    series,
    settings: settingsStore,
    datafeed,
    lastBar,

    /** Bars currently loaded on the active pane (snapshot). */
    getBars() {
      const bars = getBarsSnapshot();
      chartDebug("data", "widget.getBars", { count: bars.length });
      return bars;
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
        });
      }
      return tvChartApi;
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
     * Push one live bar (forming candle update or new bar).
     * Uses datafeed.pushBar when available, otherwise updates chart directly.
     * @param {import("../../datafeed/types.js").Bar} bar
     */
    update(bar) {
      const pane = getActivePane();
      if (!pane) return;
      if (typeof datafeed.pushBar === "function") {
        datafeed.pushBar(bar, pane.symbol);
      } else {
        pushLiveBar(pane, bar);
      }
    },

    /**
     * Reset viewport — price scale, time scale, scroll to latest.
     * @param {{ price?: boolean, time?: boolean }} [opts]
     */
    reset(opts = {}) {
      const resetPrice = opts.price !== false;
      const resetTime = opts.time !== false;
      if (resetPrice) resetChartView();
      else if (resetTime) resetTimeScale();
      else scrollToLatest(getBarsSnapshot().length);
    },

    /** Reload history from datafeed (initial countBack). */
    reload: () => loadBars(),

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
        for (const pane of getAllChartPanes()) pane.symbol = sym;
        refreshWatermark();
        await loadBarsForPanes(getAllChartPanes(), { force: true });
        const active = getActivePane();
        if (active) applySymbolFormat(active.symbolInfo);
        return;
      }
      const pane = getActivePane();
      if (!pane) return;
      pane.symbol = sym;
      refreshWatermark();
      pane.symbolInfo = await datafeed.resolveSymbol(sym);
      applySymbolFormat(pane.symbolInfo);
      await loadPaneBars(pane, { force: true });
      refreshStatusLine();
    },

    /** Change interval and reload. */
    async setResolution(res) {
      const sync = layoutManager?.getSync();
      if (layoutManager && sync?.interval) {
        const panes = getAllChartPanes();
        const savedLayouts = panes.map((p) =>
          captureViewportBarLayout(p, settingsStore, resolutions),
        );
        for (const pane of panes) {
          stashPaneResolutionCache(pane, pane.resolution);
          pane.resolution = res;
        }
        refreshWatermark();
        refreshStatusLine();
        await loadBarsForPanes(panes, { force: true, skipPriceScaleMargins: true });
        ctx._viewportRestorePending = true;
        try {
          await ctx.afterTimeframeChange?.();
          for (let i = 0; i < panes.length; i += 1) {
            restoreViewportBarLayout(
              panes[i],
              savedLayouts[i],
              settingsStore,
              resolutions,
              "timeframe",
              activePriceScaleId,
            );
          }
        } finally {
          ctx._viewportRestorePending = false;
        }
        return;
      }
      const pane = getActivePane();
      if (!pane) return;
      const savedLayout = captureViewportBarLayout(pane, settingsStore, resolutions);
      stashPaneResolutionCache(pane, pane.resolution);
      pane.resolution = res;
      refreshWatermark();
      refreshStatusLine();
      await loadPaneBars(pane, { force: true, skipPriceScaleMargins: true });
      ctx._viewportRestorePending = true;
      try {
        await ctx.afterTimeframeChange?.();
        restoreViewportBarLayout(
          pane,
          savedLayout,
          settingsStore,
          resolutions,
          "timeframe",
          activePriceScaleId,
        );
      } finally {
        ctx._viewportRestorePending = false;
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
  };

  return widget;
}
