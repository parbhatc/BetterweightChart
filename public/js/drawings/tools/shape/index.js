import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  arcThroughThreePoints,
  drawParallelogram,
  drawPolyline,
  drawStrokeEndpoint,
  fillArcThroughThreePoints,
  fillClosedPolyline,
  fillEllipseFromBox,
  fillParallelogram,
  fillRectFromTwoPoints,
  rectFromTwoPoints,
  sampleCurve,
  strokeRectFromTwoPoints,
} from "../annotation/geometry.js";
import { isFreehandTool } from "../../registry/tools.js";

export const RECTANGLE_DEFAULTS = {
  color: "#9C27B0",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  extendLeft: false,
  extendRight: false,
  showShapeBackground: true,
  shapeBackgroundColor: "#9C27B0",
  shapeBackgroundOpacity: 20,
  showRectangleMiddleLine: false,
  middleLineColor: "#9C27B0",
  middleLineWidth: 1,
  middleLineStyle: 2,
  middleLineOpacity: 100,
};

export const ROTATED_RECTANGLE_DEFAULTS = {
  color: "#4CAF50",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  showShapeBackground: true,
  shapeBackgroundColor: "#4CAF50",
  shapeBackgroundOpacity: 20,
};

export const CIRCLE_DEFAULTS = {
  color: "#FF9800",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  showShapeBackground: true,
  shapeBackgroundColor: "#FF9800",
  shapeBackgroundOpacity: 20,
};

export const PATH_DEFAULTS = {
  color: "#2962FF",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  leftEnd: "normal",
  rightEnd: "arrow",
};

export const POLYLINE_DEFAULTS = {
  color: "#00BCD4",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  showShapeBackground: true,
  shapeBackgroundColor: "#00BCD4",
  shapeBackgroundOpacity: 20,
};

export const ELLIPSE_DEFAULTS = {
  color: "#F23645",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  showShapeBackground: true,
  shapeBackgroundColor: "#F23645",
  shapeBackgroundOpacity: 20,
};

export const TRIANGLE_DEFAULTS = {
  color: "#089981",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  showShapeBackground: true,
  shapeBackgroundColor: "#089981",
  shapeBackgroundOpacity: 20,
};

export const ARC_DEFAULTS = {
  color: "#E91E63",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  showShapeBackground: true,
  shapeBackgroundColor: "#E91E63",
  shapeBackgroundOpacity: 20,
};

export const CURVE_DEFAULTS = {
  color: "#2962FF",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  extendLeft: false,
  extendRight: false,
  leftEnd: "normal",
  rightEnd: "normal",
  showShapeBackground: false,
  shapeBackgroundColor: "#2962FF",
  shapeBackgroundOpacity: 20,
};

export const DOUBLE_CURVE_DEFAULTS = {
  color: "#673AB7",
  colorOpacity: 100,
  lineWidth: 2,
  lineStyle: 0,
  extendLeft: false,
  extendRight: false,
  leftEnd: "normal",
  rightEnd: "normal",
  showShapeBackground: false,
  shapeBackgroundColor: "#673AB7",
  shapeBackgroundOpacity: 20,
};

const LINE_STYLE_DASH = {
  0: [],
  1: [6, 4],
  2: [2, 3],
};

/** @param {string} type */
export function isRectangleTool(type) {
  return type === "rectangle";
}

/** @param {string} type */
export function isRotatedRectangleTool(type) {
  return type === "rotated-rectangle";
}

/** @param {string} type */
export function isCircleShapeTool(type) {
  return type === "circle";
}

/** @param {string} type */
export function isPathTool(type) {
  return type === "path";
}

/** @param {string} type */
export function isPolylineTool(type) {
  return type === "polyline";
}

/** @param {string} type */
export function isEllipseTool(type) {
  return type === "ellipse";
}

/** @param {string} type */
export function isTriangleTool(type) {
  return type === "triangle";
}

/** @param {string} type */
export function isArcTool(type) {
  return type === "arc";
}

/** @param {string} type */
export function isCurveTool(type) {
  return type === "curve" || type === "double-curve";
}

/** @param {string} type */
export function isFilledShapeTool(type) {
  return (
    isRectangleTool(type) ||
    isRotatedRectangleTool(type) ||
    isCircleShapeTool(type) ||
    isEllipseTool(type) ||
    isTriangleTool(type) ||
    isArcTool(type) ||
    isPolylineTool(type)
  );
}

/** @param {string} type */
export function isMultiPointShapeTool(type) {
  return isPathTool(type) || isPolylineTool(type);
}

/** @param {string} type */
export function shapeHidesTextTab(type) {
  return (
    isPathTool(type) ||
    isPolylineTool(type) ||
    isRotatedRectangleTool(type) ||
    isTriangleTool(type) ||
    isArcTool(type) ||
    isCurveTool(type)
  );
}

/** @param {string} type */
export function shapeHidesCoordsTab(type) {
  return (
    isPathTool(type) ||
    isPolylineTool(type) ||
    isRotatedRectangleTool(type) ||
    isArcTool(type) ||
    isEllipseTool(type)
  );
}

/** @param {string} type */
export function shapeUsesLineSectionLabel(type) {
  return isPathTool(type) || isCurveTool(type);
}

/** @param {string} type */
export function supportsShapeStyleSettings(type) {
  return (
    isRectangleTool(type) ||
    isRotatedRectangleTool(type) ||
    isCircleShapeTool(type) ||
    isPathTool(type) ||
    isPolylineTool(type) ||
    isEllipseTool(type) ||
    isTriangleTool(type) ||
    isArcTool(type) ||
    isCurveTool(type)
  );
}

/** @param {string} type */
export function shapeDefaultsForType(type) {
  if (type === "rectangle") return { ...RECTANGLE_DEFAULTS };
  if (type === "rotated-rectangle") return { ...ROTATED_RECTANGLE_DEFAULTS };
  if (type === "circle") return { ...CIRCLE_DEFAULTS };
  if (type === "path") return { ...PATH_DEFAULTS };
  if (type === "polyline") return { ...POLYLINE_DEFAULTS };
  if (type === "ellipse") return { ...ELLIPSE_DEFAULTS };
  if (type === "triangle") return { ...TRIANGLE_DEFAULTS };
  if (type === "arc") return { ...ARC_DEFAULTS };
  if (type === "curve") return { ...CURVE_DEFAULTS };
  if (type === "double-curve") return { ...DOUBLE_CURVE_DEFAULTS };
  return {};
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function shapeDraftFromDrawing(drawing) {
  const base = shapeDefaultsForType(drawing.type);
  return {
    ...base,
    color: drawing.color ?? base.color,
    colorOpacity: drawing.colorOpacity ?? base.colorOpacity,
    lineWidth: drawing.lineWidth ?? base.lineWidth,
    lineStyle: drawing.lineStyle ?? base.lineStyle ?? 0,
    extendLeft: drawing.extendLeft ?? base.extendLeft ?? false,
    extendRight: drawing.extendRight ?? base.extendRight ?? false,
    showShapeBackground: drawing.showShapeBackground ?? base.showShapeBackground ?? false,
    shapeBackgroundColor: drawing.shapeBackgroundColor ?? base.shapeBackgroundColor ?? base.color,
    shapeBackgroundOpacity: drawing.shapeBackgroundOpacity ?? base.shapeBackgroundOpacity ?? 20,
    showRectangleMiddleLine: drawing.showRectangleMiddleLine ?? base.showRectangleMiddleLine ?? false,
    middleLineColor: drawing.middleLineColor ?? base.middleLineColor ?? base.color,
    middleLineWidth: drawing.middleLineWidth ?? base.middleLineWidth ?? 1,
    middleLineStyle: drawing.middleLineStyle ?? base.middleLineStyle ?? 2,
    middleLineOpacity: drawing.middleLineOpacity ?? base.middleLineOpacity ?? 100,
    leftEnd: drawing.leftEnd ?? base.leftEnd ?? "normal",
    rightEnd: drawing.rightEnd ?? base.rightEnd ?? "normal",
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeShapeDrawing(drawing) {
  if (!supportsShapeStyleSettings(drawing.type)) return drawing;
  return { ...shapeDraftFromDrawing(drawing), ...drawing };
}

/** Tools that stay active after placing (path/polyline like TradingView). */
export function keepsToolAfterCommit(type) {
  return isFreehandTool(type) || isPathTool(type) || isPolylineTool(type);
}

/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} right
 * @param {boolean} extendLeft
 * @param {boolean} extendRight
 */
export function rectanglePixelBounds(a, b, right, extendLeft, extendRight) {
  let x1 = Math.min(a.x, b.x);
  let x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  if (extendLeft) x1 = 0;
  if (extendRight) x2 = right;
  return { x1, y1, x2, y2 };
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts @param {number} right */
export function renderRectangleShape(ctx, drawing, pts, right) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return;
  const extendLeft = Boolean(drawing.extendLeft);
  const extendRight = Boolean(drawing.extendRight);
  const { x1, y1, x2, y2 } = rectanglePixelBounds(a, b, right, extendLeft, extendRight);
  const boxA = { x: x1, y: y1 };
  const boxB = { x: x2, y: y2 };

  if (drawing.showShapeBackground !== false) {
    ctx.save();
    ctx.fillStyle = applyColorOpacity(
      drawing.shapeBackgroundColor ?? drawing.color ?? RECTANGLE_DEFAULTS.color,
      drawing.shapeBackgroundOpacity ?? 20,
    );
    fillRectFromTwoPoints(ctx, boxA, boxB);
    ctx.restore();
  }

  ctx.save();
  const dash = LINE_STYLE_DASH[drawing.lineStyle ?? 0] ?? [];
  if (dash.length) ctx.setLineDash(dash);
  ctx.lineWidth = drawing.lineWidth ?? 2;
  strokeRectFromTwoPoints(ctx, boxA, boxB);

  if (drawing.showRectangleMiddleLine) {
    const midY = (y1 + y2) / 2;
    ctx.save();
    const midDash = LINE_STYLE_DASH[drawing.middleLineStyle ?? 2] ?? [2, 3];
    ctx.setLineDash(midDash);
    ctx.strokeStyle = applyColorOpacity(
      drawing.middleLineColor ?? drawing.color ?? RECTANGLE_DEFAULTS.color,
      drawing.middleLineOpacity ?? 100,
    );
    ctx.lineWidth = drawing.middleLineWidth ?? 1;
    ctx.beginPath();
    ctx.moveTo(x1, midY);
    ctx.lineTo(x2, midY);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderRotatedRectangleShape(ctx, drawing, pts) {
  if (pts.length < 3) return;
  const [p0, p1, p2] = pts;
  if (drawing.showShapeBackground !== false) {
    ctx.save();
    ctx.fillStyle = applyColorOpacity(
      drawing.shapeBackgroundColor ?? drawing.color ?? ROTATED_RECTANGLE_DEFAULTS.color,
      drawing.shapeBackgroundOpacity ?? 20,
    );
    fillParallelogram(ctx, p0, p1, p2);
    ctx.restore();
  }
  ctx.save();
  const dash = LINE_STYLE_DASH[drawing.lineStyle ?? 0] ?? [];
  if (dash.length) ctx.setLineDash(dash);
  ctx.lineWidth = drawing.lineWidth ?? 2;
  drawParallelogram(ctx, p0, p1, p2);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderCircleShape(ctx, drawing, pts) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return;
  if (drawing.showShapeBackground !== false) {
    ctx.save();
    ctx.fillStyle = applyColorOpacity(
      drawing.shapeBackgroundColor ?? drawing.color ?? CIRCLE_DEFAULTS.color,
      drawing.shapeBackgroundOpacity ?? 20,
    );
    fillEllipseFromBox(ctx, a, b, true);
    ctx.restore();
  }
  ctx.save();
  const dash = LINE_STYLE_DASH[drawing.lineStyle ?? 0] ?? [];
  if (dash.length) ctx.setLineDash(dash);
  ctx.lineWidth = drawing.lineWidth ?? 2;
  const { x, y, w, h } = rectFromTwoPoints(a, b);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(Math.min(w, h) / 2, 1);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, rx, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderPathShape(ctx, drawing, pts) {
  if (pts.length < 2) return;
  const lineWidth = drawing.lineWidth ?? 2;
  ctx.save();
  const dash = LINE_STYLE_DASH[drawing.lineStyle ?? 0] ?? [];
  if (dash.length) ctx.setLineDash(dash);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lineWidth;
  drawPolyline(ctx, pts);
  const leftEnd = drawing.leftEnd ?? "normal";
  const rightEnd = drawing.rightEnd ?? "arrow";
  drawStrokeEndpoint(ctx, pts[1], pts[0], leftEnd, lineWidth);
  drawStrokeEndpoint(ctx, pts[pts.length - 2], pts[pts.length - 1], rightEnd, lineWidth);
  ctx.restore();
}

function applyShapeStroke(ctx, drawing) {
  const dash = LINE_STYLE_DASH[drawing.lineStyle ?? 0] ?? [];
  if (dash.length) ctx.setLineDash(dash);
  ctx.lineWidth = drawing.lineWidth ?? 2;
}

function shapeFillStyle(ctx, drawing, fallbackColor) {
  ctx.fillStyle = applyColorOpacity(
    drawing.shapeBackgroundColor ?? drawing.color ?? fallbackColor,
    drawing.shapeBackgroundOpacity ?? 20,
  );
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderPolylineShape(ctx, drawing, pts) {
  if (pts.length < 2) return;
  ctx.save();
  if (pts.length >= 3 && drawing.showShapeBackground !== false) {
    ctx.save();
    shapeFillStyle(ctx, drawing, POLYLINE_DEFAULTS.color);
    fillClosedPolyline(ctx, pts);
    ctx.restore();
  }
  applyShapeStroke(ctx, drawing);
  drawPolyline(ctx, pts, pts.length >= 3);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderEllipseShape(ctx, drawing, pts) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return;
  if (drawing.showShapeBackground !== false) {
    ctx.save();
    shapeFillStyle(ctx, drawing, ELLIPSE_DEFAULTS.color);
    fillEllipseFromBox(ctx, a, b, false);
    ctx.restore();
  }
  ctx.save();
  applyShapeStroke(ctx, drawing);
  const { x, y, w, h } = rectFromTwoPoints(a, b);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderTriangleShape(ctx, drawing, pts) {
  if (pts.length < 3) return;
  const tri = pts.slice(0, 3);
  if (drawing.showShapeBackground !== false) {
    ctx.save();
    shapeFillStyle(ctx, drawing, TRIANGLE_DEFAULTS.color);
    fillClosedPolyline(ctx, tri);
    ctx.restore();
  }
  ctx.save();
  applyShapeStroke(ctx, drawing);
  drawPolyline(ctx, tri, true);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderArcShape(ctx, drawing, pts) {
  if (pts.length < 3) return;
  const [p0, p1, p2] = pts;
  if (drawing.showShapeBackground !== false) {
    ctx.save();
    shapeFillStyle(ctx, drawing, ARC_DEFAULTS.color);
    fillArcThroughThreePoints(ctx, p0, p1, p2);
    ctx.restore();
  }
  ctx.save();
  applyShapeStroke(ctx, drawing);
  arcThroughThreePoints(ctx, p0, p1, p2);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts @param {boolean} cubic */
function renderCurveFamilyShape(ctx, drawing, pts, cubic) {
  const minPts = cubic ? 4 : 3;
  if (pts.length < minPts) return;
  const lineWidth = drawing.lineWidth ?? 2;
  const samples = cubic
    ? sampleCurve((t) => {
        const u = 1 - t;
        return {
          x:
            u * u * u * pts[0].x +
            3 * u * u * t * pts[1].x +
            3 * u * t * t * pts[2].x +
            t * t * t * pts[3].x,
          y:
            u * u * u * pts[0].y +
            3 * u * u * t * pts[1].y +
            3 * u * t * t * pts[2].y +
            t * t * t * pts[3].y,
        };
      }, 48)
    : sampleCurve((t) => {
        const u = 1 - t;
        return {
          x: u * u * pts[0].x + 2 * u * t * pts[1].x + t * t * pts[2].x,
          y: u * u * pts[0].y + 2 * u * t * pts[1].y + t * t * pts[2].y,
        };
      }, 48);

  if (drawing.showShapeBackground) {
    ctx.save();
    shapeFillStyle(ctx, drawing, drawing.color ?? CURVE_DEFAULTS.color);
    ctx.beginPath();
    ctx.moveTo(samples[0].x, samples[0].y);
    for (let i = 1; i < samples.length; i += 1) ctx.lineTo(samples[i].x, samples[i].y);
    ctx.lineTo(samples[0].x, samples[0].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  applyShapeStroke(ctx, drawing);
  ctx.lineCap = "round";
  drawPolyline(ctx, samples);
  const leftFrom = cubic ? pts[1] : pts[1];
  const rightFrom = cubic ? pts[2] : pts[1];
  drawStrokeEndpoint(ctx, leftFrom, pts[0], drawing.leftEnd ?? "normal", lineWidth);
  drawStrokeEndpoint(ctx, rightFrom, pts[cubic ? 3 : 2], drawing.rightEnd ?? "normal", lineWidth);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderCurveShape(ctx, drawing, pts) {
  renderCurveFamilyShape(ctx, drawing, pts, false);
}

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing @param {{ x: number, y: number }[]} pts */
export function renderDoubleCurveShape(ctx, drawing, pts) {
  renderCurveFamilyShape(ctx, drawing, pts, true);
}
