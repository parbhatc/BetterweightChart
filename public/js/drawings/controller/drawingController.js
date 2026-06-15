import { UserDrawingsPrimitive } from "../primitives/userDrawingsPrimitive.js";
import { chartXAt, chartVisibleRightX, pixelToPoint, safePriceToY } from "../../chart/timeScaleCoords.js";
import { TOOL_LABELS } from "../catalog/toolCatalog.js";
import {
  DRAWING_UI_SELECTOR,
  DRAWING_DRAG_ACTIVATION_PX,
} from "../constants.js";
import { findDrawingAt, hitDrawingAnchor } from "./hitTesting.js";
import {
  extractStyleDefaults,
  isStylePatch,
  newDrawingStyleDefaults,
  saveToolDefaults,
} from "../toolbars/drawingDefaultsStore.js";
import { CURSOR_TOOLS, isCursorTool as isCursorToolType, isOnePointTool, isFreehandTool, isMultiPointTool, pointCountForTool } from "../registry/toolRegistry.js";
import { applyMagnetSnap } from "../geometry/magnetSnap.js";
import { loadAlwaysRemoveLocked, saveAlwaysRemoveLocked } from "../toolbars/utilitySettingsStore.js";
import { shouldShowLockedRemoveConfirm, showRemoveLockedConfirmDialog } from "../ui/removeConfirmDialog.js";
import { newDrawing } from "./lib/drawingFactory.js";
import { createTooltipOverlay } from "./lib/tooltipOverlay.js";


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
  let magnetMode = "weak";
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
  let preview = null;
  /** @type {string | null} */
  let selectedId = null;
  /** @type {{
   *   mode: "move" | "point",
   *   drawingId: string,
   *   pointIndex?: number,
   *   startPoints: import("../types.js").DrawPoint[],
   *   originPoint: import("../types.js").DrawPoint,
   * } | null} */
  let dragState = null;
  /** @type {{
   *   mode: "move" | "point",
   *   drawingId: string,
   *   pointIndex?: number,
   *   startPoints: import("../types.js").DrawPoint[],
   *   originPoint: import("../types.js").DrawPoint,
   *   startClientX: number,
   *   startClientY: number,
   * } | null} */
  let pendingDrag = null;
  let isDraggingDrawing = false;

  function shouldBlockChartPan() {
    return (
      measureDragActive ||
      freehandDrawing ||
      (!isCursorTool(activeTool) && activeTool !== "eraser") ||
      placementStaged.length > 0 ||
      preview != null ||
      pendingDrag != null ||
      dragState != null
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

  function emit(type) {
    listeners[type].forEach((fn) => fn());
  }

  function setDraggingDrawing(active) {
    if (isDraggingDrawing === active) return;
    isDraggingDrawing = active;
    emit("dragChange");
  }

  function bindDocumentDragListeners() {
    document.addEventListener("mousemove", onDocumentPointerMove);
    document.addEventListener("mouseup", onDocumentPointerUp);
    document.addEventListener("pointermove", onDocumentPointerMove);
    document.addEventListener("pointerup", onDocumentPointerUp);
    document.addEventListener("pointercancel", onDocumentPointerUp);
  }

  function unbindDocumentDragListeners() {
    document.removeEventListener("mousemove", onDocumentPointerMove);
    document.removeEventListener("mouseup", onDocumentPointerUp);
    document.removeEventListener("pointermove", onDocumentPointerMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
    document.removeEventListener("pointercancel", onDocumentPointerUp);
  }

  /** @param {MouseEvent | PointerEvent} ev */
  function isPrimaryButtonDown(ev) {
    if (typeof ev.buttons === "number") return (ev.buttons & 1) !== 0;
    return true;
  }

  function finishPointerDrag() {
    if (dragState) {
      endDrawingDrag();
      emit("change");
    }
    clearPendingDrag();
  }

  function endDrawingDrag() {
    if (!dragState) return;
    dragState = null;
    setDraggingDrawing(false);
    syncChartPointerHandling();
  }

  function clearPendingDrag() {
    pendingDrag = null;
    unbindDocumentDragListeners();
    syncChartPointerHandling();
  }

  function startDrawingDrag(state) {
    dragState = state;
    setDraggingDrawing(true);
    clearLongPress();
    hideValuesTooltip();
    syncChartPointerHandling();
  }

  function tryActivateDrag(clientX, clientY) {
    if (!pendingDrag || dragState) return;
    const moved = Math.hypot(clientX - pendingDrag.startClientX, clientY - pendingDrag.startClientY);
    if (moved < DRAWING_DRAG_ACTIVATION_PX) return;
    const { startClientX: _x, startClientY: _y, ...state } = pendingDrag;
    pendingDrag = null;
    startDrawingDrag(state);
    applyDrawingDrag(clientX, clientY);
  }

  function queuePendingDrag(state) {
    pendingDrag = state;
    bindDocumentDragListeners();
    syncChartPointerHandling();
  }

  function applyDrawingDrag(clientX, clientY) {
    if (!dragState) return;
    const point = resolvePoint(clientX, clientY);
    if (!point) return;

    if (dragState.mode === "point" && dragState.pointIndex != null) {
      const next = dragState.startPoints.map((p, i) =>
        i === dragState.pointIndex ? { time: point.time, price: point.price } : { ...p },
      );
      updateDrawing(dragState.drawingId, { points: next }, { silent: true });
      return;
    }

    const dt = point.time - dragState.originPoint.time;
    const dp = point.price - dragState.originPoint.price;
    updateDrawing(
      dragState.drawingId,
      {
        points: dragState.startPoints.map((p) => ({
          time: p.time + dt,
          price: p.price + dp,
        })),
      },
      { silent: true },
    );
  }

  function findAnchorHit(px, py) {
    const selected = getSelectedDrawing();
    if (selected && !selected.locked) {
      const anchorIdx = hitDrawingAnchor(selected, px, py, drawingCoords);
      if (anchorIdx >= 0) return { drawing: selected, pointIndex: anchorIdx };
    }

    for (let i = drawings.length - 1; i >= 0; i -= 1) {
      const drawing = drawings[i];
      if (drawing.locked) continue;
      const anchorIdx = hitDrawingAnchor(drawing, px, py, drawingCoords);
      if (anchorIdx >= 0) return { drawing, pointIndex: anchorIdx };
    }
    return null;
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
    selectedId = id;
    primitive.setSelectedId(id);
    emit("selectionChange");
  }

  function commitDrawing(drawing) {
    saveToolDefaults(drawing.type, extractStyleDefaults(drawing));
    drawings = [...drawings, drawing];
    syncDrawingsToPrimitive();
    emit("change");
    if (!isCursorTool(activeTool) && !measureMode) setActiveTool("cursor");
    selectDrawing(drawing.id);
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
    const lockedCount = drawings.filter((d) => d.locked).length;
    const removable = includeLocked ? drawings : drawings.filter((d) => !d.locked);
    if (!removable.length) return;

    const doRemove = () => {
      if (includeLocked) {
        drawings = [];
      } else {
        drawings = drawings.filter((d) => !d.locked);
      }
      selectDrawing(null);
      syncDrawingsToPrimitive();
      emit("change");
    };

    if (!includeLocked && lockedCount > 0 && drawings.length > removable.length) {
      if (loadAlwaysRemoveLocked()) {
        doRemove();
        return;
      }
      if (shouldShowLockedRemoveConfirm()) {
        showRemoveLockedConfirmDialog({
          onYes: () => {
            drawings = [];
            selectDrawing(null);
            syncDrawingsToPrimitive();
            emit("change");
          },
          onNo: doRemove,
        });
        return;
      }
    }

    doRemove();
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
    const point = pixelToPoint(chart, series, bars, barSec, x, y);
    if (!point) return null;
    return applyMagnetSnap(point, magnetMode, bars);
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
    const ts = chart.timeScale();
    const timeToX = (t) => chartXAt(ts, bars, barSec, undefined, t);
    const priceToY = (p) => safePriceToY(series, p);
    const right = chartVisibleRightX(ts) ?? 0;
    const bottom = container.clientHeight || 400;

    const pts = drawing.points.map((p) => {
      const x = timeToX(p.time);
      const y = priceToY(p.price);
      if (x == null || y == null) return null;
      return { x, y };
    });

    return { pts, right, bottom, timeToX, priceToY };
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
   * Replace all drawings (used for multi-pane sync).
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
    drawings = drawings.map((d) => (d.id === id ? { ...d, ...patch } : d));
    const updated = drawings.find((d) => d.id === id);
    if (updated && isStylePatch(patch)) {
      saveToolDefaults(updated.type, extractStyleDefaults(updated));
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

  function updateCursorMarkVisibility() {
    if (!["dot", "demonstration"].includes(activeTool)) {
      cursorMark.hidden = true;
    }
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (ev.target.closest(DRAWING_UI_SELECTOR)) return;

    const rect = container.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;

    const wantsMeasure = measureMode || (isCursorTool(activeTool) && ev.shiftKey);
    if (wantsMeasure) {
      const point = resolvePoint(ev.clientX, ev.clientY);
      if (!point) return;
      swallowChartPointer(ev);
      measureDragActive = true;
      setMeasureOverlay({ start: point, end: point });
      syncChartPointerHandling();
      return;
    }

    if (activeTool === "eraser") {
      const idx = findDrawingAtPointer(ev.clientX, ev.clientY);
      if (idx >= 0) {
        swallowChartPointer(ev);
        removeDrawingAt(idx);
      }
      return;
    }

    if (isCursorTool(activeTool) && activeTool !== "eraser") {
      const anchorHit = findAnchorHit(px, py);
      if (anchorHit) {
        swallowChartPointer(ev);
        selectDrawing(anchorHit.drawing.id);
        const originPoint = resolvePoint(ev.clientX, ev.clientY);
        if (originPoint) {
          queuePendingDrag({
            mode: "point",
            drawingId: anchorHit.drawing.id,
            pointIndex: anchorHit.pointIndex,
            startPoints: anchorHit.drawing.points.map((p) => ({ ...p })),
            originPoint,
            startClientX: ev.clientX,
            startClientY: ev.clientY,
          });
        }
        return;
      }

      const idx = findDrawingAtPointer(ev.clientX, ev.clientY);
      if (idx >= 0) {
        swallowChartPointer(ev);
        const drawing = drawings[idx];
        selectDrawing(drawing.id);
        if (!drawing.locked) {
          const originPoint = resolvePoint(ev.clientX, ev.clientY);
          if (originPoint) {
            queuePendingDrag({
              mode: "move",
              drawingId: drawing.id,
              startPoints: drawing.points.map((p) => ({ ...p })),
              originPoint,
              startClientX: ev.clientX,
              startClientY: ev.clientY,
            });
          }
        }
        return;
      }

      selectDrawing(null);
      if (valuesTooltipOnLongPress) scheduleLongPress(ev.clientX, ev.clientY);
      return;
    }

    const point = resolvePoint(ev.clientX, ev.clientY);
    if (!point) return;

    swallowChartPointer(ev);

    if (isFreehandTool(activeTool)) {
      freehandDrawing = true;
      freehandPoints = [point];
      freehandLastClient = { x: ev.clientX, y: ev.clientY };
      setPreview(newDrawing(activeTool, [point]));
      syncChartPointerHandling();
      return;
    }

    if (isOnePointTool(activeTool)) {
      commitDrawing(newDrawing(activeTool, [point]));
      return;
    }

    if (isMultiPointTool(activeTool)) {
      placementStaged.push(point);
      setPreview(newDrawing(activeTool, [...placementStaged]));
      return;
    }

    const need = pointCountForTool(activeTool);
    placementStaged.push(point);
    if (placementStaged.length < need) {
      const pts = [...placementStaged];
      while (pts.length < need) pts.push(point);
      setPreview(newDrawing(activeTool, pts));
      return;
    }

    commitDrawing(newDrawing(activeTool, [...placementStaged]));
    placementStaged = [];
    setPreview(null);
  }

  function onChartDoubleClick(ev) {
    if (ev.target.closest(DRAWING_UI_SELECTOR)) return;
    if (isMultiPointTool(activeTool)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      finishMultiPointPlacement();
      return;
    }
    if (!isCursorTool(activeTool)) return;
    const idx = findDrawingAtPointer(ev.clientX, ev.clientY);
    if (idx < 0) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const drawing = drawings[idx];
    selectDrawing(drawing.id);
    listeners.editText.forEach((fn) => fn(drawing));
  }

  function onDocumentPointerMove(ev) {
    if ((pendingDrag || dragState) && !isPrimaryButtonDown(ev)) {
      finishPointerDrag();
      return;
    }
    tryActivateDrag(ev.clientX, ev.clientY);
    if (dragState && isPrimaryButtonDown(ev)) {
      applyDrawingDrag(ev.clientX, ev.clientY);
    }
  }

  function onDocumentPointerUp() {
    finishPointerDrag();
    clearLongPress();
    hideValuesTooltip();
  }

  function onPointerMove(ev) {
    updateCursorMark(ev.clientX, ev.clientY);
    cancelLongPressIfMoved(ev.clientX, ev.clientY);

    if (measureDragActive && isPrimaryButtonDown(ev)) {
      const point = resolvePoint(ev.clientX, ev.clientY);
      if (point && measureOverlay) {
        setMeasureOverlay({ start: measureOverlay.start, end: point });
      }
      return;
    }

    if (freehandDrawing && isPrimaryButtonDown(ev)) {
      const point = resolvePoint(ev.clientX, ev.clientY);
      if (point) appendFreehandPoint(ev.clientX, ev.clientY, point);
      return;
    }

    if ((pendingDrag || dragState) && !isPrimaryButtonDown(ev)) {
      finishPointerDrag();
      return;
    }

    tryActivateDrag(ev.clientX, ev.clientY);

    if (dragState) {
      if (isPrimaryButtonDown(ev)) {
        applyDrawingDrag(ev.clientX, ev.clientY);
      }
      return;
    }

    if (!placementStaged.length || !preview) return;
    const point = resolvePoint(ev.clientX, ev.clientY);
    if (!point) return;
    if (isMultiPointTool(activeTool)) {
      setPreview({ ...preview, points: [...placementStaged, point] });
      return;
    }
    const need = pointCountForTool(activeTool);
    const pts = [...placementStaged, point];
    while (pts.length < need) pts.push(point);
    setPreview({ ...preview, points: pts });
  }

  function onPointerUp() {
    if (measureDragActive) {
      measureDragActive = false;
      setMeasureOverlay(null);
      syncChartPointerHandling();
    }
    if (freehandDrawing) {
      freehandDrawing = false;
      if (freehandPoints.length >= 2) {
        commitDrawing(newDrawing(activeTool, [...freehandPoints]));
      }
      freehandPoints = [];
      freehandLastClient = null;
      setPreview(null);
      syncChartPointerHandling();
    }
    finishPointerDrag();
    clearLongPress();
    hideValuesTooltip();
  }

  function onPointerLeave() {
    clearLongPress();
    hideValuesTooltip();
    if (["dot", "demonstration"].includes(activeTool)) {
      cursorMark.hidden = true;
    }
  }

  function onKeyDown(ev) {
    if (ev.key === "Escape") {
      resetPlacement();
      setMeasureOverlay(null);
      measureDragActive = false;
      hideValuesTooltip();
      endDrawingDrag();
      if (!isCursorTool(activeTool) && !measureMode) setActiveTool("cursor");
      else selectDrawing(null);
      syncChartPointerHandling();
    }
    if (ev.key === "Enter" && isMultiPointTool(activeTool)) {
      finishMultiPointPlacement();
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && drawings.length) {
      if (ev.target instanceof HTMLInputElement) return;
      drawings = drawings.slice(0, -1);
      primitive.setDrawings(drawings);
      emit("change");
    }
  }

  let lastChartPointerDownAt = 0;
  const onChartPointerDown = (ev) => {
    if (ev.button !== 0) return;
    if (ev.target.closest(DRAWING_UI_SELECTOR)) return;
    const now = ev.timeStamp;
    if (now - lastChartPointerDownAt < 40) return;
    lastChartPointerDownAt = now;
    onPointerDown(ev);
  };

  const onCrosshairMove = (param) => {
    if (!["dot", "demonstration"].includes(activeTool)) return;
    if (param?.point) updateCursorMark(0, 0, param.point);
    else cursorMark.hidden = true;
  };

  function bindChartListeners() {
    container.addEventListener("mousedown", onChartPointerDown, true);
    container.addEventListener("pointerdown", onChartPointerDown, true);
    container.addEventListener("dblclick", onChartDoubleClick, true);
    overlayRoot.addEventListener("mousemove", onPointerMove);
    container.addEventListener("mousemove", onPointerMove);
    container.addEventListener("mouseup", onPointerUp);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    overlayRoot.addEventListener("mouseleave", onPointerLeave);
    chart.subscribeCrosshairMove(onCrosshairMove);
  }

  function unbindChartListeners() {
    container.removeEventListener("mousedown", onChartPointerDown, true);
    container.removeEventListener("pointerdown", onChartPointerDown, true);
    container.removeEventListener("dblclick", onChartDoubleClick, true);
    overlayRoot.removeEventListener("mousemove", onPointerMove);
    container.removeEventListener("mousemove", onPointerMove);
    container.removeEventListener("mouseup", onPointerUp);
    container.removeEventListener("pointerup", onPointerUp);
    container.removeEventListener("pointercancel", onPointerUp);
    overlayRoot.removeEventListener("mouseleave", onPointerLeave);
    chart.unsubscribeCrosshairMove(onCrosshairMove);
  }

  /**
   * @param {{ chart: import("lightweight-charts").IChartApi, series: import("lightweight-charts").ISeriesApi, container: HTMLElement, getContext?: () => object }} next
   */
  function setTarget(next) {
    if (next.chart === chart && next.container === container) return;
    endDrawingDrag();
    clearPendingDrag();
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

    series.attachPrimitive(primitive);
    bindChartListeners();
    syncChartPointerHandling();
    primitive.setDrawings(drawings);
  }

  bindChartListeners();
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", finishPointerDrag);

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
    setTarget,
    on(event, fn) {
      listeners[event]?.add(fn);
      return () => listeners[event]?.delete(fn);
    },
    destroy() {
      endDrawingDrag();
      clearPendingDrag();
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
      window.removeEventListener("blur", finishPointerDrag);
      series.detachPrimitive(primitive);
      cursorMark.remove();
      valuesTooltip.remove();
    },
  };
}

export { CURSOR_TOOLS };
