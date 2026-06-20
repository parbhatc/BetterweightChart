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
import { createStrategyReportPanel } from "../../../strategy/reportPanel.js";
import { createStrategyReportReopenButton } from "../../../strategy/reportReopenButton.js";
import { scrollPaneToBarTime } from "../../../strategy/navigateTrade.js";
import { deepestBacktestRangeForPane, ensureBacktestHistory, isBacktestHistoryLoading } from "../../../strategy/backtestHistory.js";
import { backtestRangeLabel, backtestPeriodLabel } from "../../../strategy/backtestRange.js";
import { clearBacktestBars, getBacktestBars } from "../../../strategy/backtestBarCache.js";
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
    getOverlayContext: (pane) =>
      createSecurityContext({
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
  });

  indicatorData = createIndicatorDataLoader({ ctx, controller });
  ctx.indicatorController = controller;

  const reportSlot =
    document.getElementById("strategy-report-slot") ??
    document.querySelector(".tv-strategy-report-slot");
  /** @type {Set<number>} */
  const backtestHistoryInFlight = new Set();

  /** @param {number} paneIndex */
  async function ensureStrategyBacktestHistory(paneIndex) {
    if (backtestHistoryInFlight.has(paneIndex)) return;
    const pane = ctx.getAllChartPanes().find((p) => p.index === paneIndex);
    if (!pane?.bars?.length) return;

    const backtestRange = deepestBacktestRangeForPane(
      controller.indicatorsForPane(paneIndex),
      getIndicatorClass,
    );
    if (!backtestRange) return;

    backtestHistoryInFlight.add(paneIndex);
    syncStrategyReport();
    try {
      const loaded = await ensureBacktestHistory(ctx, pane, backtestRange, () => {
        syncStrategyReport();
        ctx.refreshIndicatorsImmediate(paneIndex);
      });
      if (loaded) {
        ctx.refreshIndicatorsImmediate(paneIndex);
      }
    } finally {
      backtestHistoryInFlight.delete(paneIndex);
      syncStrategyReport();
    }
  }

  /** @param {object} pane */
  function strategyBacktestLoadingForPane(pane) {
    const backtestRange = deepestBacktestRangeForPane(
      controller.indicatorsForPane(pane.index),
      getIndicatorClass,
    );
    if (!backtestRange) return false;
    const barSec = ctx.barSecForPaneLocal?.(pane) ?? 60;
    return isBacktestHistoryLoading(
      pane,
      backtestRange,
      barSec,
      backtestHistoryInFlight.has(pane.index),
    );
  }

  function scheduleStrategyBacktestHistory(paneIndex) {
    const pane = ctx.getAllChartPanes().find((p) => p.index === paneIndex);
    if (!pane) return;
    const backtestRange = deepestBacktestRangeForPane(
      controller.indicatorsForPane(paneIndex),
      getIndicatorClass,
    );
    if (!backtestRange) return;
    const cached = getBacktestBars(pane.symbol, pane.resolution);
    if (cached?.complete) return;
    void ensureStrategyBacktestHistory(paneIndex);
  }

  const strategyReport = createStrategyReportPanel({
    mountEl: reportSlot instanceof HTMLElement ? reportSlot : undefined,
    onDismiss: () => syncStrategyReport(),
    onGoToBarTime: (chartTime, paneIndex) => {
      const pane =
        ctx.getAllChartPanes().find((p) => p.index === paneIndex) ?? ctx.getActivePane();
      if (!pane) return;
      scrollPaneToBarTime(pane, chartTime, {
        settingsStore: ctx.settingsStore,
        symbolInfo: pane.symbolInfo ?? ctx.symbolInfo,
        resolutions: ctx.resolutions,
      });
    },
    onRangeChange: (instanceId, range) => {
      const inst = controller.getInstance(instanceId);
      if (!inst) return;
      const pane = ctx.getAllChartPanes().find((p) => p.index === inst.paneIndex);
      if (pane) clearBacktestBars(pane.symbol, pane.resolution);
      inst.backtestRange =
        typeof range === "string"
          ? { id: range }
          : { ...range, id: range.id ?? "custom" };
      syncStrategyReport();
      scheduleStrategyBacktestHistory(inst.paneIndex);
      ctx.refreshIndicatorsImmediate(inst.paneIndex);
    },
  });

  const strategyReportReopen = createStrategyReportReopenButton({
    onReopen: () => {
      strategyReport.reopen();
      syncStrategyReport();
    },
  });

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
  });

  function syncStrategyReport() {
    const pane = ctx.getActivePane() ?? ctx.getAllChartPanes()[0];
    if (!pane) {
      strategyReport.hide();
      strategyReportReopen.sync(null);
      return;
    }
    let strategyInst = null;
    for (const inst of controller.indicatorsForPane(pane.index)) {
      if (inst.hidden) continue;
      const Indicator = getIndicatorClass(inst.defId);
      if (Indicator?.kind === "strategy") {
        strategyInst = inst;
        break;
      }
    }
    if (!strategyInst) {
      strategyReport.hide();
      strategyReportReopen.sync(null);
      return;
    }

    const strategyTitle = getIndicatorClass(strategyInst.defId)?.title ?? "Strategy";
    const loading = strategyBacktestLoadingForPane(pane);

    if (strategyReport.isUserDismissed()) {
      strategyReportReopen.sync({
        title: strategyTitle,
        subtitle: loading ? "Running backtest…" : "Strategy report",
        loading,
      });
      return;
    }

    strategyReportReopen.sync(null);

    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      pane.symbolInfo ?? ctx.symbolInfo,
      ctx.resolutions,
    );
    const backtestRange = strategyInst.backtestRange ?? { id: "90d" };
    const backtestBars = strategyInst._backtestBars ?? view.utcBars;
    const currency = pane.symbolInfo?.currency_code ?? ctx.symbolInfo?.currency_code ?? "USD";

    strategyReport.render(strategyInst.backtest ?? null, strategyInst.instanceId, {
      rangeLabel: backtestRangeLabel(backtestRange, backtestBars, pane.resolution),
      periodLabel: backtestPeriodLabel(
        backtestRange,
        backtestBars,
        pane.symbolInfo?.timezone ?? ctx.symbolInfo?.timezone ?? "America/New_York",
      ),
      backtestRange,
      currency,
      mode: "Deep",
      strategyName: strategyTitle,
      loading,
      loadingMessage: loading ? "Running backtest…" : undefined,
      paneIndex: pane.index,
    });
  }

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
    syncStrategyReport();
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
      scheduleStrategyBacktestHistory(pane.index);
    }
    ctx.refreshStatusLine();
    syncSettingsDialog();
    syncStrategyReport();
    ctx.scheduleAutosaveLayout?.();
    indicatorData.scheduleLoad();
  };

  ctx.scheduleStrategyBacktestHistory = scheduleStrategyBacktestHistory;
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
    scheduleStrategyBacktestHistory(pane.index);
  }

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
