import { UserDrawingsPrimitive } from "../primitives/userDrawings/index.js";
import { chartXAt, chartVisibleRightX, pixelToPoint, safePriceToY, coordMapBars } from "../../chart/coords/timeScale.js";
import { TOOL_LABELS } from "../catalog/tools.js";
import { DRAWING_UI_SELECTOR } from "../constants.js";
import { findDrawingAt, hitDrawingAnchor } from "./hit/test.js";
import { hitTrendLineStatsBox, isTrendLineFamilyType } from "../tools/line/trendStats.js";
import { finalizeMeasureDrawing, isMeasureTool } from "../tools/measure/index.js";
import { finalizeForecastDrawing, isForecastTool } from "../tools/forecast/index.js";
import {
  hitPositionStatsBox,
  finalizePositionDrawing,
  isPositionTool,
} from "../tools/position/barrel.js";
import { ensureTrendAngleDrawing, trendAngleSecondPoint } from "../tools/line/trendAngle.js";
import {
  finalizeParallelChannelDrawing,
  resolvePriceOffset,
} from "../tools/channel/parallel.js";
import {
  finalizeFlatTopBottomDrawing,
  resolveFlatPrice,
} from "../tools/channel/flatTopBottom.js";
import { clampRegressionPoint, finalizeRegressionDrawing, isRegressionTrendTool, normalizeRegressionDrawing } from "../tools/regression/trend.js";
import { finalizeDisjointChannelDrawing } from "../tools/channel/disjoint.js";
import { finalizeFibRetracementDrawing, isFibRetracementTool } from "../tools/fib/retracement.js";
import { finalizeGannDrawing, isGannTool } from "../tools/gann/index.js";
import { finalizePatternDrawing, isPatternTool } from "../tools/pattern/index.js";
import { finalizeCycleDrawing, isCycleTool } from "../tools/cycle/index.js";
import {
  extractToolDefaults,
  isToolDefaultsPatch,
  saveToolDefaults,
} from "../toolbars/defaults/store.js";
import { CURSOR_TOOLS, isCursorTool as isCursorToolType, isMultiPointTool } from "../registry/tools.js";
import { keepsToolAfterCommit } from "../tools/shape/index.js";
import { applyMagnetSnap } from "../tools/snap/magnet.js";
import { loadAlwaysRemoveLocked, saveAlwaysRemoveLocked } from "../toolbars/utility/settings/store.js";
import { shouldShowLockedRemoveConfirm, showRemoveLockedConfirmDialog } from "../settings/confirm/remove.js";
import { newDrawing, cloneDrawing, CLIPBOARD_PREFIX } from "./factory/index.js";
import { createTooltipOverlay } from "./tooltip/overlay.js";
import { createDrawingDrag } from "./drag/index.js";
import { createPointerHandlers } from "./pointer/handlers.js";

/**
 * @param {object} opts
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {HTMLElement} opts.container
 * @param {() => { bars: { time: number, open?: number, high?: number, low?: number, close?: number }[], barSec: number }} opts.getContext
 */
export function createDrawingController(opts) {
  let chart = opts.chart;
  let series = opts.series;
  let container = opts.container;
  let getContext = opts.getContext;
  const primitive = new UserDrawingsPrimitive();
  primitive.setContextProvider(() => getContext());
  series.attachPrimitive(primitive);

  /** @type {import("../types.js").UserDrawing[]} */
  let drawings = [];
  let activeTool = "cursor";
  let valuesTooltipOnLongPress = true;
  /** @type {"off" | "weak" | "strong"} */
  let magnetMode = "off";
  let measureMode = false;
  let drawingsHidden = false;
  let hideAll = false;
  let lockAllActive = false;
  /** @type {import("../types.js").DrawPoint[]} */
  let placementStaged = [];
  /** @type {import("../types.js").DrawPoint[]} */
  let freehandPoints = [];
  let freehandDrawing = false;
  /** @type {{ x: number, y: number } | null} */
  let freehandLastClient = null;
  /** @type {{ start: import("../types.js").DrawPoint, end: import("../types.js").DrawPoint } | null} */
  let measureOverlay = null;
  let measureDragActive = false;
  /** @type {import("../types.js").UserDrawing | null} */
  let drawingClipboard = null;
  /** @type {import("../types.js").UserDrawing | null} */
  let preview = null;
  /** @type {string | null} */
  let selectedId = null;
  /** @type {string | null} */
  let hoveredId = null;
  let isDraggingDrawing = false;

  const listeners = {
    change: new Set(),
    toolChange: new Set(),
    utilityChange: new Set(),
    cursorOverlay: new Set(),
    selectionChange: new Set(),
    dragChange: new Set(),
    editText: new Set(),
  };

  let overlayRoot =
    container.closest(".tv-chart-wrap__stage") ?? container.closest(".tv-chart-wrap") ?? container;

  const cursorMark = document.createElement("div");
  cursorMark.className = "chart-cursor-mark";
  cursorMark.hidden = true;
  cursorMark.setAttribute("aria-hidden", "true");
  overlayRoot.appendChild(cursorMark);

  const valuesTooltip = document.createElement("div");
  valuesTooltip.className = "chart-values-tooltip";
  valuesTooltip.hidden = true;
  valuesTooltip.setAttribute("role", "tooltip");
  overlayRoot.appendChild(valuesTooltip);

  /** @type {() => void} */
  let hideValuesTooltip = () => {
    valuesTooltip.hidden = true;
  };
  /** @type {() => void} */
  let clearLongPress = () => {};
  /** @type {(x: number, y: number) => void} */
  let scheduleLongPress = () => {};
  /** @type {(x: number, y: number) => void} */
  let cancelLongPressIfMoved = () => {};

  let drag = /** @type {ReturnType<typeof createDrawingDrag>} */ (null);
  let bindChartListeners = () => {};
  let unbindChartListeners = () => {};

  function emit(type) {
    listeners[type].forEach((fn) => fn());
  }

  function setDraggingDrawing(active) {
    if (isDraggingDrawing === active) return;
    isDraggingDrawing = active;
    emit("dragChange");
  }

  function shouldBlockChartPan() {
    return (
      measureDragActive ||
      freehandDrawing ||
      (!isCursorTool(activeTool) && activeTool !== "eraser") ||
      placementStaged.length > 0 ||
      preview != null ||
      drag.isDragging()
    );
  }

  function syncChartPointerHandling() {
    const block = shouldBlockChartPan();
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: !block,
        horzTouchDrag: !block,
        vertTouchDrag: !block,
      },
    });
  }

  /** @param {MouseEvent} ev */
  function swallowChartPointer(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  function isCursorTool(tool = activeTool) {
    return isCursorToolType(tool);
  }

  function setPreview(p) {
    preview = p;
    primitive.setPreview(p);
    syncChartPointerHandling();
  }

  function setMeasureOverlay(overlay) {
    measureOverlay = overlay;
    primitive.setMeasureOverlay(overlay);
  }

  function syncDrawingsToPrimitive() {
    primitive.setDrawings(drawings);
    primitive.setDrawingsHidden(drawingsHidden || hideAll);
  }

  function selectDrawing(id) {
    if (id) {
      const idx = drawings.findIndex((d) => d.id === id);
      if (idx >= 0) {
        const { barSec = 60 } = getContext();
        const next = ensureTrendAngleDrawing(drawings[idx], barSec);
        if (next !== drawings[idx]) {
          drawings = drawings.map((d, i) => (i === idx ? next : d));
          syncDrawingsToPrimitive();
        }
      }
    }
    selectedId = id;
    primitive.setSelectedId(id);
    emit("selectionChange");
  }

  function setHoveredDrawing(id) {
    if (hoveredId === id) return;
    hoveredId = id;
    primitive.setHoveredId(id);
  }

  function updateDrawingHover(clientX, clientY) {
    if (!isCursorTool(activeTool) || drag?.isDragging?.() || placementStaged.length > 0 || preview != null) {
      setHoveredDrawing(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const idx = findDrawingAt(drawings, px, py, drawingCoords);
    const id = idx >= 0 ? (drawings[idx]?.id ?? null) : null;
    setHoveredDrawing(id);
  }

  function commitDrawing(drawing) {
    let committed = drawing;
    if (isRegressionTrendTool(drawing.type)) {
      const { bars, barSec } = getContext();
      committed = finalizeRegressionDrawing(drawing, bars, barSec);
    }
    saveToolDefaults(committed.type, extractToolDefaults(committed));
    drawings = [...drawings, committed];
    syncDrawingsToPrimitive();
    resetPlacement();
    if (!keepsToolAfterCommit(committed.type)) setActiveTool("cursor");
    selectDrawing(committed.id);
    emit("change");
  }

  function copySelectedDrawing() {
    const sel = getSelectedDrawing();
    if (!sel) return false;
    drawingClipboard = JSON.parse(JSON.stringify(sel));
    try {
      navigator.clipboard.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(drawingClipboard)}`);
    } catch {
      /* ignore */
    }
    return true;
  }

  function hasDrawingClipboard() {
    return drawingClipboard != null;
  }

  /**
   * @param {import("../types.js").UserDrawing} [source]
   */
  function pasteDrawing(source) {
    const src = source ?? drawingClipboard;
    if (!src) return false;
    const { barSec = 60 } = getContext();
    const pasted = cloneDrawing(src, { timeDelta: barSec });
    commitDrawing(pasted);
    drawingClipboard = JSON.parse(JSON.stringify(src));
    return true;
  }

  async function pasteDrawingFromSystemClipboard() {
    if (drawingClipboard && pasteDrawing()) return true;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.startsWith(CLIPBOARD_PREFIX)) return false;
      const parsed = JSON.parse(text.slice(CLIPBOARD_PREFIX.length));
      if (!parsed?.type || !Array.isArray(parsed.points)) return false;
      drawingClipboard = parsed;
      return pasteDrawing(parsed);
    } catch {
      return false;
    }
  }

  function resetPlacement() {
    placementStaged = [];
    freehandPoints = [];
    freehandDrawing = false;
    freehandLastClient = null;
    setPreview(null);
  }

  function finishMultiPointPlacement() {
    if (!isMultiPointTool(activeTool) || placementStaged.length < 2) {
      resetPlacement();
      return;
    }
    commitDrawing(newDrawing(activeTool, [...placementStaged]));
    resetPlacement();
  }

  function clearAll() {
    drawings = [];
    resetPlacement();
    setMeasureOverlay(null);
    measureDragActive = false;
    selectDrawing(null);
    syncDrawingsToPrimitive();
    emit("change");
  }

  function removeDrawings(opts = {}) {
    const includeLocked = Boolean(opts.includeLocked);
    if (!drawings.length) return;

    const lockedCount = drawings.filter((d) => d.locked).length;
    const unlockedCount = drawings.length - lockedCount;

    const doRemoveAll = () => {
      drawings = [];
      setMeasureOverlay(null);
      measureDragActive = false;
      selectDrawing(null);
      syncDrawingsToPrimitive();
      emit("change");
    };

    const doRemoveUnlocked = () => {
      if (!unlockedCount) return;
      drawings = drawings.filter((d) => !d.locked);
      selectDrawing(null);
      syncDrawingsToPrimitive();
      emit("change");
    };

    if (includeLocked) {
      doRemoveAll();
      return;
    }

    if (lockedCount > 0) {
      if (!unlockedCount) {
        if (shouldShowLockedRemoveConfirm()) {
          showRemoveLockedConfirmDialog({
            onYes: doRemoveAll,
            onNo: () => {},
          });
          return;
        }
        doRemoveAll();
        return;
      }
      if (shouldShowLockedRemoveConfirm()) {
        showRemoveLockedConfirmDialog({
          onYes: doRemoveAll,
          onNo: doRemoveUnlocked,
        });
        return;
      }
      doRemoveUnlocked();
      return;
    }

    doRemoveAll();
  }

  function getLockedCount() {
    return drawings.filter((d) => d.locked).length;
  }

  function setMagnetMode(mode) {
    magnetMode = mode === "off" || mode === "strong" ? mode : "weak";
    emit("utilityChange");
  }

  function getMagnetMode() {
    return magnetMode;
  }

  function setMeasureMode(on) {
    measureMode = Boolean(on);
    if (!measureMode) {
      setMeasureOverlay(null);
      measureDragActive = false;
    }
    emit("utilityChange");
    syncChartPointerHandling();
  }

  function getMeasureMode() {
    return measureMode;
  }

  function setDrawingsHidden(hidden) {
    drawingsHidden = Boolean(hidden);
    hideAll = false;
    syncDrawingsToPrimitive();
    emit("utilityChange");
  }

  function getDrawingsHidden() {
    return drawingsHidden;
  }

  function setHideAll(hidden) {
    hideAll = Boolean(hidden);
    if (hideAll) drawingsHidden = true;
    syncDrawingsToPrimitive();
    emit("utilityChange");
  }

  function getHideAll() {
    return hideAll;
  }

  function setLockAllDrawings(locked) {
    lockAllActive = Boolean(locked);
    drawings = drawings.map((d) => ({ ...d, locked: lockAllActive }));
    syncDrawingsToPrimitive();
    emit("change");
    emit("utilityChange");
  }

  function getLockAllDrawings() {
    return lockAllActive;
  }

  function setAlwaysRemoveLocked(value) {
    saveAlwaysRemoveLocked(Boolean(value));
    emit("utilityChange");
  }

  function getAlwaysRemoveLocked() {
    return loadAlwaysRemoveLocked();
  }

  function getIndicatorCount() {
    return 0;
  }

  function setActiveTool(tool) {
    activeTool = tool || "cursor";
    resetPlacement();
    hideValuesTooltip();
    updateCursorMarkVisibility();
    if (!isCursorTool(activeTool)) selectDrawing(null);
    syncChartPointerHandling();
    emit("toolChange");
    emit("cursorOverlay");
  }

  function setValuesTooltipOnLongPress(on) {
    valuesTooltipOnLongPress = Boolean(on);
  }

  function getValuesTooltipOnLongPress() {
    return valuesTooltipOnLongPress;
  }

  function resolvePoint(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { bars, barSec } = getContext();
    const mapBars = coordMapBars(getContext());
    const point = pixelToPoint(chart, series, mapBars, barSec, x, y);
    if (!point) return null;
    return applyMagnetSnap(point, magnetMode, bars);
  }

  function resolveRegressionPoint(clientX, clientY) {
    const point = resolvePoint(clientX, clientY);
    if (!point) return null;
    const { bars, barSec } = getContext();
    return clampRegressionPoint(point, bars, barSec);
  }

  ({ hideValuesTooltip, clearLongPress, scheduleLongPress, cancelLongPressIfMoved } =
    createTooltipOverlay({
      getContext,
      resolvePoint,
      valuesTooltip,
      overlayRoot,
    }));

  function drawingCoords(drawing) {
    const { bars, barSec } = getContext();
    const mapBars = coordMapBars(getContext());
    const ts = chart.timeScale();
    const timeToX = (t) => chartXAt(ts, mapBars, barSec, undefined, t);
    const priceToY = (p) => safePriceToY(series, p);
    const right = chartVisibleRightX(ts) ?? 0;
    const bottom = container.clientHeight || 400;

    const pts = drawing.points.map((p) => {
      const x = timeToX(p.time);
      const y = priceToY(p.price);
      if (x == null || y == null) return null;
      return { x, y };
    });

    return { pts, right, bottom, timeToX, priceToY, bars };
  }

  function findStatsHit(px, py) {
    const ctx = getContext();
    for (let i = drawings.length - 1; i >= 0; i -= 1) {
      const drawing = drawings[i];
      if (drawing.locked || (!isTrendLineFamilyType(drawing.type) && !isPositionTool(drawing.type))) continue;
      const { pts, timeToX, priceToY } = drawingCoords(drawing);
      const a = pts[0];
      let b = pts[1];
      if (!a || !b) continue;
      const isSelected = drawing.id === selectedId;
      const isHovered = drawing.id === hoveredId;
      if (isPositionTool(drawing.type) && timeToX && priceToY) {
        if (
          hitPositionStatsBox(drawing, px, py, timeToX, priceToY, {
            isSelected,
            isHovered,
            hoveredDrawingId: hoveredId,
            precision: ctx.precision,
            bars: ctx.bars,
          })
        ) {
          return drawing;
        }
        continue;
      }
      if (!b && drawing.type === "trend-angle") {
        const p2 = trendAngleSecondPoint(drawing);
        if (p2 && timeToX && priceToY) {
          const x = timeToX(p2.time);
          const y = priceToY(p2.price);
          if (x != null && y != null) b = { x, y };
        }
      }
      if (!a || !b) continue;
      if (
        hitTrendLineStatsBox(drawing, px, py, a, b, {
          isSelected,
          barSec: ctx.barSec,
          precision: ctx.precision,
        })
      ) {
        return drawing;
      }
    }
    return null;
  }

  function findAnchorHit(px, py) {
    const selected = getSelectedDrawing();
    if (selected && !selected.locked) {
      const anchorIdx = hitDrawingAnchor(selected, px, py, drawingCoords);
      if (anchorIdx >= 0) return { drawing: selected, pointIndex: anchorIdx };
    }

    for (let i = drawings.length - 1; i >= 0; i -= 1) {
      const drawing = drawings[i];
      if (drawing.locked || drawing.id === selectedId) continue;
      const anchorIdx = hitDrawingAnchor(drawing, px, py, drawingCoords);
      if (anchorIdx >= 0) return { drawing, pointIndex: anchorIdx };
    }
    return null;
  }

  function findDrawingAtPointer(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return findDrawingAt(drawings, px, py, drawingCoords);
  }

  function removeDrawingAt(index) {
    const removed = drawings[index];
    drawings = drawings.filter((_, i) => i !== index);
    if (removed?.id === selectedId) selectDrawing(null);
    syncDrawingsToPrimitive();
    emit("change");
  }

  function removeDrawingById(id) {
    const idx = drawings.findIndex((d) => d.id === id);
    if (idx >= 0) removeDrawingAt(idx);
  }

  /**
   * @param {import("../types.js").UserDrawing[]} next
   * @param {{ silent?: boolean }} [opts]
   */
  function replaceDrawings(next, opts = {}) {
    drawings = structuredClone(next);
    if (!drawings.some((d) => d.id === selectedId)) selectDrawing(null);
    syncDrawingsToPrimitive();
    if (!opts.silent) emit("change");
  }

  function updateDrawing(id, patch, opts = {}) {
    const idx = drawings.findIndex((d) => d.id === id);
    if (idx < 0) return;
    drawings = drawings.map((d) => {
      if (d.id !== id) return d;
      const merged = { ...d, ...patch };
      if (d.type === "parallel-channel") return finalizeParallelChannelDrawing(merged);
      if (d.type === "flat-top-bottom") return finalizeFlatTopBottomDrawing(merged);
      if (d.type === "disjoint-channel") return finalizeDisjointChannelDrawing(merged);
      if (isFibRetracementTool(d.type)) return finalizeFibRetracementDrawing(merged);
      if (isGannTool(d.type)) return finalizeGannDrawing(merged);
      if (isPatternTool(d.type)) return finalizePatternDrawing(merged);
      if (isCycleTool(d.type)) return finalizeCycleDrawing(merged);
      if (d.type === "regression-trend") return normalizeRegressionDrawing(merged);
      if (isPositionTool(d.type)) return finalizePositionDrawing(merged);
      if (isForecastTool(d.type)) return finalizeForecastDrawing(merged);
      if (isMeasureTool(d.type)) return finalizeMeasureDrawing(merged);
      return merged;
    });
    const updated = drawings.find((d) => d.id === id);
    if (updated && isToolDefaultsPatch(patch, updated.type)) {
      saveToolDefaults(updated.type, extractToolDefaults(updated));
    }
    primitive.setDrawings(drawings);
    if (!opts.silent) emit("change");
  }

  function appendFreehandPoint(clientX, clientY, point) {
    if (freehandLastClient) {
      const dist = Math.hypot(clientX - freehandLastClient.x, clientY - freehandLastClient.y);
      if (dist < 3) return;
    }
    freehandLastClient = { x: clientX, y: clientY };
    freehandPoints.push(point);
    setPreview(newDrawing(activeTool, [...freehandPoints]));
  }

  function getSelectedDrawing() {
    return drawings.find((d) => d.id === selectedId) ?? null;
  }

  function getDrawingScreenAnchor(drawing) {
    const { pts } = drawingCoords(drawing);
    if (!pts[0]) return null;
    const a = pts[0];
    const b = pts[1] ?? pts[0];
    const rect = container.getBoundingClientRect();
    return {
      left: rect.left + (a.x + b.x) / 2,
      top: rect.top + (a.y + b.y) / 2,
    };
  }

  function updateCursorMark(clientX, clientY, point) {
    if (!["dot", "demonstration"].includes(activeTool)) {
      cursorMark.hidden = true;
      return;
    }
    const rect = container.getBoundingClientRect();
    const x = point?.x ?? clientX - rect.left;
    const y = point?.y ?? clientY - rect.top;
    cursorMark.style.left = `${x}px`;
    cursorMark.style.top = `${y}px`;
    cursorMark.classList.toggle("chart-cursor-mark--demo", activeTool === "demonstration");
    cursorMark.hidden = false;
  }

  function hideCursorMark() {
    cursorMark.hidden = true;
  }

  function updateCursorMarkVisibility() {
    if (!["dot", "demonstration"].includes(activeTool)) {
      cursorMark.hidden = true;
    }
  }

  /** @param {import("../types.js").DrawPoint} point */
  function startFreehand(point, clientX, clientY) {
    freehandDrawing = true;
    freehandPoints = [point];
    freehandLastClient = { x: clientX, y: clientY };
    setPreview(newDrawing(activeTool, [point]));
    syncChartPointerHandling();
  }

  function finishFreehand() {
    if (!freehandDrawing) return;
    freehandDrawing = false;
    if (freehandPoints.length >= 2) {
      commitDrawing(newDrawing(activeTool, [...freehandPoints]));
    }
    freehandPoints = [];
    freehandLastClient = null;
    setPreview(null);
    syncChartPointerHandling();
  }

  const pointerApi = {
    container,
    overlayRoot,
    chart,
    DRAWING_UI_SELECTOR,
    getActiveTool: () => activeTool,
    setActiveTool,
    isCursorTool,
    getDrawings: () => drawings,
    getPlacementStaged: () => placementStaged,
    getPreview: () => preview,
    setPreview,
    resetPlacement,
    commitDrawing,
    finishMultiPointPlacement,
    getContext,
    resolvePoint,
    resolveRegressionPoint,
    resolvePriceOffset,
    resolveFlatPrice,
    swallowChartPointer,
    syncChartPointerHandling,
    findDrawingAtPointer,
    updateDrawingHover,
    setHoveredDrawing,
    findStatsHit,
    findAnchorHit,
    selectDrawing,
    removeDrawingAt,
    getMeasureMode,
    getMeasureDragActive: () => measureDragActive,
    setMeasureDragActive: (on) => {
      measureDragActive = on;
    },
    getMeasureOverlay: () => measureOverlay,
    setMeasureOverlay,
    getFreehandDrawing: () => freehandDrawing,
    startFreehand,
    appendFreehandPoint,
    finishFreehand,
    getValuesTooltipOnLongPress,
    scheduleLongPress,
    cancelLongPressIfMoved,
    clearLongPress,
    hideValuesTooltip,
    updateCursorMark,
    hideCursorMark,
    emitEditText: (drawing) => listeners.editText.forEach((fn) => fn(drawing)),
    emitChange: () => emit("change"),
    setDraggingDrawing,
    updateDrawing,
    queuePendingDrag: (state) => drag.queuePendingDrag(state),
    tryActivateDrag: (x, y) => drag.tryActivateDrag(x, y),
    applyDrawingDrag: (x, y) => drag.applyDrawingDrag(x, y),
    finishPointerDrag: () => drag.finishPointerDrag(),
    tryAnchorDrag: (ev, px, py) => drag.tryAnchorDrag(ev, px, py),
    isPrimaryButtonDown: (ev) => drag.isPrimaryButtonDown(ev),
    isDragging: () => drag.isDragging(),
    hasActiveDrag: () => drag.hasActiveDrag(),
  };

  drag = createDrawingDrag({
    getDrawings: () => drawings,
    updateDrawing,
    resolvePoint,
    syncChartPointerHandling,
    emitChange: () => emit("change"),
    setDraggingDrawing,
    clearLongPress,
    hideValuesTooltip,
    selectDrawing,
    setActiveTool,
    isCursorTool,
    swallowChartPointer,
    findAnchorHit,
    setRegressionGuideDrawingId: (id) => primitive.setRegressionGuideDrawingId(id),
    getContext,
  });

  ({ bindChartListeners, unbindChartListeners } = createPointerHandlers(pointerApi));

  function onKeyDown(ev) {
    if (ev.key === "Escape") {
      if (isMultiPointTool(activeTool) && placementStaged.length >= 2) {
        finishMultiPointPlacement();
        hideValuesTooltip();
        drag.forceEnd();
        syncChartPointerHandling();
        return;
      }
      resetPlacement();
      setMeasureOverlay(null);
      measureDragActive = false;
      hideValuesTooltip();
      drag.forceEnd();
      if (!isCursorTool(activeTool) && !measureMode && !isMultiPointTool(activeTool)) setActiveTool("cursor");
      else if (isCursorTool(activeTool)) selectDrawing(null);
      syncChartPointerHandling();
    }
    if (ev.key === "Enter" && isMultiPointTool(activeTool)) {
      finishMultiPointPlacement();
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && drawings.length) {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      ev.preventDefault();
      removeDrawings({ includeLocked: getAlwaysRemoveLocked() });
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c") {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (copySelectedDrawing()) ev.preventDefault();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      ev.preventDefault();
      if (!pasteDrawing()) void pasteDrawingFromSystemClipboard();
    }
  }

  /**
   * @param {{ chart: import("lightweight-charts").IChartApi, series: import("lightweight-charts").ISeriesApi, container: HTMLElement, getContext?: () => object }} next
   */
  function setTarget(next) {
    if (next.chart === chart && next.container === container) return;
    drag.forceEnd();
    unbindChartListeners();
    series.detachPrimitive(primitive);

    chart = next.chart;
    series = next.series;
    container = next.container;
    if (next.getContext) getContext = next.getContext;

    const nextOverlay =
      container.closest(".tv-chart-wrap__stage") ?? container.closest(".tv-chart-wrap") ?? container;
    if (nextOverlay !== overlayRoot) {
      nextOverlay.appendChild(cursorMark);
      nextOverlay.appendChild(valuesTooltip);
      overlayRoot = nextOverlay;
    }

    pointerApi.container = container;
    pointerApi.overlayRoot = overlayRoot;
    pointerApi.chart = chart;

    series.attachPrimitive(primitive);
    bindChartListeners();
    syncChartPointerHandling();
    primitive.setDrawings(drawings);
  }

  bindChartListeners();
  document.addEventListener("keydown", onKeyDown);
  const onWindowBlur = () => drag.finishPointerDrag();
  window.addEventListener("blur", onWindowBlur);

  return {
    setActiveTool,
    getActiveTool: () => activeTool,
    isCursorTool,
    getToolLabel: () => TOOL_LABELS[activeTool] ?? activeTool,
    setValuesTooltipOnLongPress,
    getValuesTooltipOnLongPress,
    getDrawings: () => drawings,
    getCount: () => drawings.length,
    getLockedCount,
    getIndicatorCount,
    setMagnetMode,
    getMagnetMode,
    setMeasureMode,
    getMeasureMode,
    setDrawingsHidden,
    getDrawingsHidden,
    setHideAll,
    getHideAll,
    setLockAllDrawings,
    getLockAllDrawings,
    setAlwaysRemoveLocked,
    getAlwaysRemoveLocked,
    removeDrawings,
    getSelectedId: () => selectedId,
    getSelectedDrawing,
    selectDrawing,
    updateDrawing,
    removeDrawingById,
    replaceDrawings,
    getDrawingScreenAnchor,
    isDraggingDrawing: () => isDraggingDrawing,
    clearAll,
    copySelectedDrawing,
    hasDrawingClipboard,
    pasteDrawing,
    pasteDrawingFromSystemClipboard,
    setTarget,
    on(event, fn) {
      listeners[event]?.add(fn);
      return () => listeners[event]?.delete(fn);
    },
    destroy() {
      drag.forceEnd();
      unbindChartListeners();
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
      });
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onWindowBlur);
      series.detachPrimitive(primitive);
      cursorMark.remove();
      valuesTooltip.remove();
    },
  };
}

export { CURSOR_TOOLS };
