import { createDrawingController } from "../controller/index.js";

import { mountMainToolbar } from "../toolbars/main/index.js";

import { mountEditToolbar } from "../toolbars/edit/index.js";



const HUB_EVENTS = ["toolChange", "change", "selectionChange", "dragChange", "editText", "placementChange"];

const SHAPE_ALIASES = {
  trendline: "trend-line",
  trendLine: "trend-line",
  rectangle: "rectangle",
  rect: "rectangle",
};



/**

 * One toolbar + edit UI; independent drawing controller per chart pane.

 *

 * @param {object} opts

 * @param {HTMLElement} opts.toolbarEl

 * @param {(paneIndex: number) => object} opts.getContextForPane

 * @param {() => boolean} [opts.getSyncDrawings]
 * @param {() => boolean} [opts.getSyncCrosshair]
 * @param {(paneIndex: number) => number} [opts.getIndicatorCountForPane]
 * @param {(paneIndex: number) => void} [opts.removeIndicatorsForPane]
 */
export function createMultiPaneDrawingHub(opts) {
  const {
    toolbarEl,
    getContextForPane,
    getSyncDrawings = () => false,
    getSyncCrosshair = () => false,
    onValuesTooltipBarChange,
    getIndicatorCountForPane = () => 0,
    removeIndicatorsForPane = () => {},
  } = opts;



  /** @type {Map<number, ReturnType<typeof createDrawingController>>} */

  const controllers = new Map();

  /** @type {Map<number, import("lightweight-charts").IChartApi>} */

  const charts = new Map();

  let activeIndex = 0;

  let syncingDrawings = false;
  /** @type {number | null} */
  let pendingDragSyncIndex = null;
  /** @type {number} */
  let dragSyncRaf = 0;
  /** @type {{ sourceIndex: number, snapshot: { time?: number, price?: number } | null } | null} */
  let pendingGlobalCrosshair = null;
  /** @type {number} */
  let globalCrosshairRaf = 0;
  let lastGlobalCrosshairKey = "";
  /** @type {Set<import("lightweight-charts").IChartApi>} */
  const crosshairEchoCharts = new Set();



  /** @type {Record<string, Set<Function>>} */

  const listeners = Object.fromEntries(HUB_EVENTS.map((e) => [e, new Set()]));



  /** @param {string} type @param {...unknown} args */

  function emit(type, ...args) {

    listeners[type]?.forEach((fn) => fn(...args));

  }



  function getActive() {

    return controllers.get(activeIndex) ?? controllers.values().next().value ?? null;

  }



  function broadcast(method, ...args) {

    for (const ctrl of controllers.values()) {

      ctrl[method](...args);

    }

  }



  function syncPlacementFrom(sourceIndex) {
    if (!getSyncDrawings()) return;
    const source = controllers.get(sourceIndex);
    if (!source) return;
    const snapshot = source.getPlacementSyncSnapshot();
    syncingDrawings = true;
    try {
      for (const [idx, ctrl] of controllers) {
        if (idx === sourceIndex) continue;
        ctrl.applyPlacementSyncSnapshot(snapshot);
      }
    } finally {
      syncingDrawings = false;
    }
  }



  function syncDrawingsFrom(sourceIndex, opts = {}) {

    if (!getSyncDrawings()) return;

    const source = controllers.get(sourceIndex);

    if (!source) return;

    const clone = structuredClone(source.getDrawings());
    const selectedId = source.getSelectedId();

    syncingDrawings = true;

    try {

      for (const [idx, ctrl] of controllers) {

        if (idx === sourceIndex) continue;

        if (opts.dragFrame) {
          ctrl.applyDrawingsSync(clone, selectedId);
        } else {
          ctrl.replaceDrawings(clone, { silent: true });
          ctrl.selectDrawing(selectedId, { silent: true });
        }

      }

    } finally {

      syncingDrawings = false;

    }

  }

  function shouldUseGlobalCrosshair() {
    if (controllers.size <= 1) return false;
    return getSyncDrawings() || getSyncCrosshair();
  }

  /** @param {import("lightweight-charts").IChartApi} chart */
  function isCrosshairEcho(chart) {
    return crosshairEchoCharts.has(chart);
  }

  /**
   * @param {number} sourceIndex
   * @param {{ time?: number, price?: number } | null} snapshot
   */
  function publishGlobalCrosshair(sourceIndex, snapshot) {
    if (!shouldUseGlobalCrosshair()) return;
    if (snapshot == null) lastGlobalCrosshairKey = "";
    pendingGlobalCrosshair = { sourceIndex, snapshot };
    if (globalCrosshairRaf) return;
    globalCrosshairRaf = requestAnimationFrame(() => {
      globalCrosshairRaf = 0;
      flushGlobalCrosshair();
    });
  }

  function flushGlobalCrosshair() {
    const pending = pendingGlobalCrosshair;
    pendingGlobalCrosshair = null;
    if (!pending || !shouldUseGlobalCrosshair()) return;

    const { sourceIndex, snapshot } = pending;
    const key = snapshot == null ? "clear" : `${snapshot.time}:${snapshot.price}`;
    if (key === lastGlobalCrosshairKey) return;
    lastGlobalCrosshairKey = key;

    syncingDrawings = true;
    try {
      for (const [idx, ctrl] of controllers) {
        if (idx === sourceIndex) continue;
        const chart = charts.get(idx);
        if (chart) crosshairEchoCharts.add(chart);
        ctrl.applyCrosshairSyncSnapshot?.(snapshot);
      }
    } finally {
      syncingDrawings = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => crosshairEchoCharts.clear());
      });
    }
  }

  /** @param {number} sourceIndex @param {{ clear?: boolean }} [opts] */
  function publishGlobalCrosshairFromController(sourceIndex, opts = {}) {
    if (!shouldUseGlobalCrosshair()) return;
    const source = controllers.get(sourceIndex);
    if (!source) return;
    const snapshot = opts.clear ? null : (source.getCrosshairSyncSnapshot?.() ?? null);
    publishGlobalCrosshair(sourceIndex, snapshot);
  }

  /**
   * @param {{ index: number, series: import("lightweight-charts").ISeriesApi }} pane
   * @param {import("lightweight-charts").MouseEventParams} param
   */
  function publishGlobalCrosshairFromLayout(pane, param) {
    if (!shouldUseGlobalCrosshair()) return;
    if (!pane.bars?.length) return;
    let snapshot = null;
    if (param?.time != null && param.point) {
      const price = pane.series.coordinateToPrice(param.point.y);
      if (price != null && Number.isFinite(price)) {
        snapshot = { time: param.time, price };
      }
    }
    publishGlobalCrosshair(pane.index, snapshot);
  }

  function resetGlobalCrosshair() {
    lastGlobalCrosshairKey = "";
    pendingGlobalCrosshair = null;
    if (globalCrosshairRaf) {
      cancelAnimationFrame(globalCrosshairRaf);
      globalCrosshairRaf = 0;
    }
    crosshairEchoCharts.clear();
  }

  function scheduleDragSync(sourceIndex) {
    if (!getSyncDrawings()) return;
    pendingDragSyncIndex = sourceIndex;
    if (dragSyncRaf) return;
    dragSyncRaf = requestAnimationFrame(() => {
      dragSyncRaf = 0;
      const idx = pendingDragSyncIndex;
      pendingDragSyncIndex = null;
      if (idx == null || syncingDrawings) return;
      syncDrawingsFrom(idx, { dragFrame: true });
      publishGlobalCrosshairFromController(idx);
    });
  }



  /** @param {ReturnType<typeof createDrawingController>} ctrl @param {number} paneIndex */

  function wireController(ctrl, paneIndex) {

    ctrl.on("change", () => {

      emit("change");

      if (syncingDrawings) return;

      syncDrawingsFrom(paneIndex);
      syncPlacementFrom(paneIndex);

    });



    ctrl.on("toolChange", () => emit("toolChange"));



    ctrl.on("selectionChange", () => {

      if (syncingDrawings) return;

      if (ctrl.getSelectedId()) activeIndex = paneIndex;

      emit("selectionChange");

    });



    ctrl.on("dragChange", () => {

      if (paneIndex === activeIndex) emit("dragChange");

      if (syncingDrawings) return;
      if (!getSyncDrawings()) return;
      if (!ctrl.isDraggingDrawing()) publishGlobalCrosshairFromController(paneIndex, { clear: true });

    });

    ctrl.on("dragSync", () => {
      if (syncingDrawings) return;
      scheduleDragSync(paneIndex);
    });

    ctrl.on("crosshairSync", () => {
      if (syncingDrawings) return;
      if (ctrl.isDraggingDrawing?.()) return;
      publishGlobalCrosshairFromController(paneIndex);
    });



    ctrl.on("editText", (drawing) => {

      activeIndex = paneIndex;

      emit("editText", drawing);

    });

    ctrl.on("placementChange", () => {
      if (paneIndex === activeIndex) emit("placementChange");
      if (syncingDrawings) return;
      syncPlacementFrom(paneIndex);
      publishGlobalCrosshairFromController(paneIndex);
    });

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

      onValuesTooltipBarChange: (bar, prev) => onValuesTooltipBarChange?.(paneIndex, bar, prev),

      getIndicatorCount: () => getIndicatorCountForPane(paneIndex),

      removeIndicators: () => removeIndicatorsForPane(paneIndex),

    });



    wireController(ctrl, paneIndex);



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

      emit("selectionChange");

    }

  }



  /** @param {number} index */

  function setActivePane(index) {

    if (!controllers.has(index)) return;

    activeIndex = index;

    emit("toolChange");

    emit("selectionChange");

    emit("placementChange");

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

    getIndicatorCount: () => getIndicatorCountForPane(activeIndex),

    removeIndicators: () => removeIndicatorsForPane(activeIndex),

    setMagnetMode: (mode) => broadcast("setMagnetMode", mode),

    getMagnetMode: () => getActive()?.getMagnetMode() ?? "off",

    setMeasureMode: (on) => broadcast("setMeasureMode", on),

    getMeasureMode: () => getActive()?.getMeasureMode() ?? false,

    setDrawingsHidden: (hidden) => broadcast("setDrawingsHidden", hidden),

    getDrawingsHidden: () => getActive()?.getDrawingsHidden() ?? false,

    setHideAll: (hidden) => broadcast("setHideAll", hidden),

    getHideAll: () => getActive()?.getHideAll() ?? false,

    setStayInDrawingMode: (on) => broadcast("setStayInDrawingMode", on),

    getStayInDrawingMode: () => getActive()?.getStayInDrawingMode() ?? false,

    setShowMobilePlacementBar: (on) => broadcast("setShowMobilePlacementBar", on),

    getShowMobilePlacementBar: () => getActive()?.getShowMobilePlacementBar() ?? true,

    setLockAllDrawings: (locked) => broadcast("setLockAllDrawings", locked),

    getLockAllDrawings: () => getActive()?.getLockAllDrawings() ?? false,

    setAlwaysRemoveLocked: (value) => broadcast("setAlwaysRemoveLocked", value),

    getAlwaysRemoveLocked: () => getActive()?.getAlwaysRemoveLocked() ?? false,

    removeDrawings: (opts) => {

      if (getSyncDrawings()) broadcast("removeDrawings", opts);

      else getActive()?.removeDrawings(opts);

    },

    armChartPlacementSuppress: (ms) => getActive()?.armChartPlacementSuppress(ms),

    getPlacementStaged: () => getActive()?.getPlacementStaged() ?? [],

    hasPreview: () => getActive()?.hasPreview() ?? false,

    cancelPlacement: () => getActive()?.cancelPlacement(),

    finishMultiPointPlacement: () => getActive()?.finishMultiPointPlacement(),

    getSelectedId: () => getActive()?.getSelectedId() ?? null,

    getSelectedDrawing: () => getActive()?.getSelectedDrawing() ?? null,

    selectDrawing: (id) => getActive()?.selectDrawing(id),

    updateDrawing: (id, patch, opts) => getActive()?.updateDrawing(id, patch, opts),

    removeDrawingById: (id) => getActive()?.removeDrawingById(id),
    drawShape: (shape, points, opts = {}) => {
      const type = SHAPE_ALIASES[shape] ?? shape;
      const targetIndex =
        opts.paneIndex != null && Number.isInteger(opts.paneIndex) ? opts.paneIndex : activeIndex;
      const ctrl = controllers.get(targetIndex);
      if (!ctrl) throw new Error(`Pane ${targetIndex} is not attached`);
      const drawing = ctrl.addDrawing(type, points, {
        locked: opts.locked,
        props: opts.props,
      });
      if (getSyncDrawings()) {
        syncDrawingsFrom(targetIndex);
        syncPlacementFrom(targetIndex);
      }
      emit("change");
      return drawing;
    },

    getDrawingScreenAnchor: (drawing) => getActive()?.getDrawingScreenAnchor(drawing) ?? null,

    isDraggingDrawing: () => getActive()?.isDraggingDrawing() ?? false,

    undoDrawing: () => getActive()?.undoDrawing() ?? false,

    redoDrawing: () => getActive()?.redoDrawing() ?? false,

    canUndoDrawing: () => getActive()?.canUndoDrawing() ?? false,

    canRedoDrawing: () => getActive()?.canRedoDrawing() ?? false,

    clearAll: () => {

      if (getSyncDrawings()) broadcast("clearAll");

      else getActive()?.clearAll();

    },

    copySelectedDrawing: () => getActive()?.copySelectedDrawing() ?? false,

    hasDrawingClipboard: () => getActive()?.hasDrawingClipboard() ?? false,

    pasteDrawing: (src) => getActive()?.pasteDrawing(src) ?? false,

    pasteDrawingFromSystemClipboard: () =>
      getActive()?.pasteDrawingFromSystemClipboard() ?? Promise.resolve(false),

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

      charts.clear();

    },

  };



  const mainToolbar = mountMainToolbar({ controller: facade, toolbarEl });

  const editToolbar = mountEditToolbar({

    controller: facade,

    getChart: () => charts.get(activeIndex) ?? null,

    getContext: () => getContextForPane(activeIndex),

  });



  function getDrawingsByPane() {
    /** @type {Record<string, import("../../types.js").UserDrawing[]>} */
    const out = {};
    for (const [idx, ctrl] of controllers) {
      out[String(idx)] = structuredClone(ctrl.getDrawings());
    }
    return out;
  }

  /** @param {Record<string, import("../../types.js").UserDrawing[]> | undefined} data */
  function setDrawingsByPane(data) {
    if (!data || typeof data !== "object") return;
    syncingDrawings = true;
    try {
      for (const [key, list] of Object.entries(data)) {
        const idx = Number(key);
        const ctrl = controllers.get(idx);
        if (ctrl && Array.isArray(list)) {
          ctrl.replaceDrawings(list, { silent: true, source: `pane ${idx}` });
        }
      }
    } finally {
      syncingDrawings = false;
    }
    emit("change");
    emit("selectionChange");
  }

  return {

    facade,

    attachPane,

    detachPane,

    setActivePane,

    getController: (index) => controllers.get(index),

    getActiveController: getActive,

    getDrawingsByPane,

    setDrawingsByPane,

    shouldUseGlobalCrosshair,
    isCrosshairEcho,
    publishGlobalCrosshairFromLayout,

    resetGlobalCrosshair,

    mainToolbar,

    editToolbar,

    destroy() {

      facade.destroy();

      mainToolbar?.destroy?.();

      editToolbar?.destroy?.();

    },

  };

}


