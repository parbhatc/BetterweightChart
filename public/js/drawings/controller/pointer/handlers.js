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
        const originPoint = api.resolvePoint(ev.clientX, ev.clientY);
        if (originPoint) {
          api.queuePendingDrag({
            mode: "move",
            drawingId: statsHit.id,
            startPoints: statsHit.points.map((p) => ({ ...p })),
            originPoint,
            startClientX: ev.clientX,
            startClientY: ev.clientY,
            ...positionMoveDragExtras(statsHit),
          });
        }
        return;
      }

      const idx = api.findDrawingAtPointer(ev.clientX, ev.clientY);
      if (idx >= 0) {
        api.swallowChartPointer(ev);
        const drawing = api.getDrawings()[idx];
        api.selectDrawing(drawing.id);
        if (!drawing.locked && drawing.type !== "regression-trend") {
          const originPoint = api.resolvePoint(ev.clientX, ev.clientY);
          if (originPoint) {
            const p0 = drawing.points[0];
            const p1 = drawing.points[1];
            api.queuePendingDrag({
              mode: "move",
              drawingId: drawing.id,
              startPoints:
                drawing.type === "parallel-channel" && p0 && p1
                  ? [p0, p1].map((p) => ({ ...p }))
                  : drawing.type === "flat-top-bottom" && p0 && p1
                    ? [p0, p1].map((p) => ({ ...p }))
                    : drawing.points.map((p) => ({ ...p })),
              originPoint,
              startPriceOffset:
                drawing.type === "parallel-channel" ? api.resolvePriceOffset(drawing) : undefined,
              startFlatPrice:
                drawing.type === "flat-top-bottom" ? api.resolveFlatPrice(drawing) : undefined,
              startClientX: ev.clientX,
              startClientY: ev.clientY,
              ...positionMoveDragExtras(drawing),
            });
          }
        }
        return;
      }

      api.selectDrawing(null);
      if (api.getValuesTooltipOnLongPress()) api.scheduleLongPress(ev.clientX, ev.clientY);
      return;
    }

    const point = api.resolvePoint(ev.clientX, ev.clientY);
    if (!point) return;
    api.swallowChartPointer(ev);

    const activeTool = api.getActiveTool();
    const placementStaged = api.getPlacementStaged();

    if (isRegressionTrendTool(activeTool)) {
      const regPoint = api.resolveRegressionPoint(ev.clientX, ev.clientY);
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
      api.startFreehand(point, ev.clientX, ev.clientY);
      return;
    }

    if (isTrendAngleTool(activeTool)) {
      if (placementStaged.length === 0) {
        placementStaged.push(point);
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
      const pts = [...placementStaged];
      while (pts.length < need) pts.push(point);
      api.setPreview(newDrawing(activeTool, pts));
      return;
    }

    api.commitDrawing(newDrawing(activeTool, [...placementStaged]));
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

    if (api.getFreehandDrawing() && api.isPrimaryButtonDown(ev)) {
      const point = api.resolvePoint(ev.clientX, ev.clientY);
      if (point) api.appendFreehandPoint(ev.clientX, ev.clientY, point);
      return;
    }

    if (api.isDragging() && !api.isPrimaryButtonDown(ev)) {
      api.finishPointerDrag();
      return;
    }

    api.tryActivateDrag(ev.clientX, ev.clientY);
    if (api.hasActiveDrag()) {
      if (api.isPrimaryButtonDown(ev)) api.applyDrawingDrag(ev.clientX, ev.clientY);
      return;
    }

    const placementStaged = api.getPlacementStaged();
    if (!placementStaged.length) return;
    const point = api.resolvePoint(ev.clientX, ev.clientY);
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

  function onPointerUp() {
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
    api.finishPointerDrag();
    api.clearLongPress();
    api.hideValuesTooltip();
  }

  function onPointerLeave() {
    api.clearLongPress();
    api.hideValuesTooltip();
    api.setHoveredDrawing(null);
    if (["dot", "demonstration"].includes(api.getActiveTool())) {
      api.hideCursorMark();
    }
  }

  let lastChartPointerDownAt = 0;
  function onChartPointerDown(ev) {
    if (ev.button !== 0) return;
    if (ev.target.closest(api.DRAWING_UI_SELECTOR)) return;
    const now = ev.timeStamp;
    if (now - lastChartPointerDownAt < 40) return;
    lastChartPointerDownAt = now;
    onPointerDown(ev);
  }

  function onCrosshairMove(param) {
    if (!["dot", "demonstration"].includes(api.getActiveTool())) return;
    if (param?.point) api.updateCursorMark(0, 0, param.point);
    else api.hideCursorMark();
  }

  function bindChartListeners() {
    api.container.addEventListener("mousedown", onChartPointerDown, true);
    api.container.addEventListener("pointerdown", onChartPointerDown, true);
    api.container.addEventListener("dblclick", onChartDoubleClick, true);
    api.overlayRoot.addEventListener("mousemove", onPointerMove);
    api.container.addEventListener("mousemove", onPointerMove);
    api.container.addEventListener("mouseup", onPointerUp);
    api.container.addEventListener("pointerup", onPointerUp);
    api.container.addEventListener("pointercancel", onPointerUp);
    api.overlayRoot.addEventListener("mouseleave", onPointerLeave);
    api.chart.subscribeCrosshairMove(onCrosshairMove);
  }

  function unbindChartListeners() {
    api.container.removeEventListener("mousedown", onChartPointerDown, true);
    api.container.removeEventListener("pointerdown", onChartPointerDown, true);
    api.container.removeEventListener("dblclick", onChartDoubleClick, true);
    api.overlayRoot.removeEventListener("mousemove", onPointerMove);
    api.container.removeEventListener("mousemove", onPointerMove);
    api.container.removeEventListener("mouseup", onPointerUp);
    api.container.removeEventListener("pointerup", onPointerUp);
    api.container.removeEventListener("pointercancel", onPointerUp);
    api.overlayRoot.removeEventListener("mouseleave", onPointerLeave);
    api.chart.unsubscribeCrosshairMove(onCrosshairMove);
  }

  return { bindChartListeners, unbindChartListeners, onKeyDown: null };
}
