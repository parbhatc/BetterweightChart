import {
  findLayoutByName,
  layoutNameExists,
  upsertLayoutLibraryEntry,
} from "../../../ui/header/layout/manager.js";
import { showLayoutNameDialog } from "../../../ui/header/layout/dialogs.js";
import { getLayoutToolDefaultsSnapshot, setLayoutToolDefaults } from "../../../drawings/toolbars/defaults/layoutScope.js";
import { getLayoutDrawingTemplatesSnapshot, setLayoutDrawingTemplates } from "../../../drawings/toolbars/defaults/layoutTemplates.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachLayoutPersistence(ctx) {
  function buildLayoutEntry() {
    return {
      name: ctx.layoutManager?.getLayoutName() ?? "Unnamed",
      layoutId: ctx.layoutManager?.getLayoutId() ?? "1",
      sync: ctx.layoutManager?.getSync() ?? {},
      drawings: ctx.drawingHub?.getDrawingsByPane?.(),
      chartSettings: structuredClone(ctx.settingsStore.get()),
      toolDefaults: getLayoutToolDefaultsSnapshot(),
      drawingTemplates: getLayoutDrawingTemplatesSnapshot(),
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
    ctx.layoutManager.setChartSettingsSnapshot(entry.chartSettings ?? null);
    ctx.layoutManager.setToolDefaultsSnapshot(entry.toolDefaults ?? null);
    ctx.layoutManager.setDrawingTemplatesSnapshot(entry.drawingTemplates ?? null);
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
    ctx.layoutManager.setDrawingsSnapshot(null);
    setLayoutToolDefaults({});
    ctx.layoutManager.setToolDefaultsSnapshot(null);
    setLayoutDrawingTemplates(null);
    ctx.layoutManager.setDrawingTemplatesSnapshot(null);
    ctx.layoutManager.markSaved();
    ctx.headerToolbarUi?.updateSaveState();
  }

  function scheduleAutosaveLayout() {
    if (!ctx.layoutManager || ctx._layoutRestorePending) return;
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

  Object.assign(ctx, {
    buildLayoutEntry,
    applyLayoutChartSettings,
    restoreLayoutChartSettings,
    autosaveLayout,
    saveLayoutToLibrary,
    resetToUnsavedWorkspace,
    scheduleAutosaveLayout,
    restoreLayoutToolDefaults,
    restoreLayoutDrawingTemplates,
    restoreLayoutDrawings,
    uniqueLayoutName,
  });
}
