import { mountSymbolSearch } from "../../../ui/symbol/search.js";
import { mountTimeframePicker } from "../../../ui/timeframe/picker.js";
import { debugSymbolChange, debugTimeframeChange } from "../../../debug/chart/symbolTimeframe.js";
import { captureVisibleViewport, restoreVisibleViewport } from "../../../chart/pane/viewport.js";

/**
 * @param {object[]} panes
 */
function capturePaneViewports(panes) {
  return panes.map((p) => (p.chart ? captureVisibleViewport(p.chart) : null));
}

/**
 * @param {object[]} panes
 * @param {ReturnType<typeof captureVisibleViewport>[]} saved
 */
function restorePaneViewports(panes, saved) {
  for (let i = 0; i < panes.length; i += 1) {
    const pane = panes[i];
    const captured = saved[i];
    if (!pane?.chart || !captured) continue;
    restoreVisibleViewport(pane.chart, captured);
  }
}

/**
 * @param {import("./state.js").BootContext} ctx
 * @param {object[]} panes
 */
function preparePanesForSeriesReload(ctx, panes) {
  for (const pane of panes) {
    ctx.indicatorController?.clearOverlaysForPane?.(pane.index);
  }
}

/**
 * @param {import("./state.js").BootContext} ctx
 * @param {object[]} panes
 */
function finishSeriesReload(ctx, panes) {
  ctx.refreshIndicatorsImmediate?.();
  for (const pane of panes) {
    pane.priceLineLabel?.requestRefresh();
  }
  ctx.refreshIndicatorLegends?.();
}

/**
 * @param {import("./state.js").BootContext} ctx
 */
export async function wireSymbolAndTimeframePickers(ctx) {
  if (ctx.symbolPicker) {
    ctx.symbolSearchUi = mountSymbolSearch({
      root: ctx.symbolPicker,
      datafeed: ctx.datafeed,
      initialSymbol: ctx.symbol,
      onSelect: async (sym) => {
        const sync = ctx.layoutManager?.getSync();
        if (ctx.layoutManager && sync?.symbol) {
          const from = ctx.symbol;
          const panes = ctx.getAllChartPanes();
          debugSymbolChange({
            symbol: sym,
            from,
            sync: true,
            paneCount: panes.length,
          });
          const saved = capturePaneViewports(panes);
          preparePanesForSeriesReload(ctx, panes);
          for (const pane of panes) {
            pane.symbol = sym;
          }
          ctx.symbol = sym;
          ctx.refreshWatermark();
          await ctx.loadBarsForPanes(panes, { force: true });
          restorePaneViewports(panes, saved);
          finishSeriesReload(ctx, panes);
          const active = ctx.getActivePane();
          if (active) {
            ctx.symbolInfo = active.symbolInfo;
            ctx.applySymbolFormat(ctx.symbolInfo);
          }
          ctx.persistPaneSymbols();
          return;
        }
        const pane = ctx.getActivePane() ?? ctx.chartPanes.get(0);
        if (!pane) return;
        const from = pane.symbol;
        debugSymbolChange({
          symbol: sym,
          from,
          paneIndex: pane.index,
          sync: false,
        });
        const saved = capturePaneViewports([pane]);
        preparePanesForSeriesReload(ctx, [pane]);
        pane.symbol = sym;
        if (pane.index === 0) ctx.chartPanes.get(0).symbol = sym;
        ctx.symbol = sym;
        ctx.refreshWatermark();
        pane.symbolInfo = await ctx.datafeed.resolveSymbol(sym);
        ctx.symbolInfo = pane.symbolInfo;
        ctx.applySymbolFormat(ctx.symbolInfo);
        await ctx.loadPaneBars(pane, { force: true });
        restorePaneViewports([pane], saved);
        finishSeriesReload(ctx, [pane]);
        ctx.refreshStatusLine();
        ctx.persistPaneSymbols();
      },
    });
    await ctx.symbolSearchUi.init();
  }

  if (ctx.tfPickerEl) {
    ctx.tfPickerUi = mountTimeframePicker({
      root: ctx.tfPickerEl,
      resolutions: ctx.resolutions,
      initial: ctx.resolution,
      onResolutionsChange: (res) => {
        ctx.resolutions = res;
      },
      onChange: async (res) => {
        const sync = ctx.layoutManager?.getSync();
        if (ctx.layoutManager && sync?.interval) {
          const from = ctx.resolution;
          const panes = ctx.getAllChartPanes();
          debugTimeframeChange({
            resolution: res,
            from,
            sync: true,
            paneCount: panes.length,
          });
          preparePanesForSeriesReload(ctx, panes);
          for (const pane of panes) {
            ctx.stashPaneResolutionCache(pane, pane.resolution);
            pane.resolution = res;
          }
          ctx.resolution = res;
          ctx.refreshWatermark();
          ctx.refreshStatusLine();
          await ctx.loadBarsForPanes(panes, { force: true });
          finishSeriesReload(ctx, panes);
          ctx.afterTimeframeChange();
          return;
        }
        const pane = ctx.getActivePane() ?? ctx.chartPanes.get(0);
        if (!pane) return;
        const from = pane.resolution;
        debugTimeframeChange({
          resolution: res,
          from,
          paneIndex: pane.index,
          sync: false,
        });
        preparePanesForSeriesReload(ctx, [pane]);
        ctx.stashPaneResolutionCache(pane, pane.resolution);
        pane.resolution = res;
        if (pane.index === 0) ctx.chartPanes.get(0).resolution = res;
        ctx.resolution = res;
        ctx.refreshWatermark();
        ctx.refreshStatusLine();
        await ctx.loadPaneBars(pane, { force: true });
        finishSeriesReload(ctx, [pane]);
        ctx.afterTimeframeChange();
      },
    });
  }
}
