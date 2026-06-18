import {
  applyLiveBarToPaneSeries,
  updateFormingBarOnPaneSeries,
  appendNewBarOnPaneSeries,
} from "../../../chart/pane/data.js";
import { createBarLoader } from "../../bar/loader.js";
import { syncPaneEmptyState } from "../../../ui/chart/emptyState.js";
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
    appendNewBarOnPane: (pane, bar) =>
      appendNewBarOnPaneSeries(pane, bar, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions),
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
    onPaneBarUpdate: (pane, meta = {}) => {
      pane.priceLineLabel?.requestRefresh();
      if (meta.isNewBar) {
        if (ctx.indicatorController?.paneHasPlotSeriesIndicators?.(pane.index)) {
          ctx.refreshIndicatorsImmediate?.(pane.index);
        } else {
          ctx.refreshOverlaysImmediate?.(pane.index);
        }
      }
    },
    onHistoryPrepended: (pane) => {
      pane.priceLineLabel?.requestRefresh();
      if (ctx.indicatorController?.paneHasPlotSeriesIndicators?.(pane.index)) {
        ctx.refreshIndicatorsImmediate?.(pane.index);
      } else {
        ctx.refreshOverlaysImmediate?.(pane.index);
      }
      if (!ctx.layoutManager?.getSync().dateRange) return;
      const panes = ctx.getAllChartPanes();
      const source = panes.reduce((best, p) => (p.bars.length > best.bars.length ? p : best), pane);
      ctx.syncLayoutDateRangeFrom(source.chart);
    },
    onPaneHistoryDataUpdated: (pane) => {
      ctx.indicatorController?.syncOverlayTimeCtxForPane?.(pane.index);
    },
    syncPaneEmptyState: (pane, state) =>
      syncPaneEmptyState(pane, {
        ...state,
        onChangeSymbol: () => ctx.symbolSearchUi?.open?.(),
        onChangeInterval: () => ctx.tfPickerUi?.openPanel?.(),
      }),
    finishPaneAfterLoad: (pane, opts) => ctx.finishPaneAfterLoad?.(pane, opts),
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
