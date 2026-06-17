import { UserDrawingsPrimitive } from "../primitives/userDrawings/index.js";
import { DRAWING_UI_SELECTOR } from "../constants.js";
import { createDrawingHistory } from "../history/index.js";
import {
  loadDrawingsVisibility,
  loadShowMobilePlacementBar,
  loadStayInDrawingMode,
} from "../toolbars/utility/settings/store.js";

export const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");

/**
 * @typedef {ReturnType<typeof createControllerState> & Record<string, any>} ControllerState
 */

/**
 * @param {object} opts
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {HTMLElement} opts.container
 * @param {() => object} opts.getContext
 */
export function createControllerState(opts) {
  const primitive = new UserDrawingsPrimitive();

  const state = {
    chart: opts.chart,
    series: opts.series,
    container: opts.container,
    getContext: opts.getContext,
    onValuesTooltipBarChange: opts.onValuesTooltipBarChange,
    getIndicatorCount: opts.getIndicatorCount ?? (() => 0),
    removeIndicators: opts.removeIndicators ?? (() => {}),
    primitive,

    drawings: /** @type {import("../types.js").UserDrawing[]} */ ([]),
    history: createDrawingHistory(),
    activeTool: "cursor",
    valuesTooltipOnLongPress: !COARSE_POINTER_MQ.matches,
    magnetMode: /** @type {"off" | "weak" | "strong"} */ ("off"),
    measureMode: false,
    drawingsHidden: false,
    hideAll: false,
    stayInDrawingMode: false,
    showMobilePlacementBar: true,
    lockAllActive: false,
    placementStaged: /** @type {import("../types.js").DrawPoint[]} */ ([]),
    freehandPoints: /** @type {import("../types.js").DrawPoint[]} */ ([]),
    freehandDrawing: false,
    freehandLastClient: /** @type {{ x: number, y: number } | null} */ (null),
    measureOverlay: /** @type {{ start: import("../types.js").DrawPoint, end: import("../types.js").DrawPoint } | null} */ (null),
    measureDragActive: false,
    drawingClipboard: /** @type {import("../types.js").UserDrawing | null} */ (null),
    preview: /** @type {import("../types.js").UserDrawing | null} */ (null),
    selectedId: /** @type {string | null} */ (null),
    hoveredId: /** @type {string | null} */ (null),
    draggingDrawing: false,
    suppressChartPlacementUntil: 0,
    lastTouchEndAt: 0,

    pinnedDrawCrosshair: /** @type {{ price: number, time: number } | null} */ (null),
    lastNativeDrawCrosshair: /** @type {{ price: number, time: number } | null} */ (null),
    drawCrosshairMedia: /** @type {{ x: number, y: number } | null} */ (null),
    anchoringDrawCrosshair: false,
    lastDrawCrosshairParam: /** @type {import("lightweight-charts").MouseEventParams | null} */ (null),
    lastCrosshairSyncApplied: /** @type {{ time: number, price: number } | null} */ (null),
    applyingCrosshairSync: false,

    DRAWING_UI_SELECTOR,
    listeners: {
      change: new Set(),
      toolChange: new Set(),
      utilityChange: new Set(),
      cursorOverlay: new Set(),
      selectionChange: new Set(),
      dragChange: new Set(),
      dragSync: new Set(),
      crosshairSync: new Set(),
      editText: new Set(),
      placementChange: new Set(),
    },

    hideValuesTooltip: () => {},
    unpinValuesTooltip: () => {},
    isValuesTooltipPinned: () => false,
    updateValuesTooltipAt: () => {},
    clearLongPress: () => {},
    scheduleLongPress: () => {},
    cancelLongPressIfMoved: () => {},

    drag: /** @type {import("./drag/index.js").ReturnType<typeof import("./drag/index.js").createDrawingDrag> | null} */ (null),
    bindChartListeners: () => {},
    unbindChartListeners: () => {},
    resetMobilePlacementGestureFn: () => {},
    unsubDrawCrosshairDotSync: () => {},
    freehandDocumentListenersBound: false,
  };

  state.emit = (/** @type {keyof typeof state.listeners} */ type) => {
    state.listeners[type].forEach((fn) => fn());
  };

  let overlayRoot =
    state.container.closest(".tv-chart-wrap__stage") ??
    state.container.closest(".tv-chart-wrap") ??
    state.container;
  state.overlayRoot = overlayRoot;

  const cursorMark = document.createElement("div");
  cursorMark.className = "chart-cursor-mark";
  cursorMark.hidden = true;
  cursorMark.setAttribute("aria-hidden", "true");
  overlayRoot.appendChild(cursorMark);
  state.cursorMark = cursorMark;

  const drawCrosshairDot = document.createElement("div");
  drawCrosshairDot.className = "chart-draw-crosshair-dot";
  drawCrosshairDot.hidden = true;
  drawCrosshairDot.setAttribute("aria-hidden", "true");
  overlayRoot.appendChild(drawCrosshairDot);
  state.drawCrosshairDot = drawCrosshairDot;

  const valuesTooltip = document.createElement("div");
  valuesTooltip.className = "chart-values-tooltip";
  valuesTooltip.hidden = true;
  valuesTooltip.setAttribute("role", "tooltip");
  overlayRoot.appendChild(valuesTooltip);
  state.valuesTooltip = valuesTooltip;

  state.series.attachPrimitive(primitive);

  window.addEventListener(
    "touchend",
    () => {
      state.lastTouchEndAt = performance.now();
    },
    { capture: true, passive: true },
  );

  const savedVisibility = loadDrawingsVisibility();
  if (savedVisibility.hideAll) state.hideAll = true;
  if (savedVisibility.hideAll || savedVisibility.drawingsHidden) state.drawingsHidden = true;
  if (loadStayInDrawingMode()) state.stayInDrawingMode = true;
  state.showMobilePlacementBar = loadShowMobilePlacementBar();

  primitive.setContextProvider(() => state.getContext());
  return state;
}
