import { savePaneSymbols } from "../../../ui/chart/symbol/store.js";
import {
  barSecForPane,
  barsForPane,
  buildChartSeriesForPane,
  refreshPaneCandleData as refreshPaneCandles,
  prependHistoryToPaneSeries as prependHistoryToPane,
} from "../../../chart/pane/data.js";
import { buildCandleSeriesData } from "../../../chart/bar/data.js";
import { isElectronicSession } from "../../../primitives/session/background.js";
import { resolveTimezone } from "../../../chart/timezone/list.js";
import { createLayoutSync } from "../../layout/sync.js";
import {
  resetPaneChartViewport,
  resetPaneTimeViewport,
  resetPanePriceScale,
  scrollPaneToLatest,
} from "../../../chart/viewportReset.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachPaneHelpers(ctx) {
  function getActivePane() {
    const idx = ctx.layoutManager?.getActivePaneIndex() ?? 0;
    return ctx.chartPanes.get(idx) ?? ctx.chartPanes.get(0);
  }

  function getAllChartPanes() {
    return [...ctx.chartPanes.values()].sort((a, b) => a.index - b.index);
  }

  function getLayoutCharts() {
    return getAllChartPanes().map((p) => ({ chart: p.chart, series: p.series }));
  }

  function getLayoutPanes() {
    return getAllChartPanes().map((p) => ({
      chart: p.chart,
      series: p.series,
      symbol: p.symbol,
      bars: p.bars,
    }));
  }

  const { syncLayoutDateRangeFrom, syncLayoutCrosshairFrom, wireLayoutPaneSync } = createLayoutSync({
    getLayoutManager: () => ctx.layoutManager,
    getLayoutCharts,
    getLayoutPanes,
    isBarsLoading: () => Boolean(ctx.ui?.barsLoading),
    isHistoryRestorePending: () =>
      getAllChartPanes().some((p) => p._historyRestorePending),
  });
  ctx.syncLayoutDateRangeFrom = syncLayoutDateRangeFrom;
  ctx.wireLayoutPaneSync = wireLayoutPaneSync;

  function barSecForPaneLocal(pane) {
    return barSecForPane(pane, ctx.resolutions);
  }

  function barSec() {
    const pane = getActivePane();
    return pane ? barSecForPaneLocal(pane) : barSecForPaneLocal({ resolution: ctx.resolution });
  }

  function barsForChart() {
    const pane = getActivePane();
    if (pane) return barsForPane(pane, ctx.settingsStore, ctx.symbolInfo);
    const sym = ctx.settingsStore.get().symbol ?? {};
    const tz = resolveTimezone(sym.timezone, ctx.symbolInfo);
    if (sym.session === "regular") {
      return ctx.bars.filter((b) => !isElectronicSession(b.time, tz, ctx.symbolInfo?.type));
    }
    return ctx.bars;
  }

  function buildChartSeriesForPaneLocal(pane, visible) {
    return buildChartSeriesForPane(pane, visible, ctx.settingsStore, ctx.resolutions);
  }

  function buildChartSeriesForDisplay(visible) {
    const pane = getActivePane();
    if (pane) return buildChartSeriesForPaneLocal(pane, visible);
    const sym = ctx.settingsStore.get().symbol ?? {};
    return buildCandleSeriesData(visible, sym);
  }

  function persistPaneSymbols() {
    savePaneSymbols(getAllChartPanes().map((p) => ({ index: p.index, symbol: p.symbol })));
  }

  function refreshPaneCandleData(pane, opts = {}) {
    refreshPaneCandles(pane, ctx.settingsStore, ctx.symbolInfo, ctx.resolutions, (p) => {
      if (p.index === 0) ctx.timeAdapter = p.timeAdapter;
    }, opts);
  }

  function prependHistoryToPaneSeries(pane, olderUtcBars, opts = {}) {
    return prependHistoryToPane(
      pane,
      olderUtcBars,
      ctx.settingsStore,
      ctx.symbolInfo,
      ctx.resolutions,
      opts,
    );
  }

  function refreshCandleData() {
    for (const pane of getAllChartPanes()) {
      refreshPaneCandleData(pane);
      pane.priceLineLabel?.requestRefresh();
    }
    ctx.applySymbolLineStyleLocal();
  }

  function scrollPaneToLatestLocal(pane) {
    scrollPaneToLatest(pane, ctx.settingsStore);
  }

  function resetPaneChartView(pane) {
    resetPaneChartViewport(pane, ctx.settingsStore, ctx.activePriceScaleId);
  }

  function resetPaneTimeScale(pane) {
    resetPaneTimeViewport(pane, ctx.settingsStore);
  }

  function resetPanePriceScaleLocal(pane) {
    resetPanePriceScale(pane, ctx.settingsStore, ctx.activePriceScaleId);
  }

  function switchActivePane(index) {
    const pane = ctx.chartPanes.get(index);
    if (!pane) return;

    ctx.symbol = pane.symbol;
    ctx.resolution = pane.resolution;
    ctx.symbolInfo = pane.symbolInfo;
    ctx.bars = pane.bars;

    ctx.symbolSearchUi?.setSymbol(pane.symbol);
    ctx.tfPickerUi?.setResolution(pane.resolution);
    ctx.refreshWatermark();
    ctx.refreshStatusLine();

    ctx.drawingHub?.setActivePane(index);
    ctx.applyDrawingCursorAll();
  }

  async function activatePaneIndex(index) {
    ctx.layoutManager?.setActivePane(index);
    switchActivePane(index);
  }

  function getDrawingCountForPane(index) {
    const fromHub = ctx.drawingHub?.getDrawingsByPane?.()?.[String(index)]?.length;
    if (fromHub != null) return fromHub;
    return index === (ctx.layoutManager?.getActivePaneIndex() ?? 0)
      ? ctx.drawing?.getCount?.() ?? 0
      : 0;
  }

  function getIndicatorCountForPane(index) {
    return ctx.indicatorController?.getCountForPane?.(index) ?? 0;
  }

  function removeIndicatorsForPane(index) {
    ctx.indicatorController?.clearForPane?.(index);
  }

  Object.assign(ctx, {
    getActivePane,
    getAllChartPanes,
    getLayoutCharts,
    barSecForPaneLocal,
    barSec,
    barsForChart,
    buildChartSeriesForPaneLocal,
    buildChartSeriesForDisplay,
    persistPaneSymbols,
    refreshPaneCandleData,
    prependHistoryToPaneSeries,
    refreshCandleData,
    scrollPaneToLatest: scrollPaneToLatestLocal,
    resetPaneChartView,
    resetPaneTimeScale,
    resetPanePriceScale: resetPanePriceScaleLocal,
    switchActivePane,
    activatePaneIndex,
    getDrawingCountForPane,
    getIndicatorCountForPane,
    removeIndicatorsForPane,
    syncLayoutCrosshairFrom,
  });
}
