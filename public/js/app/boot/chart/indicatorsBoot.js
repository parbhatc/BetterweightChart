import { resolutionDisplayTitle } from "../../../chart/resolutionFormat.js";
import { createIndicatorController } from "../../../indicators/controller.js";
import { createIndicatorsLibraryDialog } from "../../../indicators/ui/libraryDialog.js";
import { createIndicatorSettingsDialog } from "../../../indicators/ui/settingsDialog.js";
import { mountIndicatorLegend } from "../../../indicators/ui/legend.js";
import { attachStudyScaleLabelsPrimitive } from "../../../indicators/primitives/scaleLabels.js";
import { attachIndicatorBandFillPrimitive } from "../../../indicators/primitives/bandFill.js";
import { attachStudyPaneLegendOverlay } from "../../../indicators/ui/studyPaneLegendOverlay.js";
import { attachStudyPaneScaleGuards } from "../../../chart/pane/studyScale.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import { precisionFromSettings } from "../../../chart/timezone/list.js";
import { listIndicators, getIndicatorClass } from "../../../indicators/catalog.js";
import { createIndicatorDataLoader } from "./indicatorDataLoader.js";
import { createSecurityContext } from "../../bar/requestSecurity.js";
import { priceLineBarForPane } from "../../symbol/lineStyle.js";
import { symbolPriceLabelHeight } from "../../../primitives/priceLineLabel/index.js";

const FAV_KEY = "bwc-indicator-favorites";

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

  const controller = createIndicatorController({
    getAllChartPanes: ctx.getAllChartPanes,
    getPaneBars: (pane) => {
      const view = getPaneChartView(
        pane,
        ctx.settingsStore,
        pane.symbolInfo ?? ctx.symbolInfo,
        ctx.resolutions,
      );
      return { utcBars: view.utcBars, chartBars: view.chartBars };
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
        }),
        getNewsByDay: newsCtx.getNewsByDay,
        newsPending: newsCtx.newsPending,
        isNewsEnabled: newsCtx.isNewsEnabled,
        getNewsRows: newsCtx.getNewsRows,
      };
    },
  });

  indicatorData = createIndicatorDataLoader({ ctx, controller });
  ctx.indicatorController = controller;

  const library = createIndicatorsLibraryDialog({
    onSelect: (defId) => {
      const pane = ctx.getActivePane() ?? ctx.chartPanes.get(0);
      controller.addIndicator(defId, pane?.index ?? 0);
      indicatorData.scheduleLoad(0);
    },
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
      onToggleHidden: (id) => {
        const inst = controller.getInstance(id);
        if (inst) controller.setHidden(id, !inst.hidden);
      },
      onOpenSettings: onStudyOpenSettings,
      onRemove: onStudyRemove,
    };
  }

  /** @type {Map<number, ReturnType<typeof mountIndicatorLegend>>} */
  const legends = new Map();

  function symbolLabelAnchors(pane) {
    const sc = ctx.settingsStore.get().scales ?? {};
    const useCustomLabel = Boolean(sc.countdownToBarClose);
    if (!useCustomLabel && !sc.symbolLabelValue) return [];
    const { close } = priceLineBarForPane(pane, ctx.settingsStore, pane.symbolInfo ?? ctx.symbolInfo);
    if (close == null || !Number.isFinite(close)) return [];
    return [
      {
        price: close,
        labelHeight: symbolPriceLabelHeight(useCustomLabel),
      },
    ];
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

  ctx.refreshIndicatorsImmediate = (paneIndex) => {
    controller.refreshPaneData(paneIndex);
    refreshIndicatorUi(paneIndex);
  };

  ctx.refreshOverlaysImmediate = (paneIndex) => {
    controller.refreshOverlaysImmediate(paneIndex);
    if (paneIndex != null) {
      ensureLegend(ctx.getAllChartPanes().find((p) => p.index === paneIndex))?.render();
    } else {
      refreshAllLegends();
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
  const favBtn = ctx.chartToolbarTools?.favBtn;
  indicatorsBtn?.addEventListener("click", () => {
    library.open(indicatorsBtn);
  });

  favBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openFavoritesMenu(favBtn);
    favBtn?.setAttribute("aria-expanded", "true");
  });

  function openFavoritesMenu(anchor) {
    let favIds = [];
    try {
      favIds = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    } catch {
      favIds = [];
    }
    const menu = document.createElement("div");
    menu.className = "tv-chart-tools__menu";
    menu.setAttribute("role", "menu");
    const favDefs = listIndicators().filter((Indicator) => favIds.includes(Indicator.id));
    menu.innerHTML = favDefs.length
      ? favDefs
          .map(
            (Indicator) =>
              `<button type="button" class="tv-ind-prop__menu-item" role="menuitem" data-def="${Indicator.id}">${Indicator.title}</button>`,
          )
          .join("")
      : `<div class="tv-chart-tools__menu-empty">No favorite indicators yet</div>`;
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
    menu.querySelectorAll("[data-def]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const defId = btn.getAttribute("data-def");
        if (defId) {
          const pane = ctx.getActivePane() ?? ctx.chartPanes.get(0);
          controller.addIndicator(defId, pane?.index ?? 0);
          indicatorData.scheduleLoad(0);
        }
        menu.remove();
      });
    });
    const close = () => menu.remove();
    setTimeout(() => {
      document.addEventListener(
        "click",
        (e) => {
          if (!menu.contains(e.target) && !anchor.contains(e.target)) close();
        },
        { once: true },
      );
    }, 0);
  }

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

  ctx.ensureIndicatorData = () => indicatorData.ensureNow();

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
