import { mountSymbolSearch } from "../../../ui/symbol/search.js";
import { mountTimeframePicker } from "../../../ui/timeframe/picker.js";
import { debugSymbolChange, debugTimeframeChange } from "../../../debug/chart/symbolTimeframe.js";
import { captureVisibleViewport, restoreVisibleViewport } from "../../../chart/pane/viewport.js";
import {
  captureViewportBarLayout,
  restoreViewportBarLayout,
  restoreViewportBarLayoutFromUtc,
  computeViewportBarLayoutLogical,
  computeViewportLogicalFromUtc,
} from "../../../chart/pane/viewportBarLayout.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import { seedHtfBars } from "../../bar/htfBarCache.js";
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

/**
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} layout
 * @param {import("./state.js").BootContext} ctx
 */
function resolveTimeframeSwitchLogicalRange(pane, layout, ctx) {
  if (!layout || !pane?.bars?.length) return null;
  const utcLogical = computeViewportLogicalFromUtc(pane, layout, ctx.settingsStore, ctx.resolutions);
  if (utcLogical && layout.visibleFromUtc != null && layout.visibleToUtc != null) {
    return utcLogical;
  }
  const barLogical = computeViewportBarLayoutLogical(pane, layout);
  if (barLogical) return barLogical;
  return utcLogical;
}

/**
 * Keep viewport tail anchored to the host replay cursor (not HTF right-offset whitespace).
 * @param {object} pane
 * @param {{ from: number, to: number }} logicalRange
 * @param {number} anchorSec
 */
function clampLogicalRangeToPlaybackAnchor(pane, logicalRange, anchorSec) {
  if (!logicalRange || !pane?.bars?.length || !Number.isFinite(anchorSec)) return logicalRange;

  let anchorIdx = pane.bars.length - 1;
  for (let i = pane.bars.length - 1; i >= 0; i -= 1) {
    if (pane.bars[i].time <= anchorSec) {
      anchorIdx = i;
      break;
    }
  }

  const width = logicalRange.to - logicalRange.from;
  const tail = logicalRange.to - anchorIdx;
  let to = anchorIdx + Math.max(0, tail);
  let from = to - width;
  if (from < 0) {
    to -= from;
    from = 0;
  }
  return { from, to };
}

/**
 * setData + viewport in one paint; price margins restored without re-clamping bar slots.
 * @param {import("./state.js").BootContext} ctx
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} savedLayout
 */
export function paintPaneAfterTimeframeLoad(ctx, pane, savedLayout) {
  const useUtc =
    savedLayout?.visibleFromUtc != null && savedLayout?.visibleToUtc != null;
  let logicalRange = resolveTimeframeSwitchLogicalRange(pane, savedLayout, ctx);
  if (logicalRange && ctx.opts?.replayHostControlled) {
    const anchorSec = ctx.opts?.getPlaybackAnchorSec?.(pane.resolution);
    if (anchorSec != null && Number.isFinite(anchorSec)) {
      logicalRange = clampLogicalRangeToPlaybackAnchor(pane, logicalRange, anchorSec);
      let anchorIdx = pane.bars.length - 1;
      for (let i = pane.bars.length - 1; i >= 0; i -= 1) {
        if (pane.bars[i].time <= anchorSec) {
          anchorIdx = i;
          break;
        }
      }
      pane.replayCursorEndIndex = anchorIdx;
    }
  }
  ctx.refreshPaneCandleData?.(pane, {
    logicalRange: logicalRange ?? undefined,
    avoidPreserveViewport: !logicalRange,
    deferSessionBg: true,
  });
  ctx.indicatorController?.syncOverlayTimeCtxForPane?.(pane.index);
  if (savedLayout) {
    const restoreOpts = { skipLogical: Boolean(logicalRange) };
    if (useUtc) {
      restoreViewportBarLayoutFromUtc(
        pane,
        savedLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "timeframe",
        ctx.activePriceScaleId,
        restoreOpts,
      );
    } else {
      restoreViewportBarLayout(
        pane,
        savedLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "timeframe",
        ctx.activePriceScaleId,
        restoreOpts,
      );
    }
  }
  if (pane.chart && pane.series) {
    ctx.applySettingsToChartLocal?.(pane.chart, pane.series, pane);
  }
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
 * Helps indicators (Levels/FVG) avoid waiting after timeframe switches.
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
export async function finishSeriesReload(ctx, panes) {
  for (const pane of panes) {
    ctx.indicatorController?.syncOverlayTimeCtxForPane?.(pane.index);
  }
  for (const pane of panes) {
    await ctx.ensureIndicatorChartHistory?.(pane);
  }
  ctx.ensureIndicatorData?.();
  ctx.refreshIndicatorsImmediate?.();
  for (const pane of panes) {
    pane.priceLineLabel?.requestRefresh();
    if (pane.chart && pane.series) {
      ctx.applySettingsToChartLocal?.(pane.chart, pane.series, pane);
    }
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
          try {
            ctx.opts?.onIntervalChange?.(res);
          } catch (err) {
            console.error("[BWC] onIntervalChange failed:", err);
          }
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
              await finishSeriesReload(ctx, panes);
            } else {
              for (let i = 0; i < panes.length; i += 1) {
                paintPaneAfterTimeframeLoad(ctx, panes[i], savedLayouts[i]);
              }
              await finishSeriesReload(ctx, panes);
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
            await finishSeriesReload(ctx, [pane]);
          } else {
            paintPaneAfterTimeframeLoad(ctx, pane, savedLayout);
            await finishSeriesReload(ctx, [pane]);
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
