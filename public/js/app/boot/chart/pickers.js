import { mountSymbolSearch } from "../../../ui/symbol/search.js";
import { mountTimeframePicker } from "../../../ui/timeframe/picker.js";
import { debugSymbolChange, debugTimeframeChange } from "../../../debug/chart/symbolTimeframe.js";
import { captureVisibleViewport, restoreVisibleViewport } from "../../../chart/pane/viewport.js";
import { resolutionSec } from "../../../chart/resolutions.js";
import {
  captureViewportBarLayout,
  restoreViewportBarLayout,
  computeViewportBarLayoutLogical,
  computeViewportLogicalFromUtc,
} from "../../../chart/pane/viewportBarLayout.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import { seedHtfBars } from "../../bar/htfBarCache.js";
import {
  showChartPendingOverlay,
  hideChartPendingOverlay,
} from "../../../ui/loader/chartPendingOverlay.js";

/** @param {import("./state.js").BootContext} ctx @param {string} sym */
function notifyHostSymbolChange(ctx, sym) {
  try {
    ctx.opts?.onSymbolChange?.(sym);
  } catch (err) {
    console.error("[BWC] onSymbolChange failed:", err);
  }
}

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
function capturePaneBarLayouts(ctx, panes) {
  return panes.map((p) => captureViewportBarLayout(p, ctx.settingsStore, ctx.resolutions));
}

/** @param {string | null | undefined} fromRes @param {string | null | undefined} toRes */
function viewportResolutionJumpRatio(fromRes, toRes) {
  const fromSec = resolutionSec(fromRes);
  const toSec = resolutionSec(toRes);
  if (!fromSec || !toSec) return 1;
  return Math.max(fromSec, toSec) / Math.min(fromSec, toSec);
}

/**
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} layout
 * @param {import("./state.js").BootContext} ctx
 */
function resolveTimeframeSwitchLogicalRange(pane, layout, ctx) {
  if (!layout || !pane?.bars?.length) return null;
  const barLogical = computeViewportBarLayoutLogical(pane, layout);
  if (barLogical) return barLogical;
  if (viewportResolutionJumpRatio(layout.resolution, pane.resolution) <= 12) {
    return computeViewportLogicalFromUtc(pane, layout, ctx.settingsStore, ctx.resolutions);
  }
  return null;
}

/**
 * setData + viewport in one paint; price margins restored without re-clamping bar slots.
 * @param {import("./state.js").BootContext} ctx
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} savedLayout
 */
function paintPaneAfterTimeframeLoad(ctx, pane, savedLayout) {
  const logicalRange = resolveTimeframeSwitchLogicalRange(pane, savedLayout, ctx);
  ctx.refreshPaneCandleData?.(pane, {
    logicalRange: logicalRange ?? undefined,
    deferSessionBg: true,
  });
  if (!savedLayout) return;
  restoreViewportBarLayout(
    pane,
    savedLayout,
    ctx.settingsStore,
    ctx.resolutions,
    "timeframe",
    ctx.activePriceScaleId,
    { skipLogical: Boolean(logicalRange) },
  );
}

/** @param {object | object[]} panes */
function suppressPaneHistoryPrefetch(panes) {
  const list = Array.isArray(panes) ? panes : [panes];
  for (const pane of list) {
    if (pane) pane._suppressHistoryPrefetch = true;
  }
}

/** @param {object | object[]} panes */
function releasePaneHistoryPrefetch(panes) {
  const list = Array.isArray(panes) ? panes : [panes];
  requestAnimationFrame(() => {
    for (const pane of list) {
      if (pane) delete pane._suppressHistoryPrefetch;
    }
  });
}

/**
 * @param {import("./state.js").BootContext} ctx
 * @param {object[]} panes
 * @param {ReturnType<typeof captureViewportBarLayout>[]} saved
 */
function restorePaneBarLayouts(ctx, panes, saved) {
  for (let i = 0; i < panes.length; i += 1) {
    restoreViewportBarLayout(
      panes[i],
      saved[i],
      ctx.settingsStore,
      ctx.resolutions,
      "timeframe",
      ctx.activePriceScaleId,
    );
  }
}

/**
 * @param {import("./state.js").BootContext} ctx
 * @param {() => void} restoreLayout
 */
async function afterTimeframeChangeThenRestoreViewport(ctx, restoreLayout) {
  ctx._viewportRestorePending = true;
  try {
    await ctx.afterTimeframeChange?.();
    restoreLayout();
  } finally {
    ctx._viewportRestorePending = false;
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
 * Seed current pane bars into HTF cache for its current resolution.
 * Helps indicators (Levels/FVG) avoid waiting after timeframe switches.
 * @param {import("./state.js").BootContext} ctx
 * @param {object} pane
 */
function seedPaneResolutionAsHtf(ctx, pane) {
  if (!pane?.symbol || !pane?.resolution) return;
  const view = getPaneChartView(
    pane,
    ctx.settingsStore,
    pane.symbolInfo ?? ctx.symbolInfo,
    ctx.resolutions,
  );
  if (!view?.utcBars?.length) return;
  seedHtfBars(
    pane.symbol,
    pane.resolution,
    view.utcBars,
    view.chartBars,
    "timeframe-switch",
  );
}

/**
 * @param {import("./state.js").BootContext} ctx
 * @param {object[]} panes
 */
function finishSeriesReload(ctx, panes) {
  ctx.ensureIndicatorData?.();
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
  /** @type {number} */
  let tfChangeGen = 0;

  if (ctx.symbolPicker) {
    ctx.changeSymbolFromPicker = async (sym) => {
      const sync = ctx.layoutManager?.getSync();
      const panes = ctx.getAllChartPanes();
      const activePane = ctx.getActivePane() ?? ctx.chartPanes.get(0);
      if (ctx.layoutManager && sync?.symbol) {
        if (ctx.symbol === sym && panes.every((p) => p.symbol === sym)) return;
      } else if (activePane?.symbol === sym) {
        return;
      }
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
        const prevSymbols = panes.map((p) => p.symbol);
        for (const pane of panes) {
          pane.symbol = sym;
        }
        ctx.symbol = sym;
        ctx.refreshWatermark();
        await showChartPendingOverlay(ctx, panes);
        try {
          await ctx.loadBarsForPanes(panes, { force: true, deferChartRefresh: true });
          for (const pane of panes) {
            ctx.refreshPaneCandleData?.(pane);
          }
          restorePaneViewports(panes, saved);
          finishSeriesReload(ctx, panes);
          const active = ctx.getActivePane();
          if (active) {
            ctx.symbolInfo = active.symbolInfo;
            ctx.applySymbolFormat(ctx.symbolInfo);
          }
          ctx.persistPaneSymbols();
          notifyHostSymbolChange(ctx, sym);
          for (const pane of panes) {
            const prev = prevSymbols[pane.index];
            if (prev && prev !== pane.symbol) {
              ctx.unsubscribeQuotesForPane?.({ symbol: prev });
            }
            ctx.subscribeQuotesForPane?.(pane, pane.symbolInfo);
          }
        } finally {
          await hideChartPendingOverlay(ctx);
        }
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
      await showChartPendingOverlay(ctx, pane);
      try {
        pane.symbolInfo = await ctx.datafeed.resolveSymbol(sym);
        ctx.symbolInfo = pane.symbolInfo;
        ctx.applySymbolFormat(ctx.symbolInfo);
        await ctx.loadPaneBars(pane, { force: true, deferChartRefresh: true });
        ctx.refreshPaneCandleData?.(pane);
        restorePaneViewports([pane], saved);
        finishSeriesReload(ctx, [pane]);
        ctx.refreshStatusLine();
        ctx.persistPaneSymbols();
        notifyHostSymbolChange(ctx, sym);
        if (from && from !== sym) {
          ctx.unsubscribeQuotesForPane?.({ symbol: from });
        }
        ctx.subscribeQuotesForPane?.(pane, pane.symbolInfo);
      } finally {
        await hideChartPendingOverlay(ctx);
      }
    };

    ctx.symbolSearchUi = mountSymbolSearch({
      root: ctx.symbolPicker,
      datafeed: ctx.datafeed,
      initialSymbol: ctx.symbol,
      onSelect: (sym) => ctx.changeSymbolFromPicker(sym),
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
        const gen = ++tfChangeGen;
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
          const savedLayouts = capturePaneBarLayouts(ctx, panes);
          for (const pane of panes) {
            seedPaneResolutionAsHtf(ctx, pane);
            ctx.replayEngine?.beforeResolutionChange?.(pane);
            ctx.stashPaneResolutionCache(pane, pane.resolution);
            pane.resolution = res;
          }
          ctx.resolution = res;
          ctx.refreshWatermark();
          ctx.refreshStatusLine();
          const replayLocked = ctx.replayEngine?.isReplayLocked?.() ?? false;
          suppressPaneHistoryPrefetch(panes);
          await showChartPendingOverlay(ctx, panes);
          try {
            await ctx.loadBarsForPanes(panes, {
              force: true,
              deferChartRefresh: true,
              skipPriceScaleMargins: true,
            });
            if (gen !== tfChangeGen) return;
            if (replayLocked) {
              await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
              finishSeriesReload(ctx, panes);
            } else {
              for (let i = 0; i < panes.length; i += 1) {
                paintPaneAfterTimeframeLoad(ctx, panes[i], savedLayouts[i]);
              }
              finishSeriesReload(ctx, panes);
              await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
            }
          } finally {
            if (gen === tfChangeGen) {
              releasePaneHistoryPrefetch(panes);
              await hideChartPendingOverlay(ctx);
            }
          }
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
        const savedLayout = captureViewportBarLayout(pane, ctx.settingsStore, ctx.resolutions);
        seedPaneResolutionAsHtf(ctx, pane);
        ctx.replayEngine?.beforeResolutionChange?.(pane);
        ctx.stashPaneResolutionCache(pane, pane.resolution);
        pane.resolution = res;
        if (pane.index === 0) ctx.chartPanes.get(0).resolution = res;
        ctx.resolution = res;
        ctx.refreshWatermark();
        ctx.refreshStatusLine();
        const replayLocked = ctx.replayEngine?.isReplayLocked?.() ?? false;
        suppressPaneHistoryPrefetch(pane);
        await showChartPendingOverlay(ctx, pane);
        try {
          await ctx.loadPaneBars(pane, {
            force: true,
            deferChartRefresh: true,
            skipPriceScaleMargins: true,
          });
          if (gen !== tfChangeGen) return;
          if (replayLocked) {
            await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
            finishSeriesReload(ctx, [pane]);
          } else {
            paintPaneAfterTimeframeLoad(ctx, pane, savedLayout);
            finishSeriesReload(ctx, [pane]);
            await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
          }
        } finally {
          if (gen === tfChangeGen) {
            releasePaneHistoryPrefetch(pane);
            await hideChartPendingOverlay(ctx);
          }
        }
      },
    });
  }
}
