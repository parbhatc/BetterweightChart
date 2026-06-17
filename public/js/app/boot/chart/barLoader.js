import {
  applyLiveBarToPaneSeries,
  updateFormingBarOnPaneSeries,
} from "../../../chart/pane/data.js";
import { createBarLoader } from "../../bar/loader.js";
import { syncPaneEmptyState } from "../../../ui/chart/emptyState.js";
import { ensurePanePriceScaleForPan } from "../../../chart/price/panScale.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachBarLoader(ctx) {
  const barLoader = createBarLoader({
    datafeed: ctx.datafeed,
    countBack: ctx.opts.countBack,
    historyChunk: ctx.opts.historyChunk ?? ctx.opts.countBack,
    getLayoutManager: () => ctx.layoutManager,
    getAllChartPanes: ctx.getAllChartPanes,
    loader: ctx.loader,
    refreshPaneCandleData: ctx.refreshPaneCandleData,
    applyLiveBarToPane: (pane) =>
      applyLiveBarToPaneSeries(pane, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions),
    updateFormingBarOnPane: (pane, bar) =>
      updateFormingBarOnPaneSeries(pane, bar, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions),
    getBarSecForPane: (pane) => ctx.barSecForPaneLocal(pane),
    setBarsLoading: (v) => {
      ctx.barsLoading = v;
      ctx.ui.barsLoading = v;
    },
    refreshStatusLine: ctx.refreshStatusLine,
    getActivePaneIndex: () => ctx.layoutManager?.getActivePaneIndex() ?? 0,
    setHoverState: (bar, prev) => {
      ctx.ui.hoverBar = bar;
      ctx.ui.hoverPrev = prev;
    },
    setPrimaryBars: (pane) => {
      ctx.bars = pane.bars;
      ctx.futureWhitespaceBars = pane.futureWhitespaceBars;
    },
    onPaneBarUpdate: (pane) => {
      pane.priceLineLabel?.requestRefresh();
      ctx.refreshIndicators?.(pane.index);
    },
    onHistoryPrepended: (pane) => {
      if (!ctx.layoutManager?.getSync().dateRange) return;
      const panes = ctx.getAllChartPanes();
      const source = panes.reduce((best, p) => (p.bars.length > best.bars.length ? p : best), pane);
      ctx.syncLayoutDateRangeFrom(source.chart);
    },
    syncPaneEmptyState: (pane, state) =>
      syncPaneEmptyState(pane, {
        ...state,
        onChangeSymbol: () => ctx.symbolSearchUi?.open?.(),
        onChangeInterval: () => ctx.tfPickerUi?.openPanel?.(),
      }),
    ensurePanePriceScaleForPan: (pane) =>
      ensurePanePriceScaleForPan(pane, ctx.settingsStore.get().scales ?? {}, ctx.activePriceScaleId),
    finishPaneViewportAfterLoad: (pane) => ctx.finishPaneViewportAfterLoad?.(pane),
  });

  ctx.viewportDeps.maintainLockedRatio = ctx.maintainLockedRatio;
  ctx.viewportDeps.syncLayoutDateRangeFrom = ctx.syncLayoutDateRangeFrom;
  ctx.viewportDeps.prependHistory = barLoader.prependHistory;
  ctx.viewportDeps.ensureHistoryNearEdge = barLoader.ensureHistoryNearEdge;

  Object.assign(ctx, {
    loadPaneBars: barLoader.loadPaneBars,
    loadBarsForPanes: barLoader.loadBarsForPanes,
    pushLiveBar: barLoader.pushLiveBar,
    prependHistory: barLoader.prependHistory,
    ensureHistoryNearEdge: barLoader.ensureHistoryNearEdge,
    setOverlayLoaderEnabled: barLoader.setOverlayLoaderEnabled,
    stashPaneResolutionCache: barLoader.stashPaneResolutionCache,
    loadBars: () =>
      barLoader.loadBars(ctx.getAllChartPanes, () => ctx.getActivePane() ?? ctx.chartPanes.get(0)),
  });
}
