import {
  createLayoutManager,
  removeLayoutFromLibrary,
  upsertLayoutLibraryEntry,
} from "../../../ui/header/layout/manager.js";
import {
  setLayoutToolDefaults,
  setLayoutToolDefaultsChangeHandler,
} from "../../../drawings/toolbars/defaults/layoutScope.js";
import {
  setLayoutDrawingTemplates,
  setLayoutDrawingTemplatesChangeHandler,
} from "../../../drawings/toolbars/defaults/layoutTemplates.js";
import { mountHeaderToolbar } from "../../../ui/header/toolbar/index.js";
import { buildChartShareUrl } from "../../../datafeed/client.js";
import { chartDebug } from "../../../debug/chart/index.js";
import { createSecondaryPaneFactory } from "./secondaryPane.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function wireLayoutChrome(ctx) {
  if (!ctx.opts.chrome || !ctx.chromeEl || !ctx.stageEl || !(ctx.chartWrap instanceof HTMLElement)) {
    return;
  }

  ctx.layoutManager = createLayoutManager({
    stageEl: ctx.stageEl,
    primaryWrapEl: ctx.chartWrap,
    createSecondaryPane: createSecondaryPaneFactory(ctx),
    destroySecondaryPane: (pane) => pane.destroy(),
    onLayoutChange: async () => {
      chartDebug("layout", "onLayoutChange", {
        layoutId: ctx.layoutManager?.getLayoutId(),
        panes: ctx.getAllChartPanes().length,
      });
      ctx.drawingHub?.resetGlobalCrosshair?.();
      const empty = ctx.getAllChartPanes().filter((p) => !p.bars.length);
      if (empty.length) {
        chartDebug("layout", "load empty panes", { indexes: empty.map((p) => p.index) });
        await ctx.loadBarsForPanes(empty);
      }
      if (ctx.layoutManager?.getSync().dateRange) {
        requestAnimationFrame(() => {
          ctx.syncLayoutDateRangeFrom(ctx.chart);
        });
      }
    },
    onActivePaneChange: (index) => {
      ctx.switchActivePane(index);
    },
  });

  ctx.chartWrap.addEventListener("mousedown", () => ctx.layoutManager?.setActivePane(0));

  const toolbarRight = ctx.chromeEl.querySelector(".tv-toolbar__right");
  if (!toolbarRight) return;

  ctx.headerToolbarUi = mountHeaderToolbar({
    mountEl: toolbarRight,
    getChart: () => ctx.chart,
    getShareUrl: () =>
      buildChartShareUrl({
        symbol: ctx.symbol,
        resolution: ctx.resolution,
        theme: ctx.currentTheme,
        datafeedType: ctx.opts.datafeedType,
        drawings: ctx.opts.drawings,
        chrome: ctx.opts.chrome,
      }),
    layoutManager: ctx.layoutManager,
    onSaveLayout: ctx.saveLayoutToLibrary,
    onLoadLayout: (item) => {
      ctx.applyLayoutChartSettings(item.chartSettings);
      setLayoutToolDefaults(item.toolDefaults);
      ctx.layoutManager.setToolDefaultsSnapshot(item.toolDefaults ?? null);
      setLayoutDrawingTemplates(item.drawingTemplates);
      ctx.layoutManager.setDrawingTemplatesSnapshot(item.drawingTemplates ?? null);
      ctx.layoutManager.setViewportsSnapshot(item.viewports ?? null);
      ctx.drawingHub?.setDrawingsByPane?.(item.drawings);
      ctx.indicatorController?.setIndicatorsByPane?.(item.indicators ?? null);
      ctx.layoutManager.setIndicatorsSnapshot(item.indicators ?? null);
      for (const pane of ctx.getAllChartPanes()) {
        if (item.viewports?.[String(pane.index)] && pane.bars?.length) {
          ctx.applyPendingViewportForPane?.(pane, item.viewports[String(pane.index)]);
        }
      }
      ctx.refreshIndicators?.();
      ctx.refreshIndicatorLegends?.();
    },
    onLayoutChange: ctx.scheduleAutosaveLayout,
    onCreateLayout: () => {
      void (async () => {
        if (ctx.layoutManager.isDirty() && ctx.layoutManager.getAutoSave()) {
          ctx.saveLayoutToLibrary();
        }
        const unique = await ctx.uniqueLayoutName("Layout", "Create new layout", "Create");
        if (!unique) return;
        ctx.layoutManager.setLayoutName(unique);
        ctx.drawingHub?.setDrawingsByPane?.({});
        ctx.indicatorController?.clearAll?.();
        ctx.layoutManager.setDrawingsSnapshot(null);
        ctx.layoutManager.setIndicatorsSnapshot(null);
        setLayoutToolDefaults({});
        ctx.layoutManager.setToolDefaultsSnapshot(null);
        setLayoutDrawingTemplates(null);
        ctx.layoutManager.setDrawingTemplatesSnapshot(null);
        ctx.layoutManager.markDirty();
        ctx.headerToolbarUi?.updateSaveState();
      })();
    },
    onDuplicateLayout: () => {
      void (async () => {
        if (ctx.layoutManager.getAutoSave()) {
          ctx.saveLayoutToLibrary();
        }
        const unique = await ctx.uniqueLayoutName(
          `${ctx.layoutManager.getLayoutName()} copy`,
          "Make a copy",
          "Create copy",
        );
        if (!unique) return;
        const entry = { ...ctx.buildLayoutEntry(), name: unique };
        upsertLayoutLibraryEntry(entry);
        ctx.layoutManager.setLayoutName(unique);
        ctx.layoutManager.markDirty();
        ctx.headerToolbarUi?.updateSaveState();
      })();
    },
    onDeleteLayout: (name) => {
      removeLayoutFromLibrary(name);
      if (name === ctx.layoutManager.getLayoutName()) {
        ctx.resetToUnsavedWorkspace();
      }
    },
  });

  const chartSettingsUi = ctx.mountChartSettingsUi();
  chartSettingsUi.bindTrigger(document.getElementById("settings-btn"));
  setLayoutToolDefaultsChangeHandler(ctx.scheduleAutosaveLayout);
  setLayoutDrawingTemplatesChangeHandler(ctx.scheduleAutosaveLayout);
  if (ctx.drawing) {
    ctx.drawing.on("change", ctx.scheduleAutosaveLayout);
  }
  ctx._layoutRestorePending = true;
  try {
    ctx.restoreLayoutChartSettings();
    ctx.restoreLayoutViewports();
    ctx.restoreLayoutToolDefaults();
    ctx.restoreLayoutDrawingTemplates();
    ctx.restoreLayoutDrawings();
    if (ctx.layoutManager.getAutoSave()) {
      ctx.saveLayoutToLibrary();
    } else {
      ctx.headerToolbarUi?.updateSaveState();
    }
  } finally {
    ctx._layoutRestorePending = false;
    ctx.headerToolbarUi?.updateSaveState();
  }
  ctx.mountChartSettingsUi();
}
