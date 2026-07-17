import { mountSymbolSearch } from "../../../ui/symbol/search.js";
import { mountTimeframePicker } from "../../../ui/timeframe/picker.js";
import { debugSymbolChange, debugTimeframeChange } from "../../../debug/chart/symbolTimeframe.js";
import { captureVisibleViewport, restoreVisibleViewport, withPreservedViewport } from "../../../chart/pane/viewport.js";
import {
  captureViewportBarLayout,
  restoreViewportBarLayout,
} from "../../../chart/pane/viewportBarLayout.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import { replayBarIndexForUtcTime } from "../../../replay/persist.js";
import { bumpDataEpoch, clearHtfCoarserThan, seedHtfBars } from "../../bar/htfBarCache.js";
import { resolutionSec } from "../../../chart/resolutions.js";
import {
  paintPaneAfterTimeframeLoad,
  syncHostReplayViewportAfterTfSwitch,
} from "./timeframeSwitch.js";
import {
  showChartPendingOverlay,
  hideChartPendingOverlay,
} from "../../../ui/loader/chartPendingOverlay.js";
import { showChartError, hideChartError } from "../../../ui/chart/emptyState.js";

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
export function preparePanesForSeriesReload(ctx, panes) {
  for (const pane of panes) {
    ctx.indicatorController?.clearOverlaysForPane?.(pane.index);
  }
}

/**
 * Seed current pane bars into HTF cache for its current resolution.
 * Helps overlay indicators avoid waiting after timeframe switches.
 * @param {import("./state.js").BootContext} ctx
 * @param {object} pane
 */
export function seedPaneResolutionAsHtf(ctx, pane) {
  if (!pane?.symbol || !pane?.resolution) return;
  const view = getPaneChartView(
    pane,
    ctx.settingsStore,
    pane.symbolInfo ?? ctx.symbolInfo,
    ctx.resolutions,
  );
  if (!view?.utcBars?.length) return;
  let utcBars = view.utcBars;
  let chartBars = view.chartBars ?? view.utcBars;
  if (ctx.opts?.replayHostControlled) {
    const anchorSec = ctx.opts.getPlaybackAnchorSec?.(pane.resolution);
    if (anchorSec != null && Number.isFinite(anchorSec)) {
      const last = utcBars.at(-1)?.time;
      if (last != null && last > anchorSec) {
        const idx = replayBarIndexForUtcTime(utcBars, anchorSec);
        if (idx != null && idx < utcBars.length - 1) {
          utcBars = utcBars.slice(0, idx + 1);
          chartBars = chartBars.slice(0, idx + 1);
        }
      }
    }
  }
  seedHtfBars(
    pane.symbol,
    pane.resolution,
    utcBars,
    chartBars,
    "timeframe-switch",
  );
}

/**
 * Seed leaving-TF bars into HTF cache when switching to same/coarser TF only.
 * HTF→LTF: invalidate coarse cache — native 15m bars poison 1m-aggregated HTF levels.
 * @param {import("./state.js").BootContext} ctx
 * @param {object} pane
 * @param {string} targetResolution
 */
export function prepareHtfBeforeTimeframeSwitch(ctx, pane, targetResolution) {
  if (!pane?.symbol) return;
  const fromSec = resolutionSec(pane.resolution);
  const toSec = resolutionSec(targetResolution);
  if (fromSec != null && toSec != null && toSec < fromSec) {
    if (!ctx.opts?.replayHostControlled) {
      clearHtfCoarserThan(pane.symbol, targetResolution);
    } else {
      seedPaneResolutionAsHtf(ctx, pane);
    }
    return;
  }
  seedPaneResolutionAsHtf(ctx, pane);
}

/**
 * @param {import("./state.js").BootContext} ctx
 * @param {object[]} panes
 */
export async function finishSeriesReload(ctx, panes) {
  for (const pane of panes) {
    ctx.indicatorController?.syncOverlayTimeCtxForPane?.(pane.index);
  }
  for (const pane of panes) {
    delete pane._suppressHistoryPrefetch;
    pane._indicatorHistoryBulkLoad = true;
  }
  try {
    for (const pane of panes) {
      await ctx.ensureIndicatorChartHistory?.(pane);
    }
    for (const pane of panes) {
      await ctx.ensureIndicatorDataThenOverlay?.(pane);
    }
    for (const pane of panes) {
      if (ctx.indicatorController?.paneHasPlotSeriesIndicators?.(pane.index)) {
        ctx.refreshIndicatorsImmediate?.(pane.index);
      }
    }
  } finally {
    for (const pane of panes) {
      delete pane._indicatorHistoryBulkLoad;
    }
  }
  if (ctx.opts?.replayHostControlled) {
    for (const pane of panes) {
      syncHostReplayViewportAfterTfSwitch(ctx, pane, pane._tfSwitchFromResolution ?? null);
      delete pane._tfSwitchFromResolution;
      delete pane._tfSwitchSavedLayout;
      delete pane._hostReplayTfSwitchInFlight;
    }
  }
  for (const pane of panes) {
    pane.priceLineLabel?.requestRefresh();
    if (pane.chart && pane.series) {
      withPreservedViewport(
        pane.chart,
        () => ctx.applySettingsToChartLocal?.(pane.chart, pane.series, pane),
        { followUpFrames: 1 },
      );
    }
  }
  ctx.refreshIndicatorLegends?.();
}

export { paintPaneAfterTimeframeLoad } from "./timeframeSwitch.js";

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
        bumpDataEpoch("symbol-change");
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
          await finishSeriesReload(ctx, panes);
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
      bumpDataEpoch("symbol-change");
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
        await finishSeriesReload(ctx, [pane]);
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
        const paneForValidate = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
        const fromRes = paneForValidate?.resolution ?? ctx.resolution;
        if (typeof ctx.opts?.validateResolutionChange === "function") {
          const symbol = paneForValidate?.symbol ?? ctx.symbol;
          try {
            const verdict = await ctx.opts.validateResolutionChange({
              from: fromRes,
              to: res,
              symbol,
            });
            const rejected =
              verdict === false || (verdict && typeof verdict === "object" && verdict.ok === false);
            if (rejected) {
              const text =
                (verdict && typeof verdict === "object" && verdict.message) ||
                `No ${res} data at the current replay time.`;
              showChartError(ctx, paneForValidate, {
                title: "No data",
                text,
              });
              return;
            }
            hideChartError(ctx, paneForValidate);
          } catch (err) {
            console.error("[BWC] validateResolutionChange failed:", err);
            showChartError(ctx, paneForValidate, {
              title: "No data",
              text: "Could not verify data for this interval.",
            });
            return;
          }
        }
        if (ctx.layoutManager && sync?.interval) {
          const from = ctx.resolution;
          const panes = ctx.getAllChartPanes();
          debugTimeframeChange({
            resolution: res,
            from,
            sync: true,
            paneCount: panes.length,
          });
          const savedLayouts = capturePaneBarLayouts(ctx, panes);
          bumpDataEpoch("timeframe-change");
          preparePanesForSeriesReload(ctx, panes);
          for (let i = 0; i < panes.length; i += 1) {
            const pane = panes[i];
            pane._tfSwitchFromResolution = pane.resolution;
            pane._tfSwitchSavedLayout = savedLayouts[i] ?? null;
            prepareHtfBeforeTimeframeSwitch(ctx, pane, res);
            ctx.replayEngine?.beforeResolutionChange?.(pane, {
              viewportLayout: savedLayouts[i] ?? null,
            });
            ctx.stashPaneResolutionCache(pane, pane.resolution);
            pane.resolution = res;
          }
          ctx.resolution = res;
          ctx.refreshWatermark();
          ctx.refreshStatusLine();
          try {
            ctx.opts?.onIntervalChange?.(res);
          } catch (err) {
            console.error("[BWC] onIntervalChange failed:", err);
          }
          const replayLocked = ctx.replayEngine?.isReplayLocked?.() ?? false;
          const hostReplay = Boolean(ctx.opts?.replayHostControlled);
          suppressPaneHistoryPrefetch(panes);
          await showChartPendingOverlay(ctx, panes);
          try {
            await ctx.loadBarsForPanes(panes, {
              force: true,
              deferChartRefresh: true,
              skipPriceScaleMargins: true,
            });
            if (gen !== tfChangeGen) return;
            if (replayLocked || hostReplay) {
              await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
            } else {
              for (let i = 0; i < panes.length; i += 1) {
                paintPaneAfterTimeframeLoad(ctx, panes[i], savedLayouts[i]);
              }
              await finishSeriesReload(ctx, panes);
              await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
              return;
            }
            await finishSeriesReload(ctx, panes);
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
        const savedLayout = captureViewportBarLayout(pane, ctx.settingsStore, ctx.resolutions);
        bumpDataEpoch("timeframe-change");
        preparePanesForSeriesReload(ctx, [pane]);
        pane._tfSwitchFromResolution = pane.resolution;
        pane._tfSwitchSavedLayout = savedLayout;
        prepareHtfBeforeTimeframeSwitch(ctx, pane, res);
        ctx.replayEngine?.beforeResolutionChange?.(pane, { viewportLayout: savedLayout });
        ctx.stashPaneResolutionCache(pane, pane.resolution);
        pane.resolution = res;
        if (pane.index === 0) ctx.chartPanes.get(0).resolution = res;
        const activeIdx = ctx.getActivePane?.()?.index ?? 0;
        if (pane.index === activeIdx) ctx.resolution = res;
        ctx.refreshWatermark();
        ctx.refreshStatusLine();
        try {
          ctx.opts?.onIntervalChange?.(res);
        } catch (err) {
          console.error("[BWC] onIntervalChange failed:", err);
        }
        const replayLocked = ctx.replayEngine?.isReplayLocked?.() ?? false;
        const hostReplay = Boolean(ctx.opts?.replayHostControlled);
        suppressPaneHistoryPrefetch(pane);
        await showChartPendingOverlay(ctx, pane);
        try {
          await ctx.loadPaneBars(pane, {
            force: true,
            deferChartRefresh: true,
            skipPriceScaleMargins: true,
          });
          if (gen !== tfChangeGen) return;
          if (replayLocked || hostReplay) {
            await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
          } else {
            paintPaneAfterTimeframeLoad(ctx, pane, savedLayout);
            await finishSeriesReload(ctx, [pane]);
            await afterTimeframeChangeThenRestoreViewport(ctx, () => {});
            return;
          }
          await finishSeriesReload(ctx, [pane]);
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
