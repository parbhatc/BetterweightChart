import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { applyColorOpacity } from "../../../ui/color/picker.js";
import { newDrawingDefaults } from "../../toolbars/defaults/store.js";
import { extendedSegmentEndpoints, resolveExtendFlags } from "../line/extend.js";
import { strokeTrendLineShaft } from "../line/trendStyle.js";

const CHANNEL_LINE_DEFAULTS = {
  extendLeft: false,
  extendRight: false,
  showChannelBackground: true,
  channelBackgroundColor: "#ff9800",
  channelBackgroundOpacity: 20,
  showPriceLabels: false,
  leftEnd: "normal",
  rightEnd: "normal",
};

/** @param {string} drawingType */
export function isDisjointChannelTool(drawingType) {
  return drawingType === "disjoint-channel";
}

/** @param {import("../../types.js").UserDrawing} drawing */
function normalizeDisjointChannelDrawing(drawing) {
  const color = drawing.color ?? DEFAULT_DRAWING_COLOR;
  return {
    ...CHANNEL_LINE_DEFAULTS,
    ...drawing,
    channelBackgroundColor: drawing.channelBackgroundColor ?? color,
  };
}

/**
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {import("../../types.js").DrawPoint} line2Start
 */
export function disjointChannelSecondLineEnd(p0, p1, line2Start) {
  return {
    time: line2Start.time + (p1.time - p0.time),
    price: line2Start.price + (p1.price - p0.price),
  };
}

/**
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {import("../../types.js").DrawPoint} line2Start
 */
export function disjointChannelPointsFromGeometry(p0, p1, line2Start) {
  const p2 = line2Start;
  const p3 = disjointChannelSecondLineEnd(p0, p1, p2);
  return [p0, p1, p2, p3];
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function disjointChannelAnchorPoints(drawing) {
  const pts = finalizeDisjointChannelDrawing(drawing).points ?? [];
  return pts.length >= 4 ? pts.slice(0, 4) : pts;
}

/**
 * @param {string} type
 * @param {import("../../types.js").DrawPoint[]} points
 * @param {Record<string, unknown>} [overrides]
 */
export function disjointChannelDraft(type, points, overrides = {}) {
  return finalizeDisjointChannelDrawing({
    type,
    points,
    ...newDrawingDefaults(type),
    ...overrides,
  });
}

/**
 * @param {string} type
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint | null} cursor
 */
export function buildDisjointChannelPreview(type, staged, cursor) {
  if (!staged.length || !cursor) return null;
  const p0 = staged[0];
  if (staged.length === 1) {
    return disjointChannelDraft(type, [p0, cursor]);
  }
  const p1 = staged[1];
  return disjointChannelDraft(type, disjointChannelPointsFromGeometry(p0, p1, cursor));
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeDisjointChannelDrawing(drawing) {
  if (!isDisjointChannelTool(drawing.type)) return drawing;
  const pts = drawing.points ?? [];
  if (pts.length < 2) return normalizeDisjointChannelDrawing(drawing);
  if (pts.length === 2) return normalizeDisjointChannelDrawing(drawing);
  if (pts.length === 3) {
    return normalizeDisjointChannelDrawing({
      ...drawing,
      points: disjointChannelPointsFromGeometry(pts[0], pts[1], pts[2]),
    });
  }
  return normalizeDisjointChannelDrawing(drawing);
}

/**
 * @param {number} anchorIndex
 * @param {import("../../types.js").DrawPoint[]} startPoints
 * @param {import("../../types.js").DrawPoint} point
 */
export function disjointChannelDragUpdate(anchorIndex, startPoints, point) {
  const p0 = startPoints[0];
  const p1 = startPoints[1];
  const p2 = startPoints[2];
  const p3 = startPoints[3];
  if (!p0 || !p1 || !p2 || !p3) return { points: startPoints };

  if (anchorIndex === 0) {
    return { points: disjointChannelPointsFromGeometry(point, p1, p2) };
  }
  if (anchorIndex === 1) {
    return { points: disjointChannelPointsFromGeometry(p0, point, p2) };
  }
  if (anchorIndex === 2) {
    return { points: disjointChannelPointsFromGeometry(p0, p1, point) };
  }
  if (anchorIndex === 3) {
    const np2 = {
      time: point.time - (p1.time - p0.time),
      price: point.price - (p1.price - p0.price),
    };
    return { points: [p0, p1, np2, point] };
  }
  return { points: startPoints };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {import("../../types.js").UserDrawing} drawing
 */
function strokeChannelSegment(ctx, a, b, drawing) {
  const segment = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  strokeTrendLineShaft(ctx, segment, drawing.leftEnd, drawing.rightEnd, drawing.lineWidth ?? 2);
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottomY
 */
export function disjointChannelLineSegments(drawing, timeToX, priceToY, leftX, rightX, bottomY) {
  const normalized = finalizeDisjointChannelDrawing(drawing);
  const points = normalized.points ?? [];
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];
  if (!p0 || !p1) return { lineA: null, lineB: null, normalized };

  const a = { x: timeToX(p0.time), y: priceToY(p0.price) };
  const b = { x: timeToX(p1.time), y: priceToY(p1.price) };
  if ([a.x, a.y, b.x, b.y].some((v) => v == null)) return { lineA: null, lineB: null, normalized };

  const extend = resolveExtendFlags(normalized);
  const lineA = extendedSegmentEndpoints(a, b, extend, leftX, rightX, bottomY);

  if (!p2 || !p3) {
    return { lineA, lineB: null, normalized };
  }

  const c = { x: timeToX(p2.time), y: priceToY(p2.price) };
  const d = { x: timeToX(p3.time), y: priceToY(p3.price) };
  if ([c.x, c.y, d.x, d.y].some((v) => v == null)) return { lineA, lineB: null, normalized };

  const lineB = extendedSegmentEndpoints(c, d, extend, leftX, rightX, bottomY);
  return { lineA, lineB, normalized };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottomY
 * @param {{ isPreview?: boolean }} [state]
 */
export function renderDisjointChannelDrawing(
  ctx,
  drawing,
  timeToX,
  priceToY,
  leftX,
  rightX,
  bottomY,
  state = {},
) {
  const { lineA, lineB, normalized } = disjointChannelLineSegments(
    drawing,
    timeToX,
    priceToY,
    leftX,
    rightX,
    bottomY,
  );
  if (!lineA) return;

  const p0 = normalized.points?.[0];
  const cursor = normalized.points?.[2];
  if (state.isPreview && p0 && cursor && !lineB) {
    const topPx = { x: timeToX(p0.time), y: priceToY(p0.price) };
    const endPx = { x: timeToX(cursor.time), y: priceToY(cursor.price) };
    if (topPx.x != null && topPx.y != null && endPx.x != null && endPx.y != null) {
      ctx.save();
      ctx.strokeStyle = applyColorOpacity("#ef5350", 100);
      ctx.beginPath();
      ctx.moveTo(topPx.x, topPx.y);
      ctx.lineTo(endPx.x, endPx.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (!lineB) {
    strokeChannelSegment(ctx, { x: lineA.x1, y: lineA.y1 }, { x: lineA.x2, y: lineA.y2 }, normalized);
    return;
  }

  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  const strokeColor = applyColorOpacity(baseColor, baseOpacity);

  if (normalized.showChannelBackground !== false) {
    const bgColor = normalized.channelBackgroundColor ?? baseColor;
    const bgOpacity = normalized.channelBackgroundOpacity ?? 20;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lineA.x1, lineA.y1);
    ctx.lineTo(lineA.x2, lineA.y2);
    ctx.lineTo(lineB.x2, lineB.y2);
    ctx.lineTo(lineB.x1, lineB.y1);
    ctx.closePath();
    ctx.fillStyle = applyColorOpacity(bgColor, bgOpacity);
    ctx.fill();
    ctx.restore();
  }

  if (state.isPreview && normalized.points.length >= 3) {
    const topPx = { x: timeToX(normalized.points[0].time), y: priceToY(normalized.points[0].price) };
    const endPx = { x: timeToX(normalized.points[2].time), y: priceToY(normalized.points[2].price) };
    if (topPx.x != null && topPx.y != null && endPx.x != null && endPx.y != null) {
      ctx.save();
      ctx.strokeStyle = applyColorOpacity("#ef5350", 100);
      ctx.beginPath();
      ctx.moveTo(topPx.x, topPx.y);
      ctx.lineTo(endPx.x, endPx.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  strokeChannelSegment(ctx, { x: lineA.x1, y: lineA.y1 }, { x: lineA.x2, y: lineA.y2 }, normalized, strokeColor);
  strokeChannelSegment(ctx, { x: lineB.x1, y: lineB.y1 }, { x: lineB.x2, y: lineB.y2 }, normalized, strokeColor);
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} right
 * @param {number} bottom
 * @param {(px: number, py: number, x1: number, y1: number, x2: number, y2: number) => number} distToSegment
 */
export function hitDisjointChannelDrawing(
  drawing,
  px,
  py,
  threshold,
  timeToX,
  priceToY,
  right,
  bottom,
  distToSegment,
) {
  const { lineA, lineB } = disjointChannelLineSegments(drawing, timeToX, priceToY, 0, right, bottom);
  if (lineA && distToSegment(px, py, lineA.x1, lineA.y1, lineA.x2, lineA.y2) <= threshold) return true;
  if (lineB && distToSegment(px, py, lineB.x1, lineB.y1, lineB.x2, lineB.y2) <= threshold) return true;
  return false;
}
