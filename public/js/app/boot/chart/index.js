import { resolveDatafeed, readPageOptions } from "../../../datafeed/index.js";
import { chartThemeFallback } from "../themes.js";
import { mountAppTouchScrollLock } from "../../touch/scrollLock.js";
import { wirePaneContextMenus } from "../../wire/contextMenus.js";
import { mountTimezoneClock } from "../../../ui/timezone/clock.js";
import { mountBottomFullscreenExit } from "../../../ui/header/fullscreen/mode.js";
import { createChartWidgetApi } from "../widgetApi.js";
import {
  chartDebug,
  chartDebugTimeAsync,
  configureChartDebug,
  installChartDebugGlobal,
} from "../../../debug/chart/index.js";
import { wrapDatafeedDebug } from "../../../debug/chart/datafeed.js";
import { barTimeLabel } from "../../../chart/format.js";

import { createBootContext, initSymbolResolution } from "./state.js";
import { attachLayoutPersistence } from "./layoutPersistence.js";
import { attachSettingsBoot } from "./settingsBoot.js";
import { initPrimaryChart } from "./primaryChart.js";
import { attachPaneHelpers } from "./panes.js";
import { attachPaneExtrasBoot } from "./paneExtrasBoot.js";
import { attachContextMenuBoot } from "./contextMenu.js";
import { attachDrawingBoot } from "./drawing.js";
import { attachBarLoader } from "./barLoader.js";
import { wireLayoutChrome } from "./layoutChrome.js";
import { wireKeyboardShortcuts } from "./keyboard.js";
import { wireSymbolAndTimeframePickers } from "./pickers.js";
import { mountChartToolbarTools } from "../../../ui/header/chartTools.js";
import { attachIndicatorsBoot } from "./indicatorsBoot.js";
import { attachBottomPaneBoot } from "./bottomPaneBoot.js";
import { attachChartTableBoot } from "./chartTableBoot.js";
import { attachNewsBoot } from "./newsBoot.js";
import { attachReplayBoot, restoreReplayAfterLoad } from "./replayBoot.js";
import { attachQuoteManager } from "../../quotes/manager.js";
import {
  CHART_FEATURES,
  createFeatureFlags,
  setBootFeatureFlags,
} from "../../../chart/features.js";
import { mergeWithCustomResolutions, CHART_RESOLUTIONS } from "../../../chart/resolutions.js";

export { readPageOptions };

/**
 * Boot the chart widget. Safe to call from index or embed pages.
 * @param {Partial<ReturnType<typeof readPageOptions>> & {
 *   disabled_features?: string[],
 *   enabled_features?: string[],
 * }} [overrides]
 */
export async function bootChart(overrides = {}) {
  installChartDebugGlobal();
  const debugOn = configureChartDebug();

  const ctx = createBootContext(overrides);
  const featureFlags = createFeatureFlags({
    disabled_features: overrides.disabled_features ?? ctx.opts.disabled_features,
    enabled_features: overrides.enabled_features ?? ctx.opts.enabled_features,
  });
  setBootFeatureFlags(featureFlags);
  ctx.featureFlags = featureFlags;
  ctx.debugOn = debugOn;
  document.documentElement.setAttribute("data-theme", ctx.currentTheme);
  const releaseTouchScrollLock = mountAppTouchScrollLock();

  if (debugOn) chartDebug("boot", "bootChart start", { opts: ctx.opts });

  ctx.datafeed = wrapDatafeedDebug(resolveDatafeed(ctx.opts));
  ctx.cfg = await ctx.datafeed.onReady();
  ctx.themeColors =
    ctx.cfg.themes?.[ctx.currentTheme] ??
    ctx.cfg.themes?.dark ??
    chartThemeFallback(ctx.currentTheme);
  ctx.resolutions = mergeWithCustomResolutions(ctx.cfg.resolutions ?? CHART_RESOLUTIONS);
  initSymbolResolution(ctx, ctx.cfg);

  attachLayoutPersistence(ctx);
  attachSettingsBoot(ctx);
  attachPaneHelpers(ctx);
  attachContextMenuBoot(ctx);

  if (!ctx.opts.chrome && ctx.chromeEl) ctx.chromeEl.hidden = true;
  if (!ctx.opts.drawings) {
    ctx.drawToolbar?.remove();
    ctx.workspaceEl?.classList.add("tv-workspace--no-draw");
  }

  initPrimaryChart(ctx);
  attachPaneExtrasBoot(ctx);
  ctx.setupPaneExtras(ctx.chartPanes.get(0), ctx.statusEl ?? undefined);
  ctx.wireLayoutPaneSync(ctx.chart);

  ctx.settingsStore.onChange(() => {
    ctx.applyChartSettings();
    ctx.scheduleAutosaveLayout();
  });

  ctx.mountChartSettingsUi();

  attachDrawingBoot(ctx);
  attachBarLoader(ctx);
  ctx.setupDrawingHub();
  wireLayoutChrome(ctx);

  window.addEventListener("beforeunload", () => {
    if (ctx.layoutAutosaveTimer) {
      clearTimeout(ctx.layoutAutosaveTimer);
      ctx.layoutAutosaveTimer = null;
    }
    ctx.persistPaneSymbols();
    if (ctx.layoutManager?.getAutoSave()) {
      ctx.saveLayoutToLibrary();
    }
  });

  const primaryWrap =
    ctx.chartWrap instanceof HTMLElement ? ctx.chartWrap : ctx.el.closest(".tv-chart-wrap") ?? ctx.el;
  wirePaneContextMenus(ctx.buildPaneContextMenuOpts(ctx.chartPanes.get(0), primaryWrap));

  wireKeyboardShortcuts(ctx);

  ctx.tzClock = mountTimezoneClock({
    mountEl: ctx.bottomToolbar ?? ctx.chartWrap,
    getTimezone: () => ctx.settingsStore.get().symbol?.timezone ?? "America/New_York",
    getSymbolInfo: () => ctx.symbolInfo,
    onTimezoneChange: (tz) => {
      ctx.settingsStore.set("symbol", "timezone", tz);
    },
  });

  if (ctx.bottomToolbar && ctx.headerToolbarUi?.fullscreen) {
    mountBottomFullscreenExit({
      mountEl: ctx.bottomToolbar,
      fullscreen: ctx.headerToolbarUi.fullscreen,
    });
  }

  await wireSymbolAndTimeframePickers(ctx);

  const replayEnabled =
    ctx.opts.replay !== false && ctx.featureFlags.isEnabled(CHART_FEATURES.REPLAY);

  if (ctx.opts.chrome && ctx.chromeEl) {
    const toolbarLeft = ctx.chromeEl.querySelector(".tv-toolbar__left");
    if (toolbarLeft) {
      ctx.chartToolbarTools = mountChartToolbarTools(toolbarLeft, { replay: replayEnabled });
    }
  }
  if (replayEnabled) attachReplayBoot(ctx);
  attachIndicatorsBoot(ctx);
  attachBottomPaneBoot(ctx);
  attachChartTableBoot(ctx);
  attachNewsBoot(ctx);

  ctx.symbolInfo = await ctx.datafeed.resolveSymbol(ctx.symbol);
  const primaryPane = ctx.chartPanes.get(0);
  if (primaryPane) primaryPane.symbolInfo = ctx.symbolInfo;
  ctx.applySymbolFormat(ctx.symbolInfo);
  await attachQuoteManager(ctx);
  ctx.applyChartSettings();

  try {
    const last = await chartDebugTimeAsync("boot", "loadBars", () => ctx.loadBars());
    await restoreReplayAfterLoad(ctx);
    ctx.refreshIndicators?.();
    ctx.syncBottomPane?.();
    ctx.syncChartTables?.();
    ctx.setOverlayLoaderEnabled(false);
    ctx.persistPaneSymbols();
    if (debugOn) {
      chartDebug("boot", "ready", {
        symbol: ctx.symbol,
        resolution: ctx.resolution,
        barCount: ctx.bars.length,
        panes: ctx.getAllChartPanes().length,
      });
    }
    const widget = createChartWidgetApi({
      releaseTouchScrollLock,
      datafeed: ctx.datafeed,
      chart: ctx.chart,
      series: ctx.series,
      settingsStore: ctx.settingsStore,
      getActivePane: ctx.getActivePane,
      getAllChartPanes: ctx.getAllChartPanes,
      getBarsSnapshot: () => ctx.getActivePane()?.bars ?? ctx.bars,
      getSymbol: () => ctx.getActivePane()?.symbol ?? ctx.symbol,
      getResolution: () => ctx.getActivePane()?.resolution ?? ctx.resolution,
      getSymbolInfo: () => ctx.getActivePane()?.symbolInfo ?? ctx.symbolInfo,
      loadBars: ctx.loadBars,
      loadPaneBars: ctx.loadPaneBars,
      loadBarsForPanes: ctx.loadBarsForPanes,
      pushLiveBar: ctx.pushLiveBar,
      upsertLiveBar: ctx.upsertLiveBar,
      prependHistory: ctx.prependHistory,
      ensureHistoryNearEdge: ctx.ensureHistoryNearEdge,
      stashPaneResolutionCache: ctx.stashPaneResolutionCache,
      resetChartView: ctx.resetChartView,
      resetTimeScale: ctx.resetTimeScale,
      scrollToLatest: ctx.scrollToLatest,
      applyThemeMode: ctx.applyThemeMode,
      applySymbolFormat: ctx.applySymbolFormat,
      refreshWatermark: ctx.refreshWatermark,
      refreshStatusLine: ctx.refreshStatusLine,
      barTimeLabel: (bar) => barTimeLabel(bar),
      mountChartSettingsUi: ctx.mountChartSettingsUi,
      layoutManager: ctx.layoutManager,
      drawing: ctx.drawing,
      lastBar: last,
      countBack: ctx.opts.countBack,
      getReplayState: () => ctx.replay?.getState?.(),
      replayEngine: ctx.replayEngine,
      resolutions: ctx.resolutions,
      activePriceScaleId: ctx.activePriceScaleId,
      chartOverlayLoader: ctx.chartOverlayLoader,
      opts: ctx.opts,
      afterTimeframeChange: ctx.afterTimeframeChange,
      setViewportRestorePending: (v) => {
        ctx._viewportRestorePending = v;
      },
    });
    ctx.orderLines = widget.orderLines;
    if (typeof window !== "undefined") {
      window.__BWC_WIDGET__ = widget;
      if (debugOn) {
        chartDebug("boot", "widget API", {
          getBars: typeof widget.getBars === "function",
          fetchBars: typeof widget.fetchBars === "function",
          hint: "window.__BWC_WIDGET__.visibleBars() or .getBars()",
        });
      }
    }
    widget._notifyChartReady?.();
    return widget;
  } finally {
    ctx.loader.hide();
    document.getElementById("app-loader")?.classList.add("app-loader--hidden");
  }
}
