import {
  applyLiveBarToPaneSeries,
  updateFormingBarOnPaneSeries,
  appendNewBarOnPaneSeries,
  upsertBarOnPaneSeries,
} from "../../../chart/pane/data.js";
import { createBarLoader } from "../../bar/loader.js";
import { syncPaneEmptyState } from "../../../ui/chart/emptyState.js";
import { chartDebug } from "../../../debug/chart/index.js";
/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachBarLoader(ctx) {
  /** @param {object} pane */
  function replayLoadContextForPane(pane) {
    const sym = pane?.symbol ?? ctx.symbol ?? "";
    const res = pane?.resolution ?? ctx.resolution ?? "";

    const pending = ctx.replayPendingRestore;
    if (pending?.active) {
      if (pending.symbol && sym && pending.symbol !== sym) return null;
      if (pending.resolution && res && pending.resolution !== res) return null;
      const anchorFrom = Math.min(pending.selectedBarTime, pending.currentBarTime);
      return {
        anchorFrom,
        loadTo: undefined,
        capDisplay: pending.currentBarTime,
      };
    }

    const state = ctx.replay?.getState?.();
    if (!state?.active || state.currentBarTime == null) return null;

    const anchorFrom = Math.min(
      state.selectedBarTime ?? state.currentBarTime,
      state.currentBarTime,
    );
    const snap = (ctx.getActivePane?.() ?? ctx.chartPanes.get(0))?._replaySnapshot;
    return {
      anchorFrom,
      loadTo: snap?.liveEndBarTime ?? ctx.replayLiveEndUtc ?? undefined,
      capDisplay: null,
    };
  }

  const barLoader = createBarLoader({
    datafeed: ctx.datafeed,
    countBack: ctx.opts.countBack,
    historyChunk: ctx.opts.historyChunk ?? ctx.opts.countBack,
    getLayoutManager: () => ctx.layoutManager,
    getAllChartPanes: ctx.getAllChartPanes,
    loader: ctx.loader,
    refreshPaneCandleData: ctx.refreshPaneCandleData,
    prependHistoryToPaneSeries: ctx.prependHistoryToPaneSeries,
    applyLiveBarToPane: (pane) =>
      applyLiveBarToPaneSeries(pane, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions),
    updateFormingBarOnPane: (pane, bar) =>
      updateFormingBarOnPaneSeries(pane, bar, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions),
    appendNewBarOnPane: (pane, bar) =>
      appendNewBarOnPaneSeries(pane, bar, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions),
    upsertBarOnPane: (pane, bar) =>
      upsertBarOnPaneSeries(pane, bar, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions),
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
    },
    onPaneBarUpdate: (pane, meta = {}) => {
      pane.priceLineLabel?.requestRefresh();
      if (pane.index === (ctx.layoutManager?.getActivePaneIndex() ?? 0)) {
        ctx.scheduleStatusLine?.(pane);
        const bar = pane.bars?.at(-1);
        if (bar) ctx.notifyLiveBar?.(bar, meta);
      }
      if (meta.isNewBar) {
        if (ctx.indicatorController?.paneHasPlotSeriesIndicators?.(pane.index)) {
          ctx.refreshIndicatorsImmediate?.(pane.index);
        } else {
          ctx.refreshOverlaysImmediate?.(pane.index);
        }
      } else if (ctx.indicatorController?.paneNeedsLiveOverlayRefresh?.(pane.index)) {
        ctx.indicatorController.refreshOverlaysForPane?.(pane.index);
      }
    },
    onHistoryPrepended: (pane) => {
      const added = ctx.replayEngine?.mergeHistoryIntoSnapshot?.(pane) ?? 0;
      if (added > 0) ctx.replayFutureDim?.refreshAll?.();
      ctx.indicatorController?.invalidateOverlayCacheForPane?.(pane.index);
      ctx.ensureIndicatorData?.();
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
      if (pane._historyRestorePending || pane._loadingHistory) return;
      ctx.indicatorController?.invalidateOverlayCacheForPane?.(pane.index);
      if (ctx.indicatorController?.paneHasPlotSeriesIndicators?.(pane.index)) {
        ctx.refreshIndicatorsImmediate?.(pane.index);
      } else {
        ctx.refreshOverlaysImmediate?.(pane.index);
      }
    },
    syncPaneEmptyState: (pane, state) =>
      syncPaneEmptyState(pane, {
        ...state,
        onChangeSymbol: () => ctx.symbolSearchUi?.open?.(),
        onChangeInterval: () => ctx.tfPickerUi?.openPanel?.(),
      }),
    finishPaneAfterLoad: (pane, opts) => ctx.finishPaneAfterLoad?.(pane, opts),
    isReplayLocked: () => ctx.replayEngine?.isReplayLocked?.() ?? false,
    isReplayHistoryBlocked: () => ctx.replayEngine?.isReplayHistoryBlocked?.() ?? false,
    isChartPanning: () => Boolean(ctx.ui?.chartPanning),
    getReplayLoadCapTo: (pane) => replayLoadContextForPane(pane)?.capDisplay ?? null,
    getReplayLoadContext: replayLoadContextForPane,
  });

  ctx.viewportDeps.maintainLockedRatio = ctx.maintainLockedRatio;
  ctx.viewportDeps.syncLayoutDateRangeFrom = ctx.syncLayoutDateRangeFrom;
  ctx.viewportDeps.prependHistory = barLoader.prependHistory;
  ctx.viewportDeps.ensureHistoryNearEdge = barLoader.ensureHistoryNearEdge;
  ctx.viewportDeps.resumeHistoryAfterPan = barLoader.resumeHistoryAfterPan;
  ctx.viewportDeps.flushDeferredHistory = barLoader.flushDeferredHistory;

  const prevOnChartPanEnd = ctx.viewportDeps.onChartPanEnd;
  ctx.viewportDeps.onChartPanEnd = () => {
    prevOnChartPanEnd?.();
    for (const pane of ctx.getAllChartPanes()) {
      pane._flushStatusLineLayout?.();
    }
    requestAnimationFrame(() => {
      for (const pane of ctx.getAllChartPanes()) {
        void barLoader.resumeHistoryAfterPan(pane);
      }
    });
  };

  Object.assign(ctx, {
    loadPaneBars: barLoader.loadPaneBars,
    loadBarsForPanes: barLoader.loadBarsForPanes,
    pushLiveBar: barLoader.upsertLiveBar,
    upsertLiveBar: barLoader.upsertLiveBar,
    prependHistory: barLoader.prependHistory,
    ensureHistoryNearEdge: barLoader.ensureHistoryNearEdge,
    setOverlayLoaderEnabled: barLoader.setOverlayLoaderEnabled,
    stashPaneResolutionCache: barLoader.stashPaneResolutionCache,
    loadBars: () =>
      barLoader.loadBars(ctx.getAllChartPanes, () => ctx.getActivePane() ?? ctx.chartPanes.get(0)),
  });
}
