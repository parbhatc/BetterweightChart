import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  arcThroughThreePoints,
  drawArrowHead,
  drawDirectionArrow,
  drawEllipseFromBox,
  drawFlag,
  drawIdeaBulb,
  drawImagePlaceholder,
  drawLabelAt,
  drawMarkerArrowBetween,
  drawParallelogram,
  drawPin,
  drawPolyline,
  drawPostX,
  drawSignpost,
  drawSpeechBubble,
  drawStrokeEndpoint,
  drawTableGrid,
  strokeRectFromTwoPoints,
} from "./geometry.js";
import {
  renderArcShape,
  renderCircleShape,
  renderCurveShape,
  renderDoubleCurveShape,
  renderEllipseShape,
  renderPathShape,
  renderPolylineShape,
  renderRectangleShape,
  renderRotatedRectangleShape,
  renderTriangleShape,
} from "../shape/index.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 * @param {number} bottom
 */
export function renderAnnotationDrawing(ctx, drawing, pts, right, bottom) {
  if (!pts.length) return;
  const type = drawing.type;
  const a = pts[0];
  const b = pts[1];

  switch (type) {
    case "brush": {
      if (pts.length < 2) break;
      const lineWidth = drawing.lineWidth ?? 2;
      const strokeColor = applyColorOpacity(
        drawing.color ?? "#00BCD4",
        drawing.colorOpacity ?? 100,
      );
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (drawing.showBrushBackground) {
        ctx.save();
        ctx.strokeStyle = applyColorOpacity(
          drawing.brushBackgroundColor ?? drawing.color ?? "#00BCD4",
          drawing.brushBackgroundOpacity ?? 20,
        );
        ctx.lineWidth = lineWidth * 3;
        drawPolyline(ctx, pts);
        ctx.restore();
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      drawPolyline(ctx, pts);
      const leftEnd = drawing.leftEnd ?? "normal";
      const rightEnd = drawing.rightEnd ?? "normal";
      drawStrokeEndpoint(ctx, pts[1], pts[0], leftEnd, lineWidth);
      drawStrokeEndpoint(ctx, pts[pts.length - 2], pts[pts.length - 1], rightEnd, lineWidth);
      ctx.restore();
      break;
    }
    case "highlighter": {
      if (pts.length < 2) break;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = applyColorOpacity(
        drawing.color ?? "#FFEB3B",
        drawing.colorOpacity ?? 35,
      );
      ctx.lineWidth = drawing.lineWidth ?? 20;
      drawPolyline(ctx, pts);
      ctx.restore();
      break;
    }
    case "arrow-marker":
      if (b) drawMarkerArrowBetween(ctx, a, b);
      else drawMarkerArrowBetween(ctx, { x: a.x, y: a.y + 24 }, a);
      break;
    case "line-arrow":
      if (b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        drawArrowHead(ctx, a, b);
      }
      break;
    case "arrow-mark-up":
      drawDirectionArrow(ctx, a, true);
      break;
    case "arrow-mark-down":
      drawDirectionArrow(ctx, a, false);
      break;
    case "rectangle":
      renderRectangleShape(ctx, drawing, pts, right);
      break;
    case "rotated-rectangle":
      renderRotatedRectangleShape(ctx, drawing, pts);
      break;
    case "path":
      renderPathShape(ctx, drawing, pts);
      break;
    case "polyline":
      renderPolylineShape(ctx, drawing, pts);
      break;
    case "circle":
      renderCircleShape(ctx, drawing, pts);
      break;
    case "ellipse":
      renderEllipseShape(ctx, drawing, pts);
      break;
    case "triangle":
      renderTriangleShape(ctx, drawing, pts);
      break;
    case "arc":
      renderArcShape(ctx, drawing, pts);
      break;
    case "curve":
      renderCurveShape(ctx, drawing, pts);
      break;
    case "double-curve":
      renderDoubleCurveShape(ctx, drawing, pts);
      break;
    case "text":
    case "text-annotation":
      drawLabelAt(ctx, drawing, a.x, a.y, "Text");
      break;
    case "note": {
      const w = 72;
      const h = 28;
      ctx.strokeRect(a.x, a.y, w, h);
      drawLabelAt(ctx, drawing, a.x, a.y, "Note");
      break;
    }
    case "price-note":
      drawLabelAt(ctx, drawing, a.x, a.y, drawing.points[0]?.price != null ? String(drawing.points[0].price) : "Price");
      break;
    case "price-label":
      drawLabelAt(ctx, drawing, a.x, a.y - 14, drawing.points[0]?.price != null ? String(drawing.points[0].price) : "Label");
      break;
    case "pin":
      drawPin(ctx, a);
      drawLabelAt(ctx, drawing, a.x + 8, a.y - 18, "");
      break;
    case "table":
      if (b) {
        drawTableGrid(ctx, a, b);
        drawLabelAt(ctx, drawing, Math.min(a.x, b.x), Math.min(a.y, b.y), "");
      }
      break;
    case "callout":
      if (b) {
        drawSpeechBubble(ctx, a, b, false);
        drawLabelAt(ctx, drawing, Math.min(a.x, b.x), Math.min(a.y, b.y), "Callout");
      }
      break;
    case "comment":
      if (b) {
        drawSpeechBubble(ctx, a, b, true);
        drawLabelAt(ctx, drawing, Math.min(a.x, b.x), Math.min(a.y, b.y), "Comment");
      }
      break;
    case "signpost":
      drawSignpost(ctx, a);
      drawLabelAt(ctx, drawing, a.x - 10, a.y - 28, "Sign");
      break;
    case "flag-mark":
      drawFlag(ctx, a);
      break;
    case "image":
      if (b) drawImagePlaceholder(ctx, a, b);
      break;
    case "post":
      drawPostX(ctx, a);
      break;
    case "idea":
      drawIdeaBulb(ctx, a);
      break;
    default:
      drawPolyline(ctx, pts);
  }
}
