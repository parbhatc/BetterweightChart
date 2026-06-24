import { clampLayoutIdForViewport, DEFAULT_LAYOUT_ID, getLayoutDef, onMobileLayoutViewportChange } from "./definitions.js";
import { chartDebug } from "../../../debug/chart/index.js";

const STORAGE_KEY = "tv-chart-layout-state";

/** @typedef {{ symbol: boolean, interval: boolean, crosshair: boolean, time: boolean, dateRange: boolean, drawings: boolean }} SyncSettings */

/** @typedef {{ name: string, layoutId: string, sync: SyncSettings, drawings?: Record<string, object[]>, indicators?: Record<string, object[]>, chartSettings?: object, toolDefaults?: Record<string, Record<string, unknown>>, drawingTemplates?: import("../../../drawings/toolbars/defaults/layoutTemplates.js").LayoutDrawingTemplates, viewports?: Record<string, { scaleMargins?: { top: number, bottom: number }, logicalRange?: { from: number, to: number }, barSpacing?: number }>, createdAt?: number, updatedAt?: number, lastUsedAt?: number }} SavedLayout */

/** @typedef {{ chart: import("lightweight-charts").IChartApi, series: import("lightweight-charts").ISeriesApi, wrapEl: HTMLElement, chartEl: HTMLElement, destroy: () => void, symbol: string, resolution: string, symbolInfo: object | null, bars: object[] }} SecondaryPane */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.stageEl
 * @param {HTMLElement} opts.primaryWrapEl
 * @param {(index: number) => SecondaryPane} opts.createSecondaryPane
 * @param {(pane: SecondaryPane) => void} opts.destroySecondaryPane
 * @param {(layoutId: string) => void} [opts.onLayoutChange]
 * @param {(index: number) => void} [opts.onActivePaneChange]
 */
export function createLayoutManager(opts) {
  const { stageEl, primaryWrapEl, createSecondaryPane, destroySecondaryPane, onLayoutChange, onActivePaneChange } = opts;

  const gridEl = document.createElement("div");
  gridEl.className = "tv-layout-grid";
  stageEl.classList.add("tv-stage--with-bottom-bar");
  stageEl.insertBefore(gridEl, primaryWrapEl);
  gridEl.appendChild(primaryWrapEl);

  const replayBar = primaryWrapEl.querySelector(".tv-chart-replay-bar");
  const bottomPaneSlot = primaryWrapEl.querySelector(".tv-bottom-pane-slot");
  const bottomBar = primaryWrapEl.querySelector(".tv-chart-bottom-bar");
  if (replayBar) {
    stageEl.appendChild(replayBar);
  }
  if (bottomPaneSlot) {
    stageEl.appendChild(bottomPaneSlot);
  }
  if (bottomBar) {
    stageEl.appendChild(bottomBar);
  }

  /** @type {SecondaryPane[]} */
  let secondaryPanes = [];
  let layoutId = DEFAULT_LAYOUT_ID;
  let activePaneIndex = 0;
  /** @type {SyncSettings} */
  let sync = {
    symbol: false,
    interval: false,
    crosshair: true,
    time: false,
    dateRange: true,
    drawings: false,
  };
  let layoutName = "Unnamed";
  let dirty = false;
  let autoSave = false;
  /** @type {Record<string, object[]> | null} */
  let drawingsSnapshot = null;
  /** @type {Record<string, object[]> | null} */
  let indicatorsSnapshot = null;
  /** @type {object | null} */
  let chartSettingsSnapshot = null;
  /** @type {Record<string, Record<string, unknown>> | null} */
  let toolDefaultsSnapshot = null;
  /** @type {import("../../../drawings/toolbars/defaults/layoutTemplates.js").LayoutDrawingTemplates | null} */
  let drawingTemplatesSnapshot = null;
  /** @type {Record<string, { scaleMargins?: { top: number, bottom: number }, logicalRange?: { from: number, to: number }, barSpacing?: number }> | null} */
  let viewportsSnapshot = null;

  function applyPlacements() {
    const def = getLayoutDef(layoutId);
    const multi = def.count > 1;
    gridEl.classList.toggle("tv-layout-grid--multi", multi);
    const wraps = [primaryWrapEl, ...secondaryPanes.map((p) => p.wrapEl)];
    gridEl.style.gridTemplateColumns = def.cols;
    gridEl.style.gridTemplateRows = def.rows;
    wraps.forEach((wrap, i) => {
      const placement = def.placements[i];
      if (!placement) return;
      wrap.style.gridColumn = placement.gridColumn;
      wrap.style.gridRow = placement.gridRow;
      wrap.classList.toggle("tv-chart-wrap--primary", i === 0);
      wrap.classList.toggle("tv-chart-wrap--active", multi && i === activePaneIndex);
    });
  }

  function setLayout(id, { silent = false } = {}) {
    id = clampLayoutIdForViewport(id);
    const def = getLayoutDef(id);
    const fromPaneCount = secondaryPanes.length + 1;
    layoutId = def.id;
    if (!silent) dirty = true;

    while (secondaryPanes.length < def.count - 1) {
      const pane = createSecondaryPane(secondaryPanes.length + 1);
      secondaryPanes.push(pane);
      gridEl.appendChild(pane.wrapEl);
    }
    while (secondaryPanes.length > def.count - 1) {
      const pane = secondaryPanes.pop();
      if (pane) destroySecondaryPane(pane);
    }

    applyPlacements();
    chartDebug("layout", "change", {
      id: layoutId,
      fromPaneCount,
      toPaneCount: def.count,
      cols: def.cols,
      rows: def.rows,
      silent,
    });
    if (!silent) onLayoutChange?.(layoutId);
    persist();
  }

  function setActivePane(index) {
    if (activePaneIndex === index) return;
    activePaneIndex = index;
    applyPlacements();
    onActivePaneChange?.(index);
  }

  function getSync() {
    return { ...sync };
  }

  /** @param {Partial<SyncSettings>} next */
  function setSync(next) {
    sync = { ...sync, ...next };
    dirty = true;
    persist();
  }

  function getLayoutName() {
    return layoutName;
  }

  /** @param {string} name @param {{ markDirty?: boolean }} [opts] */
  function setLayoutName(name, opts = {}) {
    layoutName = name.trim() || "Unnamed";
    if (opts.markDirty !== false) {
      dirty = true;
    }
    persist();
  }

  function isDirty() {
    return dirty;
  }

  function markDirty() {
    dirty = true;
    persist();
  }

  /** @param {Record<string, object[]> | null | undefined} drawings */
  function setDrawingsSnapshot(drawings) {
    drawingsSnapshot = drawings ?? null;
    persist();
  }

  function getDrawingsSnapshot() {
    return drawingsSnapshot;
  }

  /** @param {Record<string, object[]> | null | undefined} indicators */
  function setIndicatorsSnapshot(indicators) {
    indicatorsSnapshot = indicators ?? null;
    persist();
  }

  function getIndicatorsSnapshot() {
    return indicatorsSnapshot;
  }

  /** @param {object | null | undefined} settings */
  function setChartSettingsSnapshot(settings) {
    chartSettingsSnapshot = settings ? structuredClone(settings) : null;
    persist();
  }

  function getChartSettingsSnapshot() {
    return chartSettingsSnapshot;
  }

  /** @param {Record<string, Record<string, unknown>> | null | undefined} defaults */
  function setToolDefaultsSnapshot(defaults) {
    toolDefaultsSnapshot =
      defaults && typeof defaults === "object" ? structuredClone(defaults) : null;
    persist();
  }

  function getToolDefaultsSnapshot() {
    return toolDefaultsSnapshot;
  }

  /** @param {import("../../../drawings/toolbars/defaults/layoutTemplates.js").LayoutDrawingTemplates | null | undefined} templates */
  function setDrawingTemplatesSnapshot(templates) {
    drawingTemplatesSnapshot =
      templates && typeof templates === "object" ? structuredClone(templates) : null;
    persist();
  }

  function getDrawingTemplatesSnapshot() {
    return drawingTemplatesSnapshot;
  }

  /** @param {Record<string, object> | null | undefined} viewports */
  function setViewportsSnapshot(viewports) {
    viewportsSnapshot =
      viewports && typeof viewports === "object" ? structuredClone(viewports) : null;
    persist();
  }

  function getViewportsSnapshot() {
    return viewportsSnapshot;
  }

  function markSaved() {
    dirty = false;
    persist();
  }

  function getAutoSave() {
    return autoSave;
  }

  /** @param {boolean} enabled */
  function setAutoSave(enabled) {
    autoSave = Boolean(enabled);
    persist();
  }

  function persist() {
    try {
      const payload = {
        layoutId,
        layoutName,
        sync,
        dirty,
        autoSave,
        drawings: drawingsSnapshot,
        indicators: indicatorsSnapshot,
        chartSettings: chartSettingsSnapshot,
        toolDefaults: toolDefaultsSnapshot,
        drawingTemplates: drawingTemplatesSnapshot,
        viewports: viewportsSnapshot,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.layoutId) layoutId = clampLayoutIdForViewport(data.layoutId);
      if (data.layoutName) layoutName = data.layoutName;
      if (data.sync) sync = { ...sync, ...data.sync };
      if (data.drawings && typeof data.drawings === "object") drawingsSnapshot = data.drawings;
      if (data.indicators && typeof data.indicators === "object") indicatorsSnapshot = data.indicators;
      if (data.chartSettings && typeof data.chartSettings === "object") chartSettingsSnapshot = data.chartSettings;
      if (data.toolDefaults && typeof data.toolDefaults === "object") toolDefaultsSnapshot = data.toolDefaults;
      if (data.drawingTemplates && typeof data.drawingTemplates === "object") {
        drawingTemplatesSnapshot = data.drawingTemplates;
      }
      if (data.viewports && typeof data.viewports === "object") viewportsSnapshot = data.viewports;
      dirty = Boolean(data.dirty);
      if (typeof data.autoSave === "boolean") autoSave = data.autoSave;
    } catch {
      /* ignore */
    }
  }

  function getSecondaryPanes() {
    return [...secondaryPanes];
  }

  restore();
  setLayout(layoutId, { silent: true });

  const stopMobileLayoutWatch = onMobileLayoutViewportChange(() => {
    const clamped = clampLayoutIdForViewport(layoutId);
    if (clamped !== layoutId) setLayout(clamped);
  });

  return {
    getLayoutId: () => layoutId,
    setLayout,
    getSync,
    setSync,
    getLayoutName,
    setLayoutName,
    isDirty,
    markDirty,
    markSaved,
    getAutoSave,
    setAutoSave,
    setDrawingsSnapshot,
    getDrawingsSnapshot,
    setIndicatorsSnapshot,
    getIndicatorsSnapshot,
    setChartSettingsSnapshot,
    getChartSettingsSnapshot,
    setToolDefaultsSnapshot,
    getToolDefaultsSnapshot,
    setDrawingTemplatesSnapshot,
    getDrawingTemplatesSnapshot,
    setViewportsSnapshot,
    getViewportsSnapshot,
    setActivePane,
    getActivePaneIndex: () => activePaneIndex,
    getSecondaryPanes,
    getGridEl: () => gridEl,
    destroy: () => stopMobileLayoutWatch(),
  };
}

/** @param {SavedLayout} entry */
export function upsertLayoutLibraryEntry(entry) {
  const saved = loadSavedLayouts();
  const now = Date.now();
  const idx = saved.findIndex((s) => s.name === entry.name);
  if (idx >= 0) {
    const prev = saved[idx];
    saved[idx] = {
      ...entry,
      createdAt: prev.createdAt ?? now,
      updatedAt: now,
      lastUsedAt: prev.lastUsedAt,
    };
  } else {
    saved.push({
      ...entry,
      createdAt: now,
      updatedAt: now,
    });
  }
  saveLayoutLibrary(saved);
}

/** @param {string} name */
export function touchLayoutLastUsed(name) {
  const saved = loadSavedLayouts();
  const idx = saved.findIndex((s) => s.name === name);
  if (idx < 0) return;
  saved[idx] = { ...saved[idx], lastUsedAt: Date.now() };
  saveLayoutLibrary(saved);
}

/** @param {string} name */
export function removeLayoutFromLibrary(name) {
  saveLayoutLibrary(loadSavedLayouts().filter((s) => s.name !== name));
}

/** @param {string} name @returns {boolean} */
export function layoutNameExists(name) {
  return loadSavedLayouts().some((s) => s.name === name.trim());
}

/** @param {string} name @returns {SavedLayout | undefined} */
export function findLayoutByName(name) {
  return loadSavedLayouts().find((s) => s.name === name);
}

/** @returns {SavedLayout[]} */
export function loadSavedLayouts() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-library`);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** @param {SavedLayout[]} layouts */
export function saveLayoutLibrary(layouts) {
  try {
    localStorage.setItem(`${STORAGE_KEY}-library`, JSON.stringify(layouts));
  } catch {
    /* ignore */
  }
}
