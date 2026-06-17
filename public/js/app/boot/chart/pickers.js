import { mountSymbolSearch } from "../../../ui/symbol/search.js";
import { mountTimeframePicker } from "../../../ui/timeframe/picker.js";
import { debugSymbolChange, debugTimeframeChange } from "../../../debug/chart/symbolTimeframe.js";

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
          for (const pane of panes) {
            pane.symbol = sym;
          }
          ctx.symbol = sym;
          ctx.refreshWatermark();
          await ctx.loadBarsForPanes(panes, { force: true });
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
        pane.symbol = sym;
        if (pane.index === 0) ctx.chartPanes.get(0).symbol = sym;
        ctx.symbol = sym;
        ctx.refreshWatermark();
        pane.symbolInfo = await ctx.datafeed.resolveSymbol(sym);
        ctx.symbolInfo = pane.symbolInfo;
        ctx.applySymbolFormat(ctx.symbolInfo);
        await ctx.loadPaneBars(pane, { force: true });
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
          for (const pane of panes) {
            ctx.stashPaneResolutionCache(pane, pane.resolution);
            pane.resolution = res;
          }
          ctx.resolution = res;
          ctx.refreshWatermark();
          ctx.refreshStatusLine();
          await ctx.loadBarsForPanes(panes, { force: true });
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
        ctx.stashPaneResolutionCache(pane, pane.resolution);
        pane.resolution = res;
        if (pane.index === 0) ctx.chartPanes.get(0).resolution = res;
        ctx.resolution = res;
        ctx.refreshWatermark();
        ctx.refreshStatusLine();
        await ctx.loadPaneBars(pane, { force: true });
        ctx.afterTimeframeChange();
      },
    });
  }
}
