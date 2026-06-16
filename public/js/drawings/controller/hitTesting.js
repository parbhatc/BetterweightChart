import { findDrawingAt, hitDrawingAnchor } from "./hit/test.js";
import { hitTrendLineStatsBox, isTrendLineFamilyType } from "../tools/line/trendStats.js";
import { trendAngleSecondPoint } from "../tools/line/trendAngle.js";
import {
  hitPositionStatsBox,
  isPositionTool,
} from "../tools/position/barrel.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachHitTesting(ctx) {
  function findStatsHit(px, py) {
    const context = ctx.getContext();
    for (let i = ctx.drawings.length - 1; i >= 0; i -= 1) {
      const drawing = ctx.drawings[i];
      if (drawing.locked || (!isTrendLineFamilyType(drawing.type) && !isPositionTool(drawing.type))) continue;
      const { pts, timeToX, priceToY } = ctx.drawingCoords(drawing);
      const a = pts[0];
      let b = pts[1];
      if (!a || !b) continue;
      const isSelected = drawing.id === ctx.selectedId;
      const isHovered = drawing.id === ctx.hoveredId;
      if (isPositionTool(drawing.type) && timeToX && priceToY) {
        if (
          hitPositionStatsBox(drawing, px, py, timeToX, priceToY, {
            isSelected,
            isHovered,
            hoveredDrawingId: ctx.hoveredId,
            precision: context.precision,
            bars: context.bars,
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
          barSec: context.barSec,
          precision: context.precision,
        })
      ) {
        return drawing;
      }
    }
    return null;
  }

  function findAnchorHit(px, py) {
    const selected = ctx.getSelectedDrawing();
    if (selected && !selected.locked) {
      const anchorIdx = hitDrawingAnchor(selected, px, py, ctx.drawingCoords);
      if (anchorIdx >= 0) return { drawing: selected, pointIndex: anchorIdx };
    }

    for (let i = ctx.drawings.length - 1; i >= 0; i -= 1) {
      const drawing = ctx.drawings[i];
      if (drawing.locked || drawing.id === ctx.selectedId) continue;
      const anchorIdx = hitDrawingAnchor(drawing, px, py, ctx.drawingCoords);
      if (anchorIdx >= 0) return { drawing, pointIndex: anchorIdx };
    }
    return null;
  }

  function findDrawingAtPointer(clientX, clientY) {
    const rect = ctx.container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return findDrawingAt(ctx.drawings, px, py, ctx.drawingCoords);
  }

  function updateDrawingHover(clientX, clientY) {
    if (
      !ctx.isCursorTool(ctx.activeTool) ||
      ctx.drag?.isDragging?.() ||
      ctx.placementStaged.length > 0 ||
      ctx.preview != null
    ) {
      ctx.setHoveredDrawing(null);
      return;
    }
    const rect = ctx.container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const idx = findDrawingAt(ctx.drawings, px, py, ctx.drawingCoords);
    const id = idx >= 0 ? (ctx.drawings[idx]?.id ?? null) : null;
    ctx.setHoveredDrawing(id);
  }

  Object.assign(ctx, {
    findStatsHit,
    findAnchorHit,
    findDrawingAtPointer,
    updateDrawingHover,
  });
}
