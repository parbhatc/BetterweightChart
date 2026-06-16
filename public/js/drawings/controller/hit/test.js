import { DRAWING_HIT_THRESHOLD, ANCHOR_RADIUS, ANCHOR_HIT_PADDING, ANCHOR_HIT_PADDING_COARSE } from "../../constants.js";
import { extendedSegmentEndpoints, resolveExtendFlags } from "../../tools/line/extend.js";
import { trendAngleSegmentForDrawing } from "../../tools/line/trendAngle.js";
import { hitGannStyleDrawing } from "../../tools/gann/index.js";
import { hitPatternDrawing, isPatternDrawingType } from "../../tools/pattern/index.js";
import { hitForecastDrawing, isForecastDrawingType } from "../../tools/forecast/index.js";
import { getDrawingTypeHandler } from "../../types/handlers.js";
import { hitPositionDrawing, isPositionTool, positionAnchorPoints } from "../../tools/position/barrel.js";
import { hitMeasureDrawing, isMeasureDrawingType } from "../../tools/measure/index.js";
import { hitAnnotationDrawing, isAnnotationDrawingType } from "../../tools/annotation/index.js";
import { hitRectArea, hitRectBorder } from "../../tools/annotation/hitTest.js";
import { isRectangleTool, rectangleAnchorPoints } from "../../tools/shape/index.js";
import { hitDisjointChannelDrawing, disjointChannelAnchorPoints, isDisjointChannelTool } from "../../tools/channel/disjoint.js";
import { hitFibStyleDrawing } from "../../tools/fib/retracement.js";
import { clipLineThroughPoints, parallelLineThrough } from "../../tools/line/math.js";
import { hitParallelChannelDrawing, isParallelChannelTool, parallelChannelAnchorPoints } from "../../tools/channel/parallel.js";
import {
  flatTopBottomAnchorPoints,
  isFlatTopBottomTool,
  resolveFlatPrice,
} from "../../tools/channel/flatTopBottom.js";
import { hitRegressionTrendDrawing, isRegressionTrendTool, regressionTrendAnchorPoints, regressionTrendMedianAnchorIndices } from "../../tools/regression/trend.js";
import { isOnePointTool } from "../../registry/tools.js";

/** @typedef {import("../../types.js").UserDrawing} UserDrawing */

const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");

function anchorHitRadius(drawing) {
  const pad = COARSE_POINTER_MQ.matches ? ANCHOR_HIT_PADDING_COARSE : ANCHOR_HIT_PADDING;
  return ANCHOR_RADIUS + pad + (isParallelChannelTool(drawing.type) ? 6 : 0);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** @typedef {import("../../types.js").UserDrawing} UserDrawing */

/**
 * @param {UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {(drawing: UserDrawing) => { pts: ({ x: number, y: number } | null)[], right: number, bottom: number, timeToX?: (t: number) => number | null, priceToY?: (p: number) => number | null, bars?: { time: number, close?: number }[] }} getCoords
 */
export function hitDrawing(drawing, px, py, getCoords) {
  const threshold = DRAWING_HIT_THRESHOLD;
  const { pts, right, bottom, timeToX, priceToY, bars = [] } = getCoords(drawing);
  const a = pts[0];
  const b = pts[1];
  if (!a) return false;

  switch (drawing.type) {
    case "horizontal-line":
      return Math.abs(py - a.y) <= threshold && px >= -threshold && px <= right + threshold;
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
      return hitRectArea(a, b, px, py, 2) || hitRectBorder(a, b, px, py, threshold);
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
      if (!timeToX || !priceToY) return Math.hypot(px - a.x, py - a.y) <= threshold;
      const seg = trendAngleSegmentForDrawing(drawing, timeToX, priceToY);
      if (!seg) return Math.hypot(px - a.x, py - a.y) <= threshold;
      return distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold;
    }
    case "parallel-channel": {
      if (!timeToX || !priceToY) return false;
      return hitParallelChannelDrawing(
        drawing,
        px,
        py,
        threshold,
        timeToX,
        priceToY,
        right,
        bottom,
        distToSegment,
      );
    }
    case "disjoint-channel": {
      if (!timeToX || !priceToY) return false;
      return hitDisjointChannelDrawing(
        drawing,
        px,
        py,
        threshold,
        timeToX,
        priceToY,
        right,
        bottom,
        distToSegment,
      );
    }
    case "flat-top-bottom": {
      if (!b || !timeToX || !priceToY) return false;
      const flatPrice = resolveFlatPrice(drawing);
      const flatY = priceToY(flatPrice);
      if (flatY == null) return false;
      const extend = resolveExtendFlags(drawing);
      const slope = extendedSegmentEndpoints(a, b, extend, 0, right, bottom);
      const hitSlope = distToSegment(px, py, slope.x1, slope.y1, slope.x2, slope.y2) <= threshold;
      const flatX1 = extend.extendLeft ? 0 : Math.min(a.x, b.x);
      const flatX2 = extend.extendRight ? right : Math.max(a.x, b.x);
      const hitFlat =
        Math.abs(py - flatY) <= threshold &&
        px >= flatX1 - threshold &&
        px <= flatX2 + threshold;
      return hitSlope || hitFlat;
    }
    case "regression-trend": {
      if (!timeToX || !priceToY) return Math.hypot(px - a.x, py - a.y) <= threshold;
      return hitRegressionTrendDrawing(
        drawing,
        px,
        py,
        threshold,
        timeToX,
        priceToY,
        bars,
        distToSegment,
        right,
        bottom,
      );
    }
    case "long-position":
    case "short-position": {
      if (!timeToX || !priceToY) return false;
      const handler = getDrawingTypeHandler(drawing.type);
      if (handler?.hit) return handler.hit(drawing, px, py, threshold, timeToX, priceToY);
      return hitPositionDrawing(drawing, px, py, threshold, timeToX, priceToY);
    }
    case "fib-retracement":
    case "fib-extension":
    case "fib-channel":
    case "fib-time-zone":
    case "trend-based-fib-time":
    case "fib-circles":
    case "fib-spiral":
    case "fib-wedge": {
      if (!timeToX || !priceToY) return false;
      return hitFibStyleDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom);
    }
    case "gann-box":
    case "gann-square":
    case "gann-square-fixed":
    case "gann-fan": {
      if (!timeToX || !priceToY) return false;
      return hitGannStyleDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom);
    }
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
  const radius = anchorHitRadius(drawing);

  if (isParallelChannelTool(drawing.type)) {
    const { timeToX, priceToY } = getCoords(drawing);
    if (!timeToX || !priceToY) return -1;
    const anchors = parallelChannelAnchorPoints(drawing);
    for (let i = 0; i < anchors.length; i += 1) {
      const x = timeToX(anchors[i].time);
      const y = priceToY(anchors[i].price);
      if (x != null && y != null && Math.hypot(px - x, py - y) <= radius) return i;
    }
    return -1;
  }

  if (isFlatTopBottomTool(drawing.type)) {
    const { timeToX, priceToY } = getCoords(drawing);
    if (!timeToX || !priceToY) return -1;
    const anchors = flatTopBottomAnchorPoints(drawing);
    for (let i = 0; i < anchors.length; i += 1) {
      const x = timeToX(anchors[i].time);
      const y = priceToY(anchors[i].price);
      if (x != null && y != null && Math.hypot(px - x, py - y) <= radius) return i;
    }
    return -1;
  }

  if (isDisjointChannelTool(drawing.type)) {
    const { timeToX, priceToY } = getCoords(drawing);
    if (!timeToX || !priceToY) return -1;
    const anchors = disjointChannelAnchorPoints(drawing);
    for (let i = 0; i < anchors.length; i += 1) {
      const x = timeToX(anchors[i].time);
      const y = priceToY(anchors[i].price);
      if (x != null && y != null && Math.hypot(px - x, py - y) <= radius) return i;
    }
    return -1;
  }

  if (isRegressionTrendTool(drawing.type)) {
    const { timeToX, priceToY, bars = [] } = getCoords(drawing);
    if (!timeToX || !priceToY) return -1;
    const [midLeft, midRight] = regressionTrendMedianAnchorIndices(drawing, bars);
    const anchors = regressionTrendAnchorPoints(drawing, bars);
    for (const i of [midLeft, midRight]) {
      const ap = anchors[i];
      if (!ap) continue;
      const x = timeToX(ap.time);
      const y = priceToY(ap.price);
      if (x != null && y != null && Math.hypot(px - x, py - y) <= radius) return i;
    }
    return -1;
  }

  if (isRectangleTool(drawing.type)) {
    const { timeToX, priceToY } = getCoords(drawing);
    if (!timeToX || !priceToY) return -1;
    const anchors = rectangleAnchorPoints(drawing);
    for (let i = 0; i < anchors.length; i += 1) {
      const ap = anchors[i];
      const x = timeToX(ap.time);
      const y = priceToY(ap.price);
      if (x != null && y != null && Math.hypot(px - x, py - y) <= radius) return i;
    }
    return -1;
  }

  if (isPositionTool(drawing.type)) {
    const { timeToX, priceToY } = getCoords(drawing);
    if (!timeToX || !priceToY) return -1;
    const anchors = positionAnchorPoints(drawing);
    for (let i = 0; i < anchors.length; i += 1) {
      const ap = anchors[i];
      const x = timeToX(ap.time);
      const y = priceToY(ap.price);
      if (x != null && y != null && Math.hypot(px - x, py - y) <= radius) return i;
    }
    return -1;
  }

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
