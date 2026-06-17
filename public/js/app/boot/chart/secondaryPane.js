import { createTvChart } from "../../../chart/view/index.js";
import { attachChartBodyVerticalPan } from "../../../chart/price/panScale.js";
import { getPaneSymbol } from "../../../ui/chart/symbol/store.js";
import { wirePaneContextMenus } from "../../wire/contextMenus.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function createSecondaryPaneFactory(ctx) {
  return (paneIndex) => {
    const wrap = document.createElement("div");
    wrap.className = "tv-chart-wrap tv-chart-wrap--pane";
    const stage = document.createElement("div");
    stage.className = "tv-chart-wrap__stage";
    const chartEl = document.createElement("div");
    chartEl.className = "tv-chart-pane";
    chartEl.id = `chart-pane-${paneIndex}`;
    const paneStatusEl = document.createElement("div");
    paneStatusEl.className = "status-line tv-ohlc";
    paneStatusEl.setAttribute("aria-live", "polite");
    stage.appendChild(chartEl);
    stage.appendChild(paneStatusEl);
    wrap.appendChild(stage);

    const paneChart = createTvChart(chartEl, ctx.themeColors);
    attachChartBodyVerticalPan(chartEl, paneChart.chart, paneChart.series, {
      priceScaleId: () => ctx.activePriceScaleId(),
      isRatioLocked: () => Boolean(ctx.settingsStore.get().scales?.lockPriceToBarRatio),
      isBlocked: () => ctx.drawing?.shouldBlockChartPan?.() ?? false,
      onManualScaleLock: () => {
        const sc = ctx.settingsStore.get().scales ?? {};
        if (sc.autoScale !== false) ctx.settingsStore.set("scales", "autoScale", false);
      },
      onViewportChange: () => {
        ctx.flushViewportSnapshot?.();
        ctx.scheduleAutosaveLayout?.();
      },
    });
    paneChart.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (ctx._layoutRestorePending) return;
      ctx.scheduleAutosaveLayout?.();
    });
    const paneSymbol = getPaneSymbol(paneIndex, ctx.symbol);
    const paneState = {
      index: paneIndex,
      chart: paneChart.chart,
      series: paneChart.series,
      el: chartEl,
      symbol: paneSymbol,
      resolution: ctx.resolution,
      symbolInfo: null,
      bars: [],
      futureWhitespaceBars: null,
      statusEl: paneStatusEl,
      timeAdapter: null,
    };
    ctx.chartPanes.set(paneIndex, paneState);
    ctx.setupPaneExtras(paneState);
    ctx.wireLayoutPaneSync(paneChart.chart);
    ctx.applySettingsToChartLocal(paneChart.chart, paneChart.series, paneState);
    ctx.refreshPaneStatusLine(paneState);
    ctx.attachPaneDrawings(paneState);
    wirePaneContextMenus(ctx.buildPaneContextMenuOpts(paneState, wrap));
    wrap.addEventListener("mousedown", () => ctx.layoutManager?.setActivePane(paneIndex));

    return {
      chart: paneChart.chart,
      series: paneChart.series,
      chartEl,
      wrapEl: wrap,
      symbol: paneSymbol,
      resolution: ctx.resolution,
      symbolInfo: null,
      bars: [],
      index: paneIndex,
      destroy: () => {
        paneState.priceLineLabel?.destroy();
        paneState.studyScaleLabels?.destroy();
        ctx.drawingHub?.detachPane(paneIndex);
        ctx.chartPanes.delete(paneIndex);
        paneChart.chart.remove();
      },
    };
  };
}
