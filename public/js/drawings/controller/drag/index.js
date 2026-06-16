import { DRAWING_DRAG_ACTIVATION_PX } from "../../constants.js";

const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");
import {
  chartAngleFromPoints,
  translateTrendAnglePoints,
} from "../../tools/line/trendAngle.js";
import {
  parallelChannelAnchorPoints,
  parallelChannelDragUpdate,
  parallelChannelPointsFromGeometry,
  resolvePriceOffset,
} from "../../tools/channel/parallel.js";
import {
  flatTopBottomDragUpdate,
  flatTopBottomPointsFromGeometry,
  resolveFlatPrice,
} from "../../tools/channel/flatTopBottom.js";
import { disjointChannelDragUpdate } from "../../tools/channel/disjoint.js";
import { isRegressionTrendTool, regressionTrendDragUpdate, regressionTrendMedianAnchorIndices, clampRegressionPoint } from "../../tools/regression/trend.js";
import { isPositionTool, positionDragUpdate, positionAnchorPoints, positionGeometry } from "../../tools/position/barrel.js";

/**
 * @typedef {import("../../types.js").DrawPoint} DrawPoint
 * @typedef {import("../../types.js").UserDrawing} UserDrawing
 */

/**
 * @param {object} api
 * @param {() => UserDrawing[]} api.getDrawings
 * @param {(id: string, patch: object, opts?: { silent?: boolean }) => void} api.updateDrawing
 * @param {(clientX: number, clientY: number) => DrawPoint | null} api.resolvePoint
 * @param {() => void} api.syncChartPointerHandling
 * @param {() => void} api.emitChange
 * @param {(active: boolean) => void} api.setDraggingDrawing
 * @param {() => void} api.clearLongPress
 * @param {() => void} api.hideValuesTooltip
 * @param {(id: string | null) => void} api.selectDrawing
 * @param {(tool: string) => void} api.setActiveTool
 * @param {() => boolean} api.isCursorTool
 * @param {(ev: Event) => void} api.swallowChartPointer
 * @param {(px: number, py: number) => { drawing: UserDrawing, pointIndex: number } | null} api.findAnchorHit
 * @param {(id: string | null) => void} api.setRegressionGuideDrawingId
 * @param {() => HTMLElement} api.getContainer
 * @param {() => { bars?: { time: number }[] }} [api.getContext]
 * @param {() => void} [api.recordHistorySnapshot]
 */
export function createDrawingDrag(api) {
  /** @type {import("./index.js").DragState | null} */
  let dragState = null;
  /** @type {import("./index.js").PendingDrag | null} */
  let pendingDrag = null;
  let documentDragListenersBound = false;
  let pointerSessionActive = false;
  /** @type {number | null} */
  let activePointerId = null;

  function dragActivationPx() {
    return COARSE_POINTER_MQ.matches ? 8 : DRAWING_DRAG_ACTIVATION_PX;
  }

  /** @param {MouseEvent | PointerEvent} ev */
  function beginPointerSession(ev) {
    pointerSessionActive = true;
    activePointerId = ev.pointerId ?? null;
    const el = api.getContainer?.();
    if (el && ev.pointerId != null && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  /** @param {MouseEvent | PointerEvent | undefined} [ev] */
  function endPointerSession(ev) {
    if (ev?.pointerId != null && activePointerId != null && ev.pointerId !== activePointerId) return;
    const releaseId = ev?.pointerId ?? activePointerId;
    pointerSessionActive = false;
    activePointerId = null;
    const el = api.getContainer?.();
    if (el && releaseId != null && typeof el.releasePointerCapture === "function") {
      try {
        el.releasePointerCapture(releaseId);
      } catch {
        /* ignore */
      }
    }
  }

  /** @param {MouseEvent | PointerEvent} ev */
  function onDocumentPointerMove(ev) {
    if (dragState || pendingDrag) {
      if (COARSE_POINTER_MQ.matches) ev.preventDefault();
    }
    if ((pendingDrag || dragState) && !isPrimaryButtonDown(ev)) {
      finishPointerDrag(ev);
      return;
    }
    tryActivateDrag(ev.clientX, ev.clientY);
    if (dragState && isPrimaryButtonDown(ev)) {
      applyDrawingDrag(ev.clientX, ev.clientY);
    }
  }

  /** @param {MouseEvent | PointerEvent} ev */
  function onDocumentPointerUp(ev) {
    finishPointerDrag(ev);
    api.clearLongPress();
    api.hideValuesTooltip();
  }

  function bindDocumentDragListeners() {
    if (documentDragListenersBound) return;
    documentDragListenersBound = true;
    document.addEventListener("mousemove", onDocumentPointerMove);
    document.addEventListener("mouseup", onDocumentPointerUp);
    document.addEventListener("pointermove", onDocumentPointerMove);
    document.addEventListener("pointerup", onDocumentPointerUp);
    document.addEventListener("pointercancel", onDocumentPointerUp);
  }

  function unbindDocumentDragListeners() {
    if (!documentDragListenersBound) return;
    documentDragListenersBound = false;
    document.removeEventListener("mousemove", onDocumentPointerMove);
    document.removeEventListener("mouseup", onDocumentPointerUp);
    document.removeEventListener("pointermove", onDocumentPointerMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
    document.removeEventListener("pointercancel", onDocumentPointerUp);
  }

  /** @param {MouseEvent | PointerEvent} ev */
  function isPrimaryButtonDown(ev) {
    if (pointerSessionActive) {
      if (activePointerId == null || ev.pointerId == null || ev.pointerId === activePointerId) {
        return true;
      }
      return false;
    }
    if (typeof ev.buttons === "number") return (ev.buttons & 1) !== 0;
    return true;
  }

  /** @param {MouseEvent | PointerEvent | undefined} [ev] */
  function finishPointerDrag(ev) {
    if (dragState) {
      endDrawingDrag();
      api.emitChange();
    }
    clearPendingDrag();
    endPointerSession(ev);
  }

  function endDrawingDrag() {
    if (!dragState) return;
    if (dragState.regressionGuide) api.setRegressionGuideDrawingId(null);
    dragState = null;
    api.setDraggingDrawing(false);
    if (!pendingDrag) unbindDocumentDragListeners();
    api.syncChartPointerHandling();
  }

  function clearPendingDrag() {
    if (pendingDrag?.regressionGuide) api.setRegressionGuideDrawingId(null);
    pendingDrag = null;
    if (!dragState) unbindDocumentDragListeners();
    api.syncChartPointerHandling();
  }

  function startDrawingDrag(state) {
    api.recordHistorySnapshot?.();
    dragState = state;
    api.setDraggingDrawing(true);
    bindDocumentDragListeners();
    api.clearLongPress();
    api.hideValuesTooltip();
    api.syncChartPointerHandling();
  }

  function tryActivateDrag(clientX, clientY) {
    if (!pendingDrag || dragState) return;
    const moved = Math.hypot(clientX - pendingDrag.startClientX, clientY - pendingDrag.startClientY);
    if (moved < dragActivationPx()) return;
    const { startClientX: _x, startClientY: _y, ...state } = pendingDrag;
    pendingDrag = null;
    startDrawingDrag(state);
    applyDrawingDrag(clientX, clientY);
  }

  function queuePendingDrag(state) {
    pendingDrag = state;
    bindDocumentDragListeners();
    api.syncChartPointerHandling();
  }

  function applyDrawingDrag(clientX, clientY) {
    if (!dragState) return;
    const point = api.resolvePoint(clientX, clientY);
    if (!point) return;
    const drawings = api.getDrawings();

    if (dragState.mode === "point" && dragState.pointIndex != null) {
      const drawing = drawings.find((d) => d.id === dragState.drawingId);
      if (drawing?.type === "trend-angle" && dragState.startPoints.length >= 2) {
        if (dragState.pointIndex === 0) {
          const dt = point.time - dragState.startPoints[0].time;
          const dp = point.price - dragState.startPoints[0].price;
          const next = translateTrendAnglePoints(dragState.startPoints, dt, dp);
          api.updateDrawing(
            dragState.drawingId,
            { points: next, angle: chartAngleFromPoints(next[0], next[1]) },
            { silent: true },
          );
          return;
        }
        if (dragState.pointIndex === 1) {
          const next = dragState.startPoints.map((p, i) =>
            i === 1 ? { time: point.time, price: point.price } : { ...p },
          );
          api.updateDrawing(
            dragState.drawingId,
            { points: next, angle: chartAngleFromPoints(next[0], next[1]) },
            { silent: true },
          );
          return;
        }
      }
      if (drawing?.type === "parallel-channel" && dragState.startPoints.length >= 2) {
        const p0 = dragState.startPoints[0];
        const p1 = dragState.startPoints[1];
        const startOffset = dragState.startPriceOffset ?? resolvePriceOffset(drawing);
        const patch = parallelChannelDragUpdate(
          dragState.pointIndex ?? 0,
          p0,
          p1,
          startOffset,
          point,
          dragState.startMid ?? null,
        );
        api.updateDrawing(dragState.drawingId, patch, { silent: true });
        return;
      }
      if (drawing?.type === "flat-top-bottom" && dragState.startPoints.length >= 2) {
        const p0 = dragState.startPoints[0];
        const p1 = dragState.startPoints[1];
        const startFlatPrice = dragState.startFlatPrice ?? resolveFlatPrice(drawing);
        const patch = flatTopBottomDragUpdate(
          dragState.pointIndex ?? 0,
          p0,
          p1,
          startFlatPrice,
          point,
        );
        api.updateDrawing(dragState.drawingId, patch, { silent: true });
        return;
      }
      if (drawing?.type === "disjoint-channel" && dragState.startPoints.length >= 4) {
        const patch = disjointChannelDragUpdate(
          dragState.pointIndex ?? 0,
          dragState.startPoints,
          point,
        );
        api.updateDrawing(dragState.drawingId, patch, { silent: true });
        return;
      }

      if (isRegressionTrendTool(drawing?.type ?? "") && dragState.startPoints.length >= 2) {
        const edge = dragState.regressionEdge ?? "left";
        const bars = api.getContext?.().bars ?? [];
        const barSec = api.getContext?.().barSec ?? 60;
        const clamped = clampRegressionPoint(point, bars, barSec);
        if (!clamped) return;
        const { points, regressionPriceOffset } = regressionTrendDragUpdate(
          edge,
          dragState.startPoints,
          dragState.startRegressionPriceOffset ?? 0,
          clamped,
          bars,
          barSec,
        );
        api.updateDrawing(dragState.drawingId, { points, regressionPriceOffset }, { silent: true });
        return;
      }
      if (isPositionTool(drawing?.type ?? "") && dragState.startPoints.length >= 2) {
        const precision = api.getContext?.().precision ?? 2;
        const patch = positionDragUpdate(
          dragState.pointIndex ?? 0,
          dragState.startPoints,
          point,
          drawing,
          precision,
        );
        api.updateDrawing(dragState.drawingId, patch, { silent: true });
        return;
      }
      const next = dragState.startPoints.map((p, i) =>
        i === dragState.pointIndex ? { time: point.time, price: point.price } : { ...p },
      );
      api.updateDrawing(dragState.drawingId, { points: next }, { silent: true });
      return;
    }

    const dt = point.time - dragState.originPoint.time;
    const dp = point.price - dragState.originPoint.price;
    const drawing = drawings.find((d) => d.id === dragState.drawingId);
    if (drawing?.type === "parallel-channel" && dragState.startPoints.length >= 2) {
      const offset = dragState.startPriceOffset ?? resolvePriceOffset(drawing);
      const p0 = dragState.startPoints[0];
      const p1 = dragState.startPoints[1];
      const newP0 = { time: p0.time + dt, price: p0.price + dp };
      const newP1 = { time: p1.time + dt, price: p1.price + dp };
      api.updateDrawing(
        dragState.drawingId,
        { points: parallelChannelPointsFromGeometry(newP0, newP1, offset), priceOffset: offset },
        { silent: true },
      );
      return;
    }
    if (drawing?.type === "flat-top-bottom" && dragState.startPoints.length >= 2) {
      const flatPrice = (dragState.startFlatPrice ?? resolveFlatPrice(drawing)) + dp;
      const p0 = dragState.startPoints[0];
      const p1 = dragState.startPoints[1];
      const newP0 = { time: p0.time + dt, price: p0.price + dp };
      const newP1 = { time: p1.time + dt, price: p1.price + dp };
      api.updateDrawing(
        dragState.drawingId,
        { points: flatTopBottomPointsFromGeometry(newP0, newP1, flatPrice), flatPrice },
        { silent: true },
      );
      return;
    }
    if (isPositionTool(drawing?.type ?? "") && dragState.startPoints.length >= 2) {
      const startEntry = dragState.startEntryPrice;
      const entryPrice =
        startEntry != null && Number.isFinite(Number(startEntry)) ? Number(startEntry) + dp : undefined;
      api.updateDrawing(
        dragState.drawingId,
        {
          points: dragState.startPoints.map((p) => ({
            time: p.time + dt,
            price: p.price + dp,
          })),
          ...(entryPrice != null ? { positionEntryPrice: entryPrice } : {}),
        },
        { silent: true },
      );
      return;
    }

    api.updateDrawing(
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

  /** @param {MouseEvent | PointerEvent} ev @param {{ drawing: UserDrawing, pointIndex: number }} anchorHit */
  function beginAnchorPointDrag(ev, anchorHit) {
    const originPoint = api.resolvePoint(ev.clientX, ev.clientY);
    if (!originPoint) return false;
    beginPointerSession(ev);
    api.selectDrawing(anchorHit.drawing.id);
    const drawing = anchorHit.drawing;
    const regressionGuide = isRegressionTrendTool(drawing.type);
    if (regressionGuide) api.setRegressionGuideDrawingId(drawing.id);
    const bars = api.getContext?.().bars ?? [];
    const [midLeft] = regressionTrendMedianAnchorIndices(drawing, bars);
    const regressionEdge = anchorHit.pointIndex === midLeft ? "left" : "right";
    const startRegressionPriceOffset = Number(drawing.regressionPriceOffset) || 0;
    const p0 = drawing.points[0];
    const p1 = drawing.points[1];
    const startPriceOffset = resolvePriceOffset(drawing);
    const startFlatPrice = resolveFlatPrice(drawing);
    const startMid =
      drawing.type === "parallel-channel" && p0 && p1
        ? parallelChannelAnchorPoints(drawing)[4]
        : undefined;
    startDrawingDrag({
      mode: "point",
      drawingId: drawing.id,
      pointIndex: anchorHit.pointIndex,
      startPoints:
        isPositionTool(drawing.type)
          ? positionAnchorPoints(drawing).map((p) => ({ ...p }))
          : drawing.type === "parallel-channel" && p0 && p1
          ? [p0, p1].map((p) => ({ ...p }))
          : drawing.type === "flat-top-bottom" && p0 && p1
            ? [p0, p1].map((p) => ({ ...p }))
            : drawing.points.map((p) => ({ ...p })),
      originPoint,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startEntryPrice: isPositionTool(drawing.type)
        ? (Number(drawing.positionEntryPrice) || positionGeometry(drawing)?.entryPrice)
        : undefined,
      regressionGuide,
      regressionEdge: regressionGuide ? regressionEdge : undefined,
      startRegressionPriceOffset: regressionGuide ? startRegressionPriceOffset : undefined,
      startPriceOffset: drawing.type === "parallel-channel" ? startPriceOffset : undefined,
      startFlatPrice: drawing.type === "flat-top-bottom" ? startFlatPrice : undefined,
      startMid,
    });
    applyDrawingDrag(ev.clientX, ev.clientY);
    return true;
  }

  /** @param {MouseEvent | PointerEvent} ev @param {number} px @param {number} py */
  function tryAnchorDrag(ev, px, py) {
    const anchorHit = api.findAnchorHit(px, py);
    if (!anchorHit || anchorHit.drawing.locked) return false;
    if (!api.isCursorTool()) api.setActiveTool("cursor");
    api.swallowChartPointer(ev);
    return beginAnchorPointDrag(ev, anchorHit);
  }

  function isDragging() {
    return dragState != null || pendingDrag != null;
  }

  function hasActiveDrag() {
    return dragState != null;
  }

  function forceEnd() {
    endDrawingDrag();
    clearPendingDrag();
    endPointerSession();
  }

  return {
    applyDrawingDrag,
    startDrawingDrag,
    queuePendingDrag,
    tryActivateDrag,
    finishPointerDrag,
    endDrawingDrag,
    clearPendingDrag,
    tryAnchorDrag,
    beginPointerSession,
    endPointerSession,
    isPrimaryButtonDown,
    isDragging,
    hasActiveDrag,
    forceEnd,
  };
}
