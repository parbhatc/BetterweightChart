import { DRAWING_HIT_THRESHOLD, ANCHOR_RADIUS, ANCHOR_HIT_PADDING } from "../constants.js";
import { extendedSegmentEndpoints, resolveExtendFlags } from "../geometry/lineExtend.js";
import { hitFibDrawing } from "../geometry/fibTools.js";
import { hitGannDrawing } from "../geometry/gannTools.js";
import { hitPatternDrawing, isPatternDrawingType } from "../geometry/patternTools.js";
import { hitForecastDrawing, isForecastDrawingType } from "../geometry/forecastTools.js";
import { hitMeasureDrawing, isMeasureDrawingType } from "../geometry/measureTools.js";
import { hitAnnotationDrawing, isAnnotationDrawingType } from "../geometry/annotationTools.js";
import { pitchforkLines } from "../geometry/pitchfork.js";
import { clipLineThroughPoints, parallelLineThrough } from "../geometry/lineMath.js";
import { isOnePointTool } from "../registry/toolRegistry.js";

/** @typedef {import("../types.js").UserDrawing} UserDrawing */

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** @typedef {import("../types.js").UserDrawing} UserDrawing */

/**
 * @param {UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {(drawing: UserDrawing) => { pts: ({ x: number, y: number } | null)[], right: number, bottom: number }} getCoords
 */
export function hitDrawing(drawing, px, py, getCoords) {
  const threshold = DRAWING_HIT_THRESHOLD;
  const { pts, right, bottom } = getCoords(drawing);
  const a = pts[0];
  const b = pts[1];
  if (!a) return false;

  switch (drawing.type) {
    case "horizontal-line":
      return Math.abs(py - a.y) <= threshold && px >= Math.min(a.x, right) - threshold;
    case "horizontal-ray":
      return Math.abs(py - a.y) <= threshold && px >= a.x - threshold && px <= right + threshold;
    case "cross-line":
      return (
        (Math.abs(py - a.y) <= threshold && px >= 0 && px <= right) ||
        (Math.abs(px - a.x) <= threshold && py >= 0 && py <= bottom)
      );
    case "vertical-line":
      return Math.abs(px - a.x) <= threshold && py >= 0 && py <= bottom;
    case "rectangle": {
      if (!b) return false;
      const x1 = Math.min(a.x, b.x) - threshold;
      const x2 = Math.max(a.x, b.x) + threshold;
      const y1 = Math.min(a.y, b.y) - threshold;
      const y2 = Math.max(a.y, b.y) + threshold;
      return (
        distToSegment(px, py, x1, y1, x2, y1) <= threshold ||
        distToSegment(px, py, x2, y1, x2, y2) <= threshold ||
        distToSegment(px, py, x2, y2, x1, y2) <= threshold ||
        distToSegment(px, py, x1, y2, x1, y1) <= threshold
      );
    }
    case "ray":
    case "trend-line":
    case "extended-line":
    case "info-line": {
      if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
      const { x1, y1, x2, y2 } = extendedSegmentEndpoints(
        a,
        b,
        resolveExtendFlags(drawing),
        0,
        right,
        bottom,
      );
      return distToSegment(px, py, x1, y1, x2, y2) <= threshold;
    }
    case "trend-angle": {
      if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
      return distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold;
    }
    case "parallel-channel": {
      if (!b || !pts[2]) return false;
      const p3 = pts[2];
      const base = clipLineThroughPoints(a, b, 0, right, 0, bottom);
      const top = parallelLineThrough(p3, a, b, 0, right, 0, bottom);
      return (
        distToSegment(px, py, base.x1, base.y1, base.x2, base.y2) <= threshold ||
        distToSegment(px, py, top.x1, top.y1, top.x2, top.y2) <= threshold
      );
    }
    case "disjoint-channel": {
      if (!b || !pts[2] || !pts[3]) return false;
      const p3 = pts[2];
      const p4 = pts[3];
      return (
        distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold ||
        distToSegment(px, py, p3.x, p3.y, p4.x, p4.y) <= threshold
      );
    }
    case "flat-top-bottom": {
      if (!b || !pts[2]) return false;
      const p3 = pts[2];
      const slope = clipLineThroughPoints(a, b, 0, right, 0, bottom);
      const hitSlope = distToSegment(px, py, slope.x1, slope.y1, slope.x2, slope.y2) <= threshold;
      const hitFlat =
        Math.abs(py - p3.y) <= threshold && px >= Math.min(a.x, b.x, p3.x, 0) - threshold && px <= right + threshold;
      return hitSlope || hitFlat;
    }
    case "regression-trend": {
      if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
      return distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold;
    }
    case "pitchfork":
    case "schiff-pitchfork":
    case "modified-schiff-pitchfork":
    case "inside-pitchfork": {
      if (!b || !pts[2]) return false;
      const lines = pitchforkLines(a, b, pts[2], drawing.type, 0, right, bottom);
      return (
        distToSegment(px, py, lines.median.x1, lines.median.y1, lines.median.x2, lines.median.y2) <=
          threshold ||
        distToSegment(px, py, lines.upper.x1, lines.upper.y1, lines.upper.x2, lines.upper.y2) <= threshold ||
        distToSegment(px, py, lines.lower.x1, lines.lower.y1, lines.lower.x2, lines.lower.y2) <= threshold
      );
    }
    case "fib-retracement":
    case "fib-extension":
    case "fib-channel":
    case "fib-time-zone":
    case "fib-speed-fan":
    case "trend-based-fib-time":
    case "fib-circles":
    case "fib-spiral":
    case "fib-speed-resistance-arcs":
    case "fib-wedge":
    case "pitchfan":
      return hitFibDrawing(drawing.type, pts.filter(Boolean), px, py, threshold, right, bottom);
    case "gann-box":
    case "gann-square":
    case "gann-square-fixed":
    case "gann-fan":
      return hitGannDrawing(drawing.type, pts.filter(Boolean), px, py, threshold, right, bottom);
    default: {
      const filtered = pts.filter(Boolean);
      if (isPatternDrawingType(drawing.type)) {
        return hitPatternDrawing(drawing.type, filtered, px, py, threshold, right, bottom);
      }
      if (isForecastDrawingType(drawing.type)) {
        return hitForecastDrawing(drawing.type, filtered, px, py, threshold);
      }
      if (isMeasureDrawingType(drawing.type)) {
        return hitMeasureDrawing(drawing.type, filtered, px, py, threshold);
      }
      if (isAnnotationDrawingType(drawing.type)) {
        return hitAnnotationDrawing(drawing.type, filtered, px, py, threshold, right, bottom);
      }
      if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
      return distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold;
    }
  }
}

/**
 * @param {UserDrawing[]} drawings
 * @param {number} px
 * @param {number} py
 * @param {(drawing: UserDrawing) => { pts: ({ x: number, y: number } | null)[], right: number, bottom: number }} getCoords
 */
export function findDrawingAt(drawings, px, py, getCoords) {
  for (let i = drawings.length - 1; i >= 0; i -= 1) {
    if (hitDrawing(drawings[i], px, py, getCoords)) return i;
  }
  return -1;
}

/**
 * @param {UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {(drawing: UserDrawing) => { pts: ({ x: number, y: number } | null)[] }} getCoords
 * @returns {number} point index or -1
 */
export function hitDrawingAnchor(drawing, px, py, getCoords) {
  const radius = ANCHOR_RADIUS + ANCHOR_HIT_PADDING;
  const { pts } = getCoords(drawing);
  let indices = isOnePointTool(drawing.type)
    ? [0]
    : drawing.points.length > 0
      ? drawing.points.map((_, i) => i)
      : [0];

  for (const i of indices) {
    const p = pts[i];
    if (p && Math.hypot(px - p.x, py - p.y) <= radius) return i;
  }
  return -1;
}
