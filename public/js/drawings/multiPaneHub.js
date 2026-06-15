import { createDrawingController } from "./controller/drawingController.js";
import { mountMainToolbar } from "./toolbars/mainToolbar.js";
import { mountEditToolbar } from "./toolbars/editToolbar.js";

/**
 * One toolbar + edit UI; independent drawing controller per chart pane.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.toolbarEl
 * @param {(paneIndex: number) => object} opts.getContextForPane
 * @param {() => boolean} [opts.getSyncDrawings]
 */
export function createMultiPaneDrawingHub(opts) {
  const { toolbarEl, getContextForPane, getSyncDrawings = () => false } = opts;

  /** @type {Map<number, ReturnType<typeof createDrawingController>>} */
  const controllers = new Map();
  /** @type {Map<number, import("lightweight-charts").IChartApi>} */
  const charts = new Map();
  let activeIndex = 0;
  let syncingDrawings = false;

  const listeners = {
    toolChange: new Set(),
    change: new Set(),
  };

  function emit(type) {
    listeners[type].forEach((fn) => fn());
  }

  function getActive() {
    return controllers.get(activeIndex) ?? controllers.values().next().value ?? null;
  }

  function forEachController(fn) {
    for (const ctrl of controllers.values()) fn(ctrl);
  }

  function broadcast(method, ...args) {
    for (const ctrl of controllers.values()) {
      ctrl[method](...args);
    }
  }

  function syncDrawingsFrom(sourceIndex) {
    if (!getSyncDrawings()) return;
    const source = controllers.get(sourceIndex);
    if (!source) return;
    const clone = structuredClone(source.getDrawings());
    syncingDrawings = true;
    try {
      for (const [idx, ctrl] of controllers) {
        if (idx === sourceIndex) continue;
        ctrl.replaceDrawings(clone, { silent: true });
      }
    } finally {
      syncingDrawings = false;
    }
  }

  /**
   * @param {number} paneIndex
   * @param {{ chart: import("lightweight-charts").IChartApi, series: import("lightweight-charts").ISeriesApi, container: HTMLElement }} pane
   */
  function attachPane(paneIndex, pane) {
    if (controllers.has(paneIndex)) return controllers.get(paneIndex);

    const ctrl = createDrawingController({
      chart: pane.chart,
      series: pane.series,
      container: pane.container,
      getContext: () => getContextForPane(paneIndex),
    });

    ctrl.on("change", () => {
      emit("change");
      if (syncingDrawings) return;
      syncDrawingsFrom(paneIndex);
    });

    ctrl.on("toolChange", () => emit("toolChange"));

    controllers.set(paneIndex, ctrl);
    charts.set(paneIndex, pane.chart);
    return ctrl;
  }

  /** @param {number} paneIndex */
  function detachPane(paneIndex) {
    const ctrl = controllers.get(paneIndex);
    if (!ctrl) return;
    ctrl.destroy();
    controllers.delete(paneIndex);
    charts.delete(paneIndex);
    if (activeIndex === paneIndex) {
      activeIndex = controllers.keys().next().value ?? 0;
    }
  }

  /** @param {number} index */
  function setActivePane(index) {
    if (!controllers.has(index)) return;
    activeIndex = index;
    emit("toolChange");
  }

  /** @type {ReturnType<typeof createDrawingController>} */
  const facade = {
    setActiveTool: (tool) => {
      broadcast("setActiveTool", tool);
      emit("toolChange");
    },
    getActiveTool: () => getActive()?.getActiveTool() ?? "cursor",
    isCursorTool: (tool) => getActive()?.isCursorTool(tool) ?? true,
    getToolLabel: () => getActive()?.getToolLabel() ?? "cursor",
    setValuesTooltipOnLongPress: (on) => broadcast("setValuesTooltipOnLongPress", on),
    getValuesTooltipOnLongPress: () => getActive()?.getValuesTooltipOnLongPress() ?? true,
    getDrawings: () => getActive()?.getDrawings() ?? [],
    getCount: () => getActive()?.getCount() ?? 0,
    getLockedCount: () => getActive()?.getLockedCount() ?? 0,
    getIndicatorCount: () => 0,
    setMagnetMode: (mode) => broadcast("setMagnetMode", mode),
    getMagnetMode: () => getActive()?.getMagnetMode() ?? "weak",
    setMeasureMode: (on) => broadcast("setMeasureMode", on),
    getMeasureMode: () => getActive()?.getMeasureMode() ?? false,
    setDrawingsHidden: (hidden) => broadcast("setDrawingsHidden", hidden),
    getDrawingsHidden: () => getActive()?.getDrawingsHidden() ?? false,
    setHideAll: (hidden) => broadcast("setHideAll", hidden),
    getHideAll: () => getActive()?.getHideAll() ?? false,
    setLockAllDrawings: (locked) => broadcast("setLockAllDrawings", locked),
    getLockAllDrawings: () => getActive()?.getLockAllDrawings() ?? false,
    setAlwaysRemoveLocked: (value) => broadcast("setAlwaysRemoveLocked", value),
    getAlwaysRemoveLocked: () => getActive()?.getAlwaysRemoveLocked() ?? false,
    removeDrawings: (opts) => {
      if (getSyncDrawings()) broadcast("removeDrawings", opts);
      else getActive()?.removeDrawings(opts);
    },
    getSelectedId: () => getActive()?.getSelectedId() ?? null,
    getSelectedDrawing: () => getActive()?.getSelectedDrawing() ?? null,
    selectDrawing: (id) => getActive()?.selectDrawing(id),
    updateDrawing: (id, patch, opts) => getActive()?.updateDrawing(id, patch, opts),
    removeDrawingById: (id) => getActive()?.removeDrawingById(id),
    getDrawingScreenAnchor: (drawing) => getActive()?.getDrawingScreenAnchor(drawing) ?? null,
    isDraggingDrawing: () => getActive()?.isDraggingDrawing() ?? false,
    clearAll: () => {
      if (getSyncDrawings()) broadcast("clearAll");
      else getActive()?.clearAll();
    },
    setTarget() {
      /* per-pane controllers stay on their chart */
    },
    on(event, fn) {
      listeners[event]?.add(fn);
      return () => listeners[event]?.delete(fn);
    },
    destroy() {
      for (const ctrl of controllers.values()) ctrl.destroy();
      controllers.clear();
    },
  };

  const mainToolbar = mountMainToolbar({ controller: facade, toolbarEl });
  const editToolbar = mountEditToolbar({
    controller: facade,
    getChart: () => charts.get(activeIndex) ?? null,
    getContext: () => getContextForPane(activeIndex),
  });

  return {
    facade,
    attachPane,
    detachPane,
    setActivePane,
    getController: (index) => controllers.get(index),
    getActiveController: getActive,
    mainToolbar,
    editToolbar,
    destroy() {
      facade.destroy();
      mainToolbar?.destroy?.();
      editToolbar?.destroy?.();
    },
  };
}
