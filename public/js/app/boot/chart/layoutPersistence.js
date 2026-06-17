import {
  findLayoutByName,
  layoutNameExists,
  upsertLayoutLibraryEntry,
} from "../../../ui/header/layout/manager.js";
import { showLayoutNameDialog } from "../../../ui/header/layout/dialogs.js";
import { getLayoutToolDefaultsSnapshot, setLayoutToolDefaults } from "../../../drawings/toolbars/defaults/layoutScope.js";
import { getLayoutDrawingTemplatesSnapshot, setLayoutDrawingTemplates } from "../../../drawings/toolbars/defaults/layoutTemplates.js";
import { captureAllPaneViewports } from "../../../chart/price/viewportCapture.js";
import {
  applyPaneViewport,
  ensurePanePriceScaleForPan,
} from "../../../chart/price/panScale.js";
import { installViewportDebugGlobal, viewportDebug } from "../../../chart/price/viewportDebug.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachLayoutPersistence(ctx) {
  /** @type {Record<string, object> | null} */
  let pendingViewports = null;

  ctx._pendingViewportsDebug = () =>
    pendingViewports ? structuredClone(pendingViewports) : null;

  installViewportDebugGlobal(ctx);

  function buildLayoutViewports() {
    const snap = ctx.layoutManager?.getViewportsSnapshot?.() ?? {};
    const live = captureAllPaneViewports(ctx.getAllChartPanes(), () => ctx.activePriceScaleId());
    /** @type {Record<string, object>} */
    const merged = { ...snap };
    for (const pane of ctx.getAllChartPanes()) {
      if (!pane.bars?.length) continue;
      const key = String(pane.index);
      if (live[key]) merged[key] = live[key];
    }
    return Object.keys(merged).length ? merged : null;
  }

  function buildLayoutEntry() {
    return {
      name: ctx.layoutManager?.getLayoutName() ?? "Unnamed",
      layoutId: ctx.layoutManager?.getLayoutId() ?? "1",
      sync: ctx.layoutManager?.getSync() ?? {},
      drawings: ctx.drawingHub?.getDrawingsByPane?.(),
      indicators:
        ctx.indicatorController?.getIndicatorsByPane?.() ??
        ctx.layoutManager?.getIndicatorsSnapshot?.() ??
        null,
      chartSettings: structuredClone(ctx.settingsStore.get()),
      toolDefaults: getLayoutToolDefaultsSnapshot(),
      drawingTemplates: getLayoutDrawingTemplatesSnapshot(),
      viewports: buildLayoutViewports(),
    };
  }

  function applyLayoutChartSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    ctx.settingsStore.replace(settings, { skipHistory: true });
  }

  function restoreLayoutChartSettings() {
    let settings = ctx.layoutManager?.getChartSettingsSnapshot?.() ?? null;
    if (!settings && ctx.layoutManager) {
      settings = findLayoutByName(ctx.layoutManager.getLayoutName())?.chartSettings ?? null;
    }
    applyLayoutChartSettings(settings);
  }

  /**
   * @param {{ toLibrary?: boolean }} [opts]
   */
  function autosaveLayout(opts = {}) {
    if (!ctx.layoutManager) return;
    const toLibrary = opts.toLibrary !== false;
    if (ctx.layoutAutosaveTimer) {
      clearTimeout(ctx.layoutAutosaveTimer);
      ctx.layoutAutosaveTimer = null;
    }
    const entry = buildLayoutEntry();
    ctx.layoutManager.setDrawingsSnapshot(entry.drawings ?? null);
    ctx.layoutManager.setIndicatorsSnapshot(entry.indicators ?? null);
    ctx.layoutManager.setChartSettingsSnapshot(entry.chartSettings ?? null);
    ctx.layoutManager.setToolDefaultsSnapshot(entry.toolDefaults ?? null);
    ctx.layoutManager.setDrawingTemplatesSnapshot(entry.drawingTemplates ?? null);
    ctx.layoutManager.setViewportsSnapshot(entry.viewports ?? null);
    if (toLibrary) {
      upsertLayoutLibraryEntry(entry);
    }
    ctx.layoutManager.markSaved();
    if (!ctx._layoutRestorePending) {
      ctx.headerToolbarUi?.updateSaveState();
    }
  }

  function saveLayoutToLibrary() {
    autosaveLayout({ toLibrary: true });
  }

  function resetToUnsavedWorkspace() {
    if (!ctx.layoutManager) return;
    const defaults = {
      symbol: false,
      interval: false,
      crosshair: true,
      time: false,
      dateRange: true,
      drawings: false,
    };
    ctx.layoutManager.setLayoutName("Unnamed", { markDirty: false });
    ctx.layoutManager.setLayout("s");
    ctx.layoutManager.setSync(defaults);
    ctx.drawingHub?.setDrawingsByPane?.({});
    ctx.indicatorController?.clearAll?.();
    ctx.layoutManager.setDrawingsSnapshot(null);
    ctx.layoutManager.setIndicatorsSnapshot(null);
    setLayoutToolDefaults({});
    ctx.layoutManager.setToolDefaultsSnapshot(null);
    setLayoutDrawingTemplates(null);
    ctx.layoutManager.setDrawingTemplatesSnapshot(null);
    ctx.layoutManager.setViewportsSnapshot(null);
    pendingViewports = null;
    if (viewportSnapshotTimer) {
      clearTimeout(viewportSnapshotTimer);
      viewportSnapshotTimer = null;
    }
    ctx.layoutManager.markSaved();
    ctx.headerToolbarUi?.updateSaveState();
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let viewportSnapshotTimer = null;

  function flushViewportSnapshot() {
    if (viewportSnapshotTimer) {
      clearTimeout(viewportSnapshotTimer);
      viewportSnapshotTimer = null;
    }
    if (!ctx.layoutManager || ctx._layoutRestorePending) return;
    const viewports = buildLayoutViewports();
    if (viewports) ctx.layoutManager.setViewportsSnapshot(viewports);
  }

  function scheduleAutosaveLayout() {
    if (!ctx.layoutManager || ctx._layoutRestorePending) return;
    if (!viewportSnapshotTimer) {
      viewportSnapshotTimer = setTimeout(flushViewportSnapshot, 200);
    }
    const autoSave = ctx.layoutManager.getAutoSave();
    ctx.layoutManager.markDirty();
    if (!autoSave) {
      ctx.headerToolbarUi?.updateSaveState();
    }
    if (!autoSave) return;
    if (ctx.layoutAutosaveTimer) clearTimeout(ctx.layoutAutosaveTimer);
    ctx.layoutAutosaveTimer = setTimeout(() => {
      ctx.layoutAutosaveTimer = null;
      saveLayoutToLibrary();
    }, 350);
  }

  function restoreLayoutToolDefaults() {
    let toolDefaults = ctx.layoutManager?.getToolDefaultsSnapshot?.() ?? null;
    if (!toolDefaults && ctx.layoutManager) {
      toolDefaults = findLayoutByName(ctx.layoutManager.getLayoutName())?.toolDefaults ?? null;
    }
    setLayoutToolDefaults(toolDefaults);
  }

  function restoreLayoutDrawings() {
    if (!ctx.drawingHub) return;
    let drawings = ctx.layoutManager?.getDrawingsSnapshot?.() ?? null;
    if (!drawings && ctx.layoutManager) {
      drawings = findLayoutByName(ctx.layoutManager.getLayoutName())?.drawings ?? null;
    }
    if (drawings) ctx.drawingHub.setDrawingsByPane(drawings);
  }

  function restoreLayoutIndicators() {
    if (!ctx.indicatorController) return;
    let indicators = ctx.layoutManager?.getIndicatorsSnapshot?.() ?? null;
    if (!indicators && ctx.layoutManager) {
      indicators = findLayoutByName(ctx.layoutManager.getLayoutName())?.indicators ?? null;
    }
    ctx.indicatorController.setIndicatorsByPane(indicators);
  }

  function restoreLayoutDrawingTemplates() {
    let drawingTemplates = ctx.layoutManager?.getDrawingTemplatesSnapshot?.() ?? null;
    if (!drawingTemplates && ctx.layoutManager) {
      drawingTemplates = findLayoutByName(ctx.layoutManager.getLayoutName())?.drawingTemplates ?? null;
    }
    setLayoutDrawingTemplates(drawingTemplates);
  }

  async function uniqueLayoutName(initial, title, confirmLabel) {
    const name = await showLayoutNameDialog({ title, value: initial, confirmLabel });
    if (!name) return null;
    let unique = name;
    let n = 2;
    while (layoutNameExists(unique)) {
      unique = `${name} ${n}`;
      n += 1;
    }
    return unique;
  }

  function restoreLayoutViewports() {
    let viewports = ctx.layoutManager?.getViewportsSnapshot?.() ?? null;
    if (!viewports && ctx.layoutManager) {
      viewports = findLayoutByName(ctx.layoutManager.getLayoutName())?.viewports ?? null;
    }
    pendingViewports =
      viewports && typeof viewports === "object" ? structuredClone(viewports) : null;
    viewportDebug("restoreLayoutViewports", {
      layoutName: ctx.layoutManager?.getLayoutName?.(),
      pending: pendingViewports,
    });
  }

  /**
   * @param {object} pane
   * @param {object} [viewportOverride]
   */
  function applyPendingViewportForPane(pane, viewportOverride) {
    const key = String(pane.index);
    const viewport = viewportOverride ?? pendingViewports?.[key];
    if (!viewport) {
      viewportDebug("applyPendingViewportForPane none", { pane: pane.index, pendingKeys: pendingViewports ? Object.keys(pendingViewports) : [] });
      return false;
    }
    viewportDebug("applyPendingViewportForPane", { pane: pane.index, viewport, override: Boolean(viewportOverride) });
    const sc = ctx.settingsStore.get().scales ?? {};
    applyPaneViewport(pane, viewport, ctx.activePriceScaleId(), sc);
    if (pendingViewports) delete pendingViewports[key];
    if (!pane._priceScalePanReady && pane.bars?.length) {
      ensurePanePriceScaleForPan(pane, sc, ctx.activePriceScaleId);
    }
    return true;
  }

  function finishPaneViewportAfterLoad(pane) {
    viewportDebug("finishPaneViewportAfterLoad", { pane: pane.index, bars: pane.bars?.length ?? 0 });
    if (applyPendingViewportForPane(pane)) return;
    if (!pane.bars?.length) return;
    viewportDebug("finishPaneViewportAfterLoad scrollToLatest", { pane: pane.index });
    ctx.scrollToLatest?.(pane.bars.length);
    ensurePanePriceScaleForPan(pane, ctx.settingsStore.get().scales ?? {}, ctx.activePriceScaleId);
  }

  Object.assign(ctx, {
    buildLayoutEntry,
    applyLayoutChartSettings,
    restoreLayoutChartSettings,
    autosaveLayout,
    saveLayoutToLibrary,
    resetToUnsavedWorkspace,
    scheduleAutosaveLayout,
    flushViewportSnapshot,
    restoreLayoutToolDefaults,
    restoreLayoutDrawingTemplates,
    restoreLayoutDrawings,
    restoreLayoutIndicators,
    restoreLayoutViewports,
    applyPendingViewportForPane,
    finishPaneViewportAfterLoad,
    uniqueLayoutName,
  });
}
