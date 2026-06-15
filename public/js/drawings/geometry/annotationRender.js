import {
  arcThroughThreePoints,
  drawArrowHead,
  drawDirectionArrow,
  drawEllipseFromBox,
  drawFlag,
  drawIdeaBulb,
  drawImagePlaceholder,
  drawLabelAt,
  drawMarkerArrow,
  drawParallelogram,
  drawPin,
  drawPolyline,
  drawPostX,
  drawSignpost,
  drawSpeechBubble,
  drawTableGrid,
  strokeRectFromTwoPoints,
} from "./annotationGeometry.js";

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
    case "brush":
      drawPolyline(ctx, pts);
      break;
    case "highlighter": {
      ctx.save();
      ctx.globalAlpha = 0.35;
      const prev = ctx.lineWidth;
      ctx.lineWidth = (drawing.lineWidth ?? prev) * 2.5;
      drawPolyline(ctx, pts);
      ctx.lineWidth = prev;
      ctx.restore();
      break;
    }
    case "arrow-marker":
      drawMarkerArrow(ctx, a);
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
      if (b) strokeRectFromTwoPoints(ctx, a, b);
      break;
    case "rotated-rectangle":
      if (pts.length >= 3) drawParallelogram(ctx, pts[0], pts[1], pts[2]);
      break;
    case "path":
    case "polyline":
      drawPolyline(ctx, pts);
      break;
    case "circle":
      if (b) drawEllipseFromBox(ctx, a, b, true);
      break;
    case "ellipse":
      if (b) drawEllipseFromBox(ctx, a, b, false);
      break;
    case "triangle":
      if (pts.length >= 3) drawPolyline(ctx, pts.slice(0, 3), true);
      break;
    case "arc":
      if (pts.length >= 3) arcThroughThreePoints(ctx, pts[0], pts[1], pts[2]);
      break;
    case "curve":
      if (pts.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
        ctx.stroke();
      }
      break;
    case "double-curve":
      if (pts.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
        ctx.stroke();
      }
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
