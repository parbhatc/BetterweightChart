import { newDrawing, newPositionDrawing } from "../factory/index.js";
import {
  chartAngleFromPoints,
} from "../../tools/line/trendAngle.js";
import { isParallelChannelTool } from "../../tools/channel/parallel.js";
import { isFlatTopBottomTool } from "../../tools/channel/flatTopBottom.js";
import { isDisjointChannelTool } from "../../tools/channel/disjoint.js";
import { isRegressionTrendTool } from "../../tools/regression/trend.js";
import {
  isFreehandTool,
  isMultiPointTool,
  isOnePointTool,
  isPositionTool,
  isTrendAngleTool,
  pointCountForTool,
} from "../../registry/tools.js";
import { positionGeometry } from "../../tools/position/barrel.js";
import { debugPlacement } from "../../../debug/chart/drawings.js";
import {
  parallelChannelPointerDown,
  parallelChannelPointerMove,
} from "../placement/parallelChannel.js";
import {
  flatTopBottomPointerDown,
  flatTopBottomPointerMove,
} from "../placement/flatTopBottom.js";
import {
  disjointChannelPointerDown,
  disjointChannelPointerMove,
} from "../placement/disjointChannel.js";

/** @param {{ start: { time: number, price: number }, end: { time: number, price: number } } | null} overlay */
function isMeasureComplete(overlay) {
  if (!overlay?.start || !overlay?.end) return false;
  return overlay.start.time !== overlay.end.time || overlay.start.price !== overlay.end.price;
}

/** @param {import("../types.js").UserDrawing} drawing */
function positionMoveDragExtras(drawing) {
  if (!isPositionTool(drawing.type)) return {};
  const entry = Number(drawing.positionEntryPrice) || positionGeometry(drawing)?.entryPrice;
  return Number.isFinite(entry) ? { startEntryPrice: entry } : {};
}

/**
 * @param {object} api
 */
export function createPointerHandlers(api) {
  const MOBILE_TAP_SLOP_PX = 6;
  const MOBILE_SCROLL_CANCEL_PX = 32;
  const MOBILE_TAP_MAX_MS = 250;
  const MOBILE_FREEHAND_START_PX = 12;

  let pendingMobileTap = null;
  let mobileScrollGesture = false;
  /** @type {{ startClientX: number, startClientY: number, mediaX: number, mediaY: number } | null} */
  let crosshairScrollAnchor = null;

  function resetMobilePlacementGesture() {
    pendingMobileTap = null;
    mobileScrollGesture = false;
    crosshairScrollAnchor = null;
  }

  function beginCrosshairScrollAnchor(clientX, clientY) {
    const media = api.getDrawCrosshairMedia?.();
    if (!media || !api.shouldSyncDrawCrosshair?.()) return;
    crosshairScrollAnchor = {
      startClientX: clientX,
      startClientY: clientY,
      mediaX: media.x,
      mediaY: media.y,
    };
  }

  function applyMobileCrosshairScroll(clientX, clientY) {
    if (!crosshairScrollAnchor) return;
    api.applyCrosshairScrollDelta?.(
      clientX - crosshairScrollAnchor.startClientX,
      clientY - crosshairScrollAnchor.startClientY,
      crosshairScrollAnchor.mediaX,
      crosshairScrollAnchor.mediaY,
    );
  }

  function placeDrawPointAtCrosshair() {
    const media = api.getDrawCrosshairMedia?.();
    if (!media) return;
    const rect = api.container.getBoundingClientRect();
    placeDrawPointAt(rect.left + media.x, rect.top + media.y);
  }

  function resolvePlacementPreviewPoint(clientX, clientY) {
    if (api.useMobileDragPlacement?.()) {
      const media = api.getDrawCrosshairMedia?.();
      if (media) {
        const rect = api.container.getBoundingClientRect();
        return api.resolvePoint(rect.left + media.x, rect.top + media.y);
      }
    }
    return api.resolvePoint(clientX, clientY);
  }

  function shouldSwallowDrawMove(ev) {
    if (!api.isPrimaryButtonDown(ev)) return false;
    if (api.getMeasureDragActive() || api.getFreehandDrawing()) return true;
    if (api.hasActiveDrag() || api.isDragging()) return !api.isCursorTool();
    if (api.isCursorTool() || api.getActiveTool() === "eraser") return false;
    if (api.useMobileDragPlacement?.()) return true;
    return true;
  }

  /** @param {number} clientX @param {number} clientY */
  function placeDrawPointAt(clientX, clientY) {
    const point = api.resolvePoint(clientX, clientY);
    if (!point) return;

    const activeTool = api.getActiveTool();
    const placementStaged = api.getPlacementStaged();
    debugPlacement("click", point, activeTool, { staged: placementStaged.length });

    if (isRegressionTrendTool(activeTool)) {
      const regPoint = api.resolveRegressionPoint(clientX, clientY);
      if (!regPoint) return;
      if (placementStaged.length === 0) {
        placementStaged.push(regPoint);
        api.setPreview(newDrawing(activeTool, [regPoint]));
        api.syncChartPointerHandling();
        return;
      }
      api.commitDrawing(newDrawing(activeTool, [placementStaged[0], regPoint]));
      return;
    }

    if (isFreehandTool(activeTool)) {
      api.startFreehand(point, clientX, clientY);
      return;
    }

    if (isTrendAngleTool(activeTool)) {
      if (placementStaged.length === 0) {
        placementStaged.push(point);
        debugPlacement("staged", point, activeTool, { step: 1, need: 2 });
        api.setPreview({ ...newDrawing(activeTool, [point]), angle: 0 });
        api.syncChartPointerHandling();
        return;
      }
      const anchor = placementStaged[0];
      const angle = chartAngleFromPoints(anchor, point);
      api.commitDrawing({ ...newDrawing(activeTool, [anchor, point]), angle });
      return;
    }

    if (isParallelChannelTool(activeTool)) {
      const result = parallelChannelPointerDown(placementStaged, point, activeTool);
      if (result.commit) {
        api.commitDrawing(result.commit);
        return;
      }
      if (result.preview) api.setPreview(result.preview);
      api.syncChartPointerHandling();
      return;
    }

    if (isFlatTopBottomTool(activeTool)) {
      const result = flatTopBottomPointerDown(placementStaged, point, activeTool);
      if (result.commit) {
        api.commitDrawing(result.commit);
        return;
      }
      if (result.preview) api.setPreview(result.preview);
      api.syncChartPointerHandling();
      return;
    }

    if (isDisjointChannelTool(activeTool)) {
      const result = disjointChannelPointerDown(placementStaged, point, activeTool);
      if (result.commit) {
        api.commitDrawing(result.commit);
        return;
      }
      if (result.preview) api.setPreview(result.preview);
      api.syncChartPointerHandling();
      return;
    }

    if (isPositionTool(activeTool)) {
      const ctx = api.getContext?.() ?? {};
      api.commitDrawing(
        newPositionDrawing(activeTool, point, {
          bars: ctx.bars,
          barSec: ctx.barSec,
          precision: ctx.precision,
          visiblePriceRange: ctx.visiblePriceRange,
          chart: ctx.chart,
          series: ctx.series,
        }),
      );
      return;
    }

    if (isOnePointTool(activeTool)) {
      api.commitDrawing(newDrawing(activeTool, [point]));
      return;
    }

    if (isMultiPointTool(activeTool)) {
      placementStaged.push(point);
      api.setPreview(newDrawing(activeTool, [...placementStaged]));
      return;
    }

    const need = pointCountForTool(activeTool);
    placementStaged.push(point);
    if (placementStaged.length < need) {
      debugPlacement("staged", point, activeTool, { step: placementStaged.length, need });
      const pts = [...placementStaged];
      while (pts.length < need) pts.push(point);
      api.setPreview(newDrawing(activeTool, pts));
      return;
    }

    debugPlacement("commit", point, activeTool, { points: placementStaged.length });
    api.commitDrawing(newDrawing(activeTool, [...placementStaged]));
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (ev.target.closest(api.DRAWING_UI_SELECTOR)) return;

    const rect = api.container.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;

    const existingMeasure = api.getMeasureOverlay();
    const wantsMeasure = api.getMeasureMode() || (api.isCursorTool() && ev.shiftKey);

    if (existingMeasure && isMeasureComplete(existingMeasure)) {
      api.setMeasureOverlay(null);
      api.syncChartPointerHandling();
      return;
    }

    if (existingMeasure && !wantsMeasure) {
      api.setMeasureOverlay(null);
      api.syncChartPointerHandling();
    }

    if (wantsMeasure) {
      const point = api.resolvePoint(ev.clientX, ev.clientY);
      if (!point) return;
      api.swallowChartPointer(ev);
      api.beginPointerSession(ev);
      api.setMeasureDragActive(true);
      api.setMeasureOverlay({ start: point, end: point });
      api.syncChartPointerHandling();
      return;
    }

    if (api.getActiveTool() === "eraser") {
      const idx = api.findDrawingAtPointer(ev.clientX, ev.clientY);
      if (idx >= 0) {
        api.swallowChartPointer(ev);
        api.removeDrawingAt(idx);
      }
      return;
    }

    if (api.tryAnchorDrag(ev, px, py)) return;

    if (api.isCursorTool() && api.getActiveTool() !== "eraser") {
      const statsHit = api.findStatsHit(px, py);
      if (statsHit) {
        api.swallowChartPointer(ev);
        api.selectDrawing(statsHit.id);
        api.beginPointerSession(ev);
        api.queuePendingDrag({
          mode: "move",
          drawingId: statsHit.id,
          startPoints: statsHit.points.map((p) => ({ ...p })),
          startClientX: ev.clientX,
          startClientY: ev.clientY,
          ...positionMoveDragExtras(statsHit),
        });
        return;
      }

      const idx = api.findDrawingAtPointer(ev.clientX, ev.clientY);
      if (idx >= 0) {
        api.swallowChartPointer(ev);
        const drawing = api.getDrawings()[idx];
        api.selectDrawing(drawing.id);
        if (!drawing.locked && drawing.type !== "regression-trend") {
          const p0 = drawing.points[0];
          const p1 = drawing.points[1];
          api.beginPointerSession(ev);
          api.queuePendingDrag({
            mode: "move",
            drawingId: drawing.id,
            startPoints:
              drawing.type === "parallel-channel" && p0 && p1
                ? [p0, p1].map((p) => ({ ...p }))
                : drawing.type === "flat-top-bottom" && p0 && p1
                  ? [p0, p1].map((p) => ({ ...p }))
                  : drawing.points.map((p) => ({ ...p })),
            startPriceOffset:
              drawing.type === "parallel-channel" ? api.resolvePriceOffset(drawing) : undefined,
            startFlatPrice:
              drawing.type === "flat-top-bottom" ? api.resolveFlatPrice(drawing) : undefined,
            startClientX: ev.clientX,
            startClientY: ev.clientY,
            ...positionMoveDragExtras(drawing),
          });
        }
        return;
      }

      api.selectDrawing(null);
      if (api.getValuesTooltipOnLongPress()) api.scheduleLongPress(ev.clientX, ev.clientY);
      return;
    }

    if (!api.isCursorTool()) {
      if (api.useMobileDragPlacement?.()) {
        api.swallowChartPointer(ev);
        beginCrosshairScrollAnchor(ev.clientX, ev.clientY);
        pendingMobileTap = {
          pointerId: ev.pointerId ?? null,
          startX: ev.clientX,
          startY: ev.clientY,
          startTime: performance.now(),
        };
        mobileScrollGesture = false;
        return;
      }

      api.swallowChartPointer(ev);
      api.beginPointerSession(ev);
    }

    const point = api.resolvePoint(ev.clientX, ev.clientY);
    if (!point) return;
    api.syncDrawCrosshair?.(ev.clientX, ev.clientY);
    placeDrawPointAt(ev.clientX, ev.clientY);
  }

  function onChartDoubleClick(ev) {
    if (ev.target.closest(api.DRAWING_UI_SELECTOR)) return;
    if (isMultiPointTool(api.getActiveTool())) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      api.finishMultiPointPlacement();
      return;
    }
    if (!api.isCursorTool()) return;
    const idx = api.findDrawingAtPointer(ev.clientX, ev.clientY);
    if (idx < 0) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const drawing = api.getDrawings()[idx];
    api.selectDrawing(drawing.id);
    api.emitEditText(drawing);
  }

  function onPointerMove(ev) {
    if (api.isValuesTooltipPinned?.()) {
      api.updateValuesTooltipAt(ev.clientX, ev.clientY);
      return;
    }

    if (pendingMobileTap && api.isPrimaryButtonDown(ev)) {
      const dx = ev.clientX - pendingMobileTap.startX;
      const dy = ev.clientY - pendingMobileTap.startY;
      const dist = Math.hypot(dx, dy);
      const activeTool = api.getActiveTool();

      if (
        dist >= MOBILE_TAP_SLOP_PX &&
        !isFreehandTool(activeTool) &&
        api.shouldSyncDrawCrosshair?.()
      ) {
        applyMobileCrosshairScroll(ev.clientX, ev.clientY);
      }

      if (isFreehandTool(activeTool)) {
        if (dist >= MOBILE_FREEHAND_START_PX) {
          const point = api.resolvePoint(ev.clientX, ev.clientY);
          if (point) {
            pendingMobileTap = null;
            api.swallowChartPointer(ev);
            api.beginPointerSession(ev);
            api.startFreehand(point, ev.clientX, ev.clientY, ev);
          }
        } else if (dist >= MOBILE_SCROLL_CANCEL_PX) {
          pendingMobileTap = null;
          mobileScrollGesture = true;
        }
      } else if (dist >= MOBILE_SCROLL_CANCEL_PX) {
        pendingMobileTap = null;
        mobileScrollGesture = true;
      }
    }

    if (shouldSwallowDrawMove(ev)) {
      api.swallowChartPointer(ev);
    }
    if (
      api.shouldSyncDrawCrosshair?.() &&
      api.useMobileDragPlacement?.() &&
      api.isPrimaryButtonDown(ev) &&
      mobileScrollGesture
    ) {
      applyMobileCrosshairScroll(ev.clientX, ev.clientY);
    } else if (api.shouldSyncDrawCrosshair?.() && !api.useMobileDragPlacement?.()) {
      api.syncDrawCrosshair(ev.clientX, ev.clientY);
    }
    api.updateCursorMark(ev.clientX, ev.clientY);
    api.cancelLongPressIfMoved(ev.clientX, ev.clientY);
    api.updateDrawingHover(ev.clientX, ev.clientY);

    if (api.getMeasureDragActive() && api.isPrimaryButtonDown(ev)) {
      const point = api.resolvePoint(ev.clientX, ev.clientY);
      if (point && api.getMeasureOverlay()) {
        api.setMeasureOverlay({ start: api.getMeasureOverlay().start, end: point });
      }
      return;
    }

    if (api.getFreehandDrawing()) {
      const point = api.resolvePoint(ev.clientX, ev.clientY);
      if (point) api.appendFreehandPoint(ev.clientX, ev.clientY, point);
      return;
    }

    if (api.isDragging() && !api.isPrimaryButtonDown(ev)) {
      api.finishPointerDrag(ev);
      return;
    }

    if (api.isCursorTool() && api.isDragging() && api.isPrimaryButtonDown(ev) && !api.hasActiveDrag()) {
      api.syncNativeCrosshairAt?.(ev.clientX, ev.clientY);
    }

    api.tryActivateDrag(ev.clientX, ev.clientY);
    if (api.hasActiveDrag()) {
      if (api.isPrimaryButtonDown(ev)) {
        api.applyDrawingDrag(ev.clientX, ev.clientY);
      }
      return;
    }

    const placementStaged = api.getPlacementStaged();
    if (!placementStaged.length) return;
    const point = resolvePlacementPreviewPoint(ev.clientX, ev.clientY);
    if (!point) return;

    const activeTool = api.getActiveTool();
    if (isTrendAngleTool(activeTool) && placementStaged.length === 1) {
      const anchor = placementStaged[0];
      const angle = chartAngleFromPoints(anchor, point);
      api.setPreview({ ...api.getPreview(), points: [anchor, point], angle });
      return;
    }
    if (isParallelChannelTool(activeTool)) {
      const nextPreview = parallelChannelPointerMove(placementStaged, point, activeTool);
      if (nextPreview) api.setPreview(nextPreview);
      return;
    }
    if (isFlatTopBottomTool(activeTool)) {
      const nextPreview = flatTopBottomPointerMove(placementStaged, point, activeTool);
      if (nextPreview) api.setPreview(nextPreview);
      return;
    }
    if (isDisjointChannelTool(activeTool)) {
      const nextPreview = disjointChannelPointerMove(placementStaged, point, activeTool);
      if (nextPreview) api.setPreview(nextPreview);
      return;
    }

    if (isRegressionTrendTool(activeTool) && placementStaged.length === 1) {
      const regPoint = api.resolveRegressionPoint(ev.clientX, ev.clientY);
      if (!regPoint) return;
      api.setPreview(newDrawing(activeTool, [placementStaged[0], regPoint]));
      return;
    }
    if (isMultiPointTool(activeTool)) {
      api.setPreview({ ...api.getPreview(), points: [...placementStaged, point] });
      return;
    }
    const need = pointCountForTool(activeTool);
    const pts = [...placementStaged, point];
    while (pts.length < need) pts.push(point);
    api.setPreview({ ...api.getPreview(), points: pts });
  }

  function onPointerUp(ev) {
    let pinnedFromMobileTap = false;
    if (pendingMobileTap) {
      const tap = pendingMobileTap;
      pendingMobileTap = null;
      const samePointer =
        ev.pointerId == null || tap.pointerId == null || ev.pointerId === tap.pointerId;
      if (
        samePointer &&
        !mobileScrollGesture &&
        !isFreehandTool(api.getActiveTool())
      ) {
        const dx = ev.clientX - tap.startX;
        const dy = ev.clientY - tap.startY;
        const elapsed = performance.now() - tap.startTime;
        if (Math.hypot(dx, dy) <= MOBILE_TAP_SLOP_PX && elapsed <= MOBILE_TAP_MAX_MS) {
          api.swallowChartPointer(ev);
          placeDrawPointAtCrosshair();
          pinnedFromMobileTap = true;
        }
      }
      mobileScrollGesture = false;
      crosshairScrollAnchor = null;
    }

    if (api.getMeasureDragActive()) {
      api.setMeasureDragActive(false);
      const overlay = api.getMeasureOverlay();
      if (
        overlay &&
        overlay.start.time === overlay.end.time &&
        overlay.start.price === overlay.end.price
      ) {
        api.setMeasureOverlay(null);
      }
      api.syncChartPointerHandling();
    }
    if (api.getFreehandDrawing()) {
      api.finishFreehand();
    }
    api.finishPointerDrag(ev);
    api.clearLongPress();
    if (api.isValuesTooltipPinned?.()) api.unpinValuesTooltip();
    else api.hideValuesTooltip();
    if (api.shouldSyncDrawCrosshair?.() && !pinnedFromMobileTap && !api.useMobileDragPlacement?.()) {
      api.pinDrawCrosshairAt?.(ev.clientX, ev.clientY);
    }
    if (api.shouldSyncDrawCrosshair?.() && api.useMobileDragPlacement?.()) {
      crosshairScrollAnchor = null;
      requestAnimationFrame(() => api.syncDrawCrosshairAtMediaAnchor?.());
    } else if (api.useMobileDragPlacement?.() && api.isCursorTool()) {
      api.clearDrawCrosshair?.();
    }
  }

  function onPointerLeave(ev) {
    api.clearLongPress();
    if (!api.isValuesTooltipPinned?.()) api.hideValuesTooltip();
    api.setHoveredDrawing(null);
    if (["dot", "demonstration"].includes(api.getActiveTool())) {
      api.hideCursorMark();
    }
  }

  let lastChartPointerDownAt = 0;
  /** @type {number | null} */
  let lastChartPointerId = null;

  function shouldIgnoreChartPointerDown(ev) {
    if (api.isChartPlacementSuppressed?.()) return true;
    if (ev.pointerType === "mouse" && api.recentTouchInteraction?.()) return true;
    const now = ev.timeStamp || performance.now();
    if (
      ev.pointerId != null &&
      ev.pointerId === lastChartPointerId &&
      now - lastChartPointerDownAt < 150
    ) {
      return true;
    }
    return false;
  }

  function onChartPointerDown(ev) {
    if (ev.button !== 0) return;
    if (ev.type === "mousedown") return;
    if (ev.target.closest(api.DRAWING_UI_SELECTOR)) return;
    if (shouldIgnoreChartPointerDown(ev)) return;
    lastChartPointerDownAt = ev.timeStamp || performance.now();
    lastChartPointerId = ev.pointerId ?? null;
    onPointerDown(ev);
  }

  function onDocumentPointerMove(ev) {
    if (api.useMobileDragPlacement?.()) return;
    if (
      api.isCursorTool() &&
      api.isPrimaryButtonDown?.(ev) &&
      (api.hasActiveDrag?.() || api.isDragging?.())
    ) {
      api.syncNativeCrosshairAt?.(ev.clientX, ev.clientY);
      return;
    }
    if (!api.shouldSyncDrawCrosshair?.()) return;
    if (!api.isPrimaryButtonDown?.(ev)) return;
    api.syncDrawCrosshair(ev.clientX, ev.clientY);
  }

  function onDocumentPointerUp(ev) {
    if (api.isValuesTooltipPinned?.()) {
      api.unpinValuesTooltip();
      return;
    }
    if (api.useMobileDragPlacement?.()) return;
    if (!api.shouldSyncDrawCrosshair?.()) return;
    if (ev.pointerType === "mouse") return;
    const container = api.getContainer?.();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const overChart =
      ev.clientX >= rect.left &&
      ev.clientX <= rect.right &&
      ev.clientY >= rect.top &&
      ev.clientY <= rect.bottom;
    if (overChart) api.pinDrawCrosshairAt?.(ev.clientX, ev.clientY);
    else api.repinDrawCrosshair?.();
  }

  function onCrosshairMove(param) {
    if (!["dot", "demonstration"].includes(api.getActiveTool())) return;
    if (param?.point) api.updateCursorMark(0, 0, param.point);
    else api.hideCursorMark();
  }

  function onLostPointerCapture(ev) {
    if (api.getMeasureDragActive() || api.getFreehandDrawing() || api.isDragging()) {
      onPointerUp(ev);
    }
  }

  function bindChartListeners() {
    api.container.addEventListener("pointerdown", onChartPointerDown, true);
    api.container.addEventListener("dblclick", onChartDoubleClick, true);
    api.container.addEventListener("lostpointercapture", onLostPointerCapture);
    api.overlayRoot.addEventListener("pointermove", onPointerMove);
    api.container.addEventListener("pointermove", onPointerMove);
    api.container.addEventListener("pointerup", onPointerUp);
    api.container.addEventListener("pointercancel", onPointerUp);
    api.overlayRoot.addEventListener("pointerleave", onPointerLeave);
    api.chart.subscribeCrosshairMove(onCrosshairMove);
    document.addEventListener("pointermove", onDocumentPointerMove);
    document.addEventListener("pointerup", onDocumentPointerUp);
  }

  function unbindChartListeners() {
    api.container.removeEventListener("pointerdown", onChartPointerDown, true);
    api.container.removeEventListener("dblclick", onChartDoubleClick, true);
    api.container.removeEventListener("lostpointercapture", onLostPointerCapture);
    api.overlayRoot.removeEventListener("pointermove", onPointerMove);
    api.container.removeEventListener("pointermove", onPointerMove);
    api.container.removeEventListener("pointerup", onPointerUp);
    api.container.removeEventListener("pointercancel", onPointerUp);
    api.overlayRoot.removeEventListener("pointerleave", onPointerLeave);
    api.chart.unsubscribeCrosshairMove(onCrosshairMove);
    document.removeEventListener("pointermove", onDocumentPointerMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
  }

  return { bindChartListeners, unbindChartListeners, resetMobilePlacementGesture };
}
