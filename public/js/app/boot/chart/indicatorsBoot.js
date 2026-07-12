import { resolutionDisplayTitle } from "../../../chart/resolutionFormat.js";
import { createIndicatorController } from "../../../indicators/controller.js";
import { createIndicatorsLibraryDialog } from "../../../indicators/ui/libraryDialog.js";
import { loadIndicatorFavorites } from "../../../indicators/ui/favorites.js";
import { createIndicatorSettingsDialog } from "../../../indicators/ui/settingsDialog.js";
import { mountIndicatorLegend } from "../../../indicators/ui/legend.js";
import { attachStudyScaleLabelsPrimitive } from "../../../indicators/primitives/scaleLabels.js";
import { attachIndicatorBandFillPrimitive } from "../../../indicators/primitives/bandFill.js";
import { attachStudyPaneLegendOverlay } from "../../../indicators/ui/studyPaneLegendOverlay.js";
import { attachStudyPaneScaleGuards } from "../../../chart/pane/studyScale.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import { replayBarIndexForUtcTime } from "../../../replay/persist.js";
import { precisionFromSettings } from "../../../chart/timezone/list.js";
import { listIndicators, getIndicatorClass } from "../../../indicators/catalog.js";
import { createIndicatorDataLoader } from "./indicatorDataLoader.js";
import { createSecurityContext } from "../../bar/requestSecurity.js";
import { symbolLabelAnchorsForPane } from "../../../chart/scale/symbolLabelAnchors.js";
import { indicatorDebug, indicatorDebugRefresh } from "../../../debug/chart/indicators.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachIndicatorsBoot(ctx) {
  function useStackedScaleLabels() {
    return ctx.settingsStore.get().scales?.noOverlappingLabels !== false;
  }

  let lastStackedScaleLabels = useStackedScaleLabels();

  /** @type {() => void} */
  let onControllerChange = () => {};

  /** @type {ReturnType<typeof createIndicatorDataLoader>} */
  let indicatorData;

  function chartIsPanning() {
    return Boolean(ctx.ui?.chartPanning);
  }

  /** @type {{ isChartPanning: () => boolean, requestOverlayRefresh: (paneIndex: number) => void, deferHeavyWork: () => void }} */
  const indicatorLoaderPerf = {
    isChartPanning: () => chartIsPanning(),
    requestOverlayRefresh: (paneIndex) => controller.refreshOverlaysSilent(paneIndex),
    deferHeavyWork: () => {},
  };

  /** Host replay: cap indicator bar series at playback anchor (pane view may include future bars). */
  function paneBarsForOverlay(pane, utcBars, chartBars) {
    if (!ctx.opts?.replayHostControlled || !utcBars?.length) {
      return { utcBars, chartBars };
    }
    const anchorSec =
      typeof ctx.opts.getPlaybackAnchorSec === "function"
        ? ctx.opts.getPlaybackAnchorSec(pane.resolution)
        : null;
    const cap =
      anchorSec != null && Number.isFinite(anchorSec)
        ? anchorSec
        : ctx.replay?.getState?.()?.currentBarTime ?? null;
    if (cap == null || !Number.isFinite(cap)) {
      return { utcBars, chartBars };
    }
    const last = utcBars.at(-1)?.time;
    if (last == null || last <= cap) {
      return { utcBars, chartBars };
    }
    const idx = replayBarIndexForUtcTime(utcBars, cap);
    if (idx == null || idx >= utcBars.length - 1) {
      return { utcBars, chartBars };
    }
    return {
      utcBars: utcBars.slice(0, idx + 1),
      chartBars: chartBars.slice(0, idx + 1),
    };
  }

  const controller = createIndicatorController({
    getAllChartPanes: ctx.getAllChartPanes,
    getPaneBars: (pane) => {
      const view = getPaneChartView(
        pane,
        ctx.settingsStore,
        pane.symbolInfo ?? ctx.symbolInfo,
        ctx.resolutions,
      );
      return paneBarsForOverlay(pane, view.utcBars, view.chartBars);
    },
    useStackedScaleLabels,
    onChange: () => onControllerChange(),
    getOverlayContext: (pane) => {
      const newsCtx = indicatorData.newsContextForPane(pane);
      return {
        ...createSecurityContext({
          pane,
          getAllChartPanes: ctx.getAllChartPanes,
          settingsStore: ctx.settingsStore,
          datafeed: ctx.datafeed,
          symbolInfo: ctx.symbolInfo,
          resolutions: ctx.resolutions,
          scheduleFetch: (symbol, resId, countBack) =>
            indicatorData.scheduleHtfBarsFetch(pane, symbol, resId, countBack),
          scheduleCompareFetch: (symbol, resolution, countBack) =>
            indicatorData.scheduleCompareBarsFetch(pane, symbol, resolution, countBack),
          getAnchorSec: () =>
            typeof ctx.opts?.getPlaybackAnchorSec === "function"
              ? ctx.opts.getPlaybackAnchorSec(pane.resolution)
              : null,
        }),
        getNewsByDay: newsCtx.getNewsByDay,
        newsPending: newsCtx.newsPending,
        isNewsEnabled: newsCtx.isNewsEnabled,
        getNewsRows: newsCtx.getNewsRows,
        isReplayLocked: () => ctx.replayEngine?.isReplayLocked?.() ?? false,
        replayHostControlled: Boolean(ctx.opts?.replayHostControlled),
        getPlaybackAnchorSec: (resolution) =>
          typeof ctx.opts?.getPlaybackAnchorSec === "function"
            ? ctx.opts.getPlaybackAnchorSec(resolution ?? pane.resolution)
            : null,
      };
    },
  });

  indicatorData = createIndicatorDataLoader({
    ctx,
    controller,
    ...indicatorLoaderPerf,
    paneBarsForNeeds: (pane) => {
      const view = getPaneChartView(
        pane,
        ctx.settingsStore,
        pane.symbolInfo ?? ctx.symbolInfo,
        ctx.resolutions,
      );
      if (!view?.utcBars?.length) return [];
      return paneBarsForOverlay(pane, view.utcBars, view.chartBars ?? view.utcBars).utcBars;
    },
  });
  ctx.indicatorController = controller;

  const library = createIndicatorsLibraryDialog({
    onSelect: (defId) => {
      const pane = ctx.getActivePane() ?? ctx.chartPanes.get(0);
      controller.addIndicator(defId, pane?.index ?? 0);
      indicatorData.scheduleLoad(0);
    },
    onFavoritesChange: () => renderIndicatorFavorites(),
  });

  const settings = createIndicatorSettingsDialog({
    controller,
    datafeed: ctx.datafeed,
    getTimeframes: () =>
      ctx.resolutions.map((r) => ({ id: r.id, label: resolutionDisplayTitle(r.id) })),
    getPaneResolution: (inst) => {
      if (!inst) return "1";
      const pane = ctx.getAllChartPanes?.().find((p) => p.index === inst.paneIndex);
      return pane?.resolution ?? "1";
    },
    onApplied: (inst) => {
      const Indicator = getIndicatorClass(inst.defId);
      if (Indicator?.useBottomPane) ctx.openBottomPane?.(inst.instanceId);
      if (Indicator?.overlayPrimitive) controller.refreshOverlaysImmediate(inst.paneIndex);
    },
  });

  function syncSettingsDialog() {
    const openId = settings.getOpenInstanceId();
    if (!openId) return;
    if (!controller.getInstance(openId)) settings.close();
  }

  /** @param {string} id */
  function onStudySelect(id) {
    const prev = controller.getSelectedId();
    if (prev === id) {
      controller.setSelected(null);
      settings.closeIfInstance(id);
      return;
    }
    if (prev) settings.closeIfInstance(prev);
    controller.setSelected(id);
  }

  /** @param {string} id */
  function onStudyOpenSettings(id) {
    controller.setSelected(id);
    settings.open(id);
  }

  /** @param {string} id */
  function onStudyRemove(id) {
    settings.closeIfInstance(id);
    controller.removeIndicator(id);
  }

  function studyLegendActions() {
    return {
      onSelect: onStudySelect,
      onDeselect: () => {
        const prev = controller.getSelectedId();
        if (!prev) return;
        controller.setSelected(null);
        settings.closeIfInstance(prev);
      },
      onToggleHidden: (id) => {
        const inst = controller.getInstance(id);
        if (inst) controller.setHidden(id, !inst.hidden);
      },
      onOpenSettings: onStudyOpenSettings,
      onRemove: onStudyRemove,
    };
  }

  function getLegendCollapsed() {
    return Boolean(ctx.settingsStore.get().statusLine?.legendCollapsed);
  }

  function setLegendCollapsed(collapsed) {
    ctx.settingsStore.set("statusLine", "legendCollapsed", collapsed);
    ctx.scheduleAutosaveLayout?.();
  }

  function legendCollapseOpts() {
    return {
      getLegendCollapsed,
      setLegendCollapsed,
      onLegendCollapsedChange: () => refreshIndicatorUi(),
    };
  }

  /** @type {Map<number, ReturnType<typeof mountIndicatorLegend>>} */
  const legends = new Map();

  function symbolLabelAnchors(pane) {
    return symbolLabelAnchorsForPane(pane, ctx.settingsStore, pane.symbolInfo ?? ctx.symbolInfo);
  }

  function ensureStudyScaleLabels(pane) {
    if (!pane?.series) return null;
    if (!pane.studyScaleLabels) {
      pane.studyScaleLabels = attachStudyScaleLabelsPrimitive({
        series: pane.series,
        getConfig: () => ({
          enabled: useStackedScaleLabels(),
          scaleId: ctx.activePriceScaleId(),
          getLabels: () => controller.scaleLabelsForPane(pane),
          getReservedAnchors: () => symbolLabelAnchors(pane),
        }),
      });
    }
    return pane.studyScaleLabels;
  }

  function refreshAllScaleLabels() {
    for (const pane of ctx.getAllChartPanes()) {
      ensureStudyScaleLabels(pane)?.requestRefresh();
    }
  }

  function ensureBandFills(pane) {
    if (!pane?.series) return null;
    if (!pane.indicatorBandFills) {
      pane.indicatorBandFills = attachIndicatorBandFillPrimitive({
        series: pane.series,
        getConfig: () => ({
          getFills: () => controller.bandFillsForPane(pane),
        }),
      });
    }
    return pane.indicatorBandFills;
  }

  function refreshAllBandFills() {
    for (const pane of ctx.getAllChartPanes()) {
      ensureBandFills(pane)?.requestRefresh();
    }
  }

  function refreshBandFillsForPane(paneIndex) {
    if (paneIndex == null) {
      refreshAllBandFills();
      return;
    }
    const pane = ctx.getAllChartPanes().find((p) => p.index === paneIndex);
    ensureBandFills(pane)?.requestRefresh();
  }

  function refreshScaleLabelsForPane(paneIndex) {
    if (paneIndex == null) {
      refreshAllScaleLabels();
      return;
    }
    const pane = ctx.getAllChartPanes().find((p) => p.index === paneIndex);
    ensureStudyScaleLabels(pane)?.requestRefresh();
  }

  function ensureLegend(pane) {
    if (!pane.statusEl) return null;
    let legend = legends.get(pane.index);
    if (!legend) {
      legend = mountIndicatorLegend(pane.statusEl, {
        getStudies: () => {
          const precision = precisionFromSettings(ctx.settingsStore.get(), pane.symbolInfo ?? ctx.symbolInfo);
          const visible = pane.bars ?? [];
          const rawBar = pane.hoverBar ?? visible.at(-1) ?? null;
          const bar =
            rawBar?.time != null
              ? (pane.timeAdapter?.index?.utcBarByUtcTime?.(rawBar.time) ?? rawBar)
              : rawBar;
          return controller.legendStateForPane(pane, bar, precision);
        },
        ...studyLegendActions(),
        ...legendCollapseOpts(),
      });
      legends.set(pane.index, legend);
    }
    return legend;
  }

  function refreshAllLegends() {
    for (const pane of ctx.getAllChartPanes()) {
      ensureLegend(pane)?.render();
    }
  }

  ctx.refreshIndicatorLegends = refreshAllLegends;
  ctx.refreshIndicators = (paneIndex) => {
    controller.refreshPane(paneIndex);
    refreshIndicatorUi(paneIndex);
  };

  const PAN_REFRESH_IDLE_MS = 120;
  /** @type {Map<number, "full" | "overlay">} */
  const deferredRefreshByPane = new Map();
  let deferredRefreshAll = false;
  let deferredEnsureData = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let deferredFlushTimer = null;

  /** @param {number | undefined} paneIndex @param {"full" | "overlay"} kind */
  function markDeferredRefresh(paneIndex, kind) {
    if (paneIndex == null) {
      deferredRefreshAll = true;
      return;
    }
    const prev = deferredRefreshByPane.get(paneIndex);
    deferredRefreshByPane.set(paneIndex, prev === "full" || kind === "full" ? "full" : "overlay");
  }

  function runIndicatorsImmediate(paneIndex, source = "immediate") {
    indicatorDebugRefresh("full", paneIndex, {
      source,
      replay: ctx.replay?.getState?.()?.active ?? false,
    });
    controller.refreshPaneData(paneIndex);
    refreshIndicatorUi(paneIndex);
  }

  function runOverlaysImmediate(paneIndex, source = "immediate") {
    indicatorDebugRefresh("overlay", paneIndex, {
      source,
      replay: ctx.replay?.getState?.()?.active ?? false,
    });
    controller.refreshOverlaysImmediate(paneIndex);
    if (paneIndex != null) {
      ensureLegend(ctx.getAllChartPanes().find((p) => p.index === paneIndex))?.render();
    } else {
      refreshAllLegends();
    }
  }

  function cancelDeferredIndicatorFlush() {
    if (deferredFlushTimer == null) return;
    clearTimeout(deferredFlushTimer);
    deferredFlushTimer = null;
  }

  function scheduleDeferredIndicatorFlush() {
    cancelDeferredIndicatorFlush();
    deferredFlushTimer = setTimeout(() => {
      deferredFlushTimer = null;
      flushDeferredIndicatorRefresh();
    }, PAN_REFRESH_IDLE_MS);
  }

  function flushDeferredIndicatorRefresh() {
    if (chartIsPanning()) {
      scheduleDeferredIndicatorFlush();
      return;
    }
    const refreshAll = deferredRefreshAll;
    const pending = new Map(deferredRefreshByPane);
    const needData = deferredEnsureData;
    deferredRefreshAll = false;
    deferredRefreshByPane.clear();
    deferredEnsureData = false;
    if (!refreshAll && !pending.size && !needData) return;

    indicatorDebug("deferred.flush", {
      refreshAll,
      panes: [...pending.entries()].map(([idx, kind]) => ({ pane: idx, kind })),
      needData,
      replay: ctx.replay?.getState?.()?.active ?? false,
    });

    if (needData) indicatorData.ensureNow();

    if (refreshAll) {
      runIndicatorsImmediate(undefined);
      return;
    }

    for (const [paneIndex, kind] of pending) {
      if (kind === "full") runIndicatorsImmediate(paneIndex);
      else runOverlaysImmediate(paneIndex);
    }
  }

  /** @param {number | undefined} paneIndex @param {"full" | "overlay"} kind @param {() => void} run @param {string} [source] */
  function refreshNowOrDeferAfterPan(paneIndex, kind, run, source = "unknown") {
    if (!chartIsPanning()) {
      run();
      return;
    }
    markDeferredRefresh(paneIndex, kind);
    scheduleDeferredIndicatorFlush();
    indicatorDebug("deferred.queue", {
      pane: paneIndex ?? "all",
      kind,
      source,
      replay: ctx.replay?.getState?.()?.active ?? false,
    });
  }

  ctx.refreshIndicatorsImmediate = (paneIndex) => {
    refreshNowOrDeferAfterPan(
      paneIndex,
      "full",
      () => runIndicatorsImmediate(paneIndex, "ctx.refreshIndicatorsImmediate"),
      "refreshIndicatorsImmediate",
    );
  };

  ctx.refreshOverlaysImmediate = (paneIndex) => {
    refreshNowOrDeferAfterPan(
      paneIndex,
      "overlay",
      () => runOverlaysImmediate(paneIndex, "ctx.refreshOverlaysImmediate"),
      "refreshOverlaysImmediate",
    );
  };

  ctx.flushDeferredIndicatorRefresh = flushDeferredIndicatorRefresh;

  indicatorLoaderPerf.requestOverlayRefresh = (paneIndex) => {
    refreshNowOrDeferAfterPan(paneIndex, "overlay", () => {
      controller.refreshOverlaysSilent(paneIndex);
    });
  };
  indicatorLoaderPerf.deferHeavyWork = () => {
    deferredEnsureData = true;
    scheduleDeferredIndicatorFlush();
  };

  const prevOnChartPanStart = ctx.viewportDeps.onChartPanStart;
  ctx.viewportDeps.onChartPanStart = () => {
    prevOnChartPanStart?.();
    cancelDeferredIndicatorFlush();
  };

  const prevOnChartPanEnd = ctx.viewportDeps.onChartPanEnd;
  ctx.viewportDeps.onChartPanEnd = () => {
    prevOnChartPanEnd?.();
    if (deferredRefreshAll || deferredRefreshByPane.size || deferredEnsureData) {
      scheduleDeferredIndicatorFlush();
    }
  };

  function refreshIndicatorUi(paneIndex) {
    refreshAllLegends();
    refreshScaleLabelsForPane(paneIndex);
    refreshBandFillsForPane(paneIndex);
    if (paneIndex != null) {
      const pane = ctx.getAllChartPanes().find((p) => p.index === paneIndex);
      controller.refreshStudyPaneLegends(pane);
    } else {
      for (const pane of ctx.getAllChartPanes()) controller.refreshStudyPaneLegends(pane);
    }
  }

  function ensureStudyLegendOverlay(pane) {
    if (!pane?.el?.parentElement || pane._studyLegendOverlay) return pane?._studyLegendOverlay;
    const stageEl = pane.el.parentElement;
    if (!(stageEl instanceof HTMLElement)) return null;
    if (getComputedStyle(stageEl).position === "static") {
      stageEl.style.position = "relative";
    }
    const overlay = attachStudyPaneLegendOverlay({
      stageEl,
      chart: pane.chart,
      onLayout: () => controller.resyncStudyPaneHeights(pane),
      getStudiesForLwcPane: (lwcPaneIndex) => {
        const precision = precisionFromSettings(ctx.settingsStore.get(), pane.symbolInfo ?? ctx.symbolInfo);
        const visible = pane.bars ?? [];
        const rawBar = pane.hoverBar ?? visible.at(-1) ?? null;
        const bar =
          rawBar?.time != null
            ? (pane.timeAdapter?.index?.utcBarByUtcTime?.(rawBar.time) ?? rawBar)
            : rawBar;
        return controller.studyLegendStateForLwcPane(pane, lwcPaneIndex, bar, precision);
      },
      actions: studyLegendActions(),
      ...legendCollapseOpts(),
    });
    controller.attachStudyLegendOverlay(pane, overlay);
    if (!pane._studyScaleGuards) {
      pane._studyScaleGuards = true;
      attachStudyPaneScaleGuards(
        pane.el,
        pane.chart,
        (lwcIdx) => pane.studyScaleLocks?.get(lwcIdx),
        () => controller.resyncStudyPaneScales(pane),
      );
    }
    return overlay;
  }

  const indicatorsBtn = ctx.chartToolbarTools?.indicatorsBtn;
  const favoritesEl = ctx.chartToolbarTools?.favoritesEl;

  /** @param {string} defId */
  function addIndicatorFromLibrary(defId) {
    const pane = ctx.getActivePane() ?? ctx.chartPanes.get(0);
    controller.addIndicator(defId, pane?.index ?? 0);
    indicatorData.scheduleLoad(0);
  }

  function renderIndicatorFavorites() {
    if (!favoritesEl) return;
    const favIds = loadIndicatorFavorites();
    const favDefs = listIndicators().filter((Indicator) => favIds.includes(Indicator.id));
    favoritesEl.innerHTML = favDefs
      .map(
        (Indicator) =>
          `<button type="button" class="tv-chart-tools__fav-pill" data-def="${Indicator.id}" title="${Indicator.title}" aria-label="Add ${Indicator.title}">${Indicator.shortTitle || Indicator.title}</button>`,
      )
      .join("");
    favoritesEl.hidden = favDefs.length === 0;
  }

  favoritesEl?.addEventListener("click", (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest("[data-def]") : null;
    const defId = btn instanceof HTMLElement ? btn.dataset.def : null;
    if (defId) addIndicatorFromLibrary(defId);
  });

  indicatorsBtn?.addEventListener("click", () => {
    library.open(indicatorsBtn);
  });

  renderIndicatorFavorites();

  const origRefreshPaneStatusLine = ctx.refreshPaneStatusLine;
  ctx.refreshPaneStatusLine = (pane) => {
    origRefreshPaneStatusLine?.(pane);
    ensureLegend(pane)?.render();
    controller.refreshStudyPaneLegends(pane);
  };

  const origSetupPaneExtras = ctx.setupPaneExtras;
  ctx.setupPaneExtras = (pane, statusEl) => {
    origSetupPaneExtras?.(pane, statusEl);
    ensureLegend(pane);
    ensureStudyScaleLabels(pane);
    ensureBandFills(pane);
    ensureStudyLegendOverlay(pane);
    wirePaneLegendCrosshair(pane);
  };

  /** @param {object} pane */
  function wirePaneLegendCrosshair(pane) {
    if (pane._legendCrosshairSub) return;
    pane._legendCrosshairSub = true;
    pane.chart.subscribeCrosshairMove(() => {
      ensureLegend(pane)?.render();
      controller.refreshStudyPaneLegends(pane);
    });
  }

  onControllerChange = () => {
    refreshAllLegends();
    refreshAllScaleLabels();
    refreshAllBandFills();
    for (const pane of ctx.getAllChartPanes()) {
      controller.refreshStudyPaneLegends(pane);
    }
    ctx.refreshStatusLine();
    syncSettingsDialog();
    ctx.scheduleAutosaveLayout?.();
    indicatorData.scheduleLoad();
    ctx.syncBottomPane?.();
    ctx.syncChartTables?.();
  };

  ctx.ensureIndicatorData = () => {
    if (chartIsPanning()) {
      deferredEnsureData = true;
      scheduleDeferredIndicatorFlush();
      return;
    }
    indicatorData.ensureNow();
  };

  ctx.ensureIndicatorDataThenOverlay = (pane) => {
    if (chartIsPanning()) {
      deferredEnsureData = true;
      markDeferredRefresh(pane?.index, "overlay");
      scheduleDeferredIndicatorFlush();
      return Promise.resolve();
    }
    return indicatorData.ensurePaneDataThenOverlay(pane);
  };

  /** Host replay Next: extend HTF tail only when anchor outran cache (no full refetch). */
  ctx.extendIndicatorHtfForReplay = async (pane) => {
    if (chartIsPanning() || !pane?.symbol) return false;
    return indicatorData.extendHtfTailForReplay(pane);
  };

  const origApplyChartSettings = ctx.applyChartSettings;
  ctx.applyChartSettings = () => {
    const prevRevision = ctx._chartDataRevision ?? 0;
    const prevStacked = lastStackedScaleLabels;
    origApplyChartSettings?.();
    lastStackedScaleLabels = useStackedScaleLabels();
    if ((ctx._chartDataRevision ?? 0) !== prevRevision || lastStackedScaleLabels !== prevStacked) {
      controller.refreshAll();
    }
    refreshAllLegends();
    refreshAllScaleLabels();
    refreshAllBandFills();
  };

  ctx.restoreLayoutIndicators?.();

  for (const pane of ctx.getAllChartPanes()) {
    ensureLegend(pane);
    ensureStudyScaleLabels(pane);
    ensureBandFills(pane);
    ensureStudyLegendOverlay(pane);
    wirePaneLegendCrosshair(pane);
  }
  refreshAllLegends();
  for (const pane of ctx.getAllChartPanes()) controller.refreshStudyPaneLegends(pane);
  refreshAllScaleLabels();
  refreshAllBandFills();
  indicatorData.scheduleLoad(4000);
}
