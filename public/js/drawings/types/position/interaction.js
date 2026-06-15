import { distToSegment } from "../shared/segmentDistance.js";
import {
  clampPositionLevelPrice,
  positionAnchorPoints,
  positionGeometry,
  positionStatsCenterPrice,
} from "./geometry.js";
import { tickSizeForPrecision } from "./placement.js";
import { layoutPositionCenterStats } from "./render.js";
import {
  buildPositionCenterStatLines,
  computePositionStatValues,
  resolvePositionStatsFields,
  shouldShowPositionStats,
} from "./stats.js";

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
export function hitPositionDrawing(drawing, px, py, threshold, timeToX, priceToY) {
  const geom = positionGeometry(drawing);
  if (!geom) return false;
  const x1 = timeToX(geom.tStart);
  const x2 = timeToX(geom.tEnd);
  const yTarget = priceToY(geom.targetPrice);
  const yStop = priceToY(geom.stopPrice);
  const yEntry = priceToY(geom.entryPrice);
  if (x1 == null || x2 == null || yTarget == null || yStop == null || yEntry == null) return false;

  const left = Math.min(x1, x2) - threshold;
  const right = Math.max(x1, x2) + threshold;
  const top = Math.min(yTarget, yStop) - threshold;
  const bottom = Math.max(yTarget, yStop) + threshold;

  if (px >= left && px <= right && py >= top && py <= bottom) return true;

  return (
    distToSegment(px, py, left, top, right, top) <= threshold ||
    distToSegment(px, py, right, top, right, bottom) <= threshold ||
    distToSegment(px, py, right, bottom, left, bottom) <= threshold ||
    distToSegment(px, py, left, bottom, left, top) <= threshold ||
    distToSegment(px, py, left, yEntry, right, yEntry) <= threshold
  );
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {{ isSelected?: boolean, precision?: number, bars?: { close?: number }[] }} state
 */
export function hitPositionStatsBox(drawing, px, py, timeToX, priceToY, state) {
  if (!shouldShowPositionStats(drawing, state)) return false;
  const geom = positionGeometry(drawing);
  if (!geom) return false;
  const x1 = timeToX(geom.tStart);
  const x2 = timeToX(geom.tEnd);
  const yEntry = priceToY(geom.entryPrice);
  if (x1 == null || x2 == null || yEntry == null) return false;

  const fields = resolvePositionStatsFields(drawing);
  const values = computePositionStatValues(drawing, state.precision ?? 2, state.bars);
  const lines = buildPositionCenterStatLines(fields, values);
  const yStats = priceToY(positionStatsCenterPrice(geom));
  const layout = layoutPositionCenterStats(
    { x: Math.min(x1, x2), y: yEntry },
    { x: Math.max(x1, x2), y: yEntry },
    lines,
    drawing.fontSize ?? 12,
    yStats ?? undefined,
  );
  if (!layout) return false;
  return px >= layout.x && px <= layout.x + layout.width && py >= layout.y && py <= layout.y + layout.height;
}

/**
 * @param {number} anchorIndex
 * @param {import("../../types.js").DrawPoint[]} startAnchors
 * @param {import("../../types.js").DrawPoint} point
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} [precision]
 */
export function positionDragUpdate(anchorIndex, startAnchors, point, drawing, precision = 2) {
  const tick = tickSizeForPrecision(precision);
  if (startAnchors.length < 4) {
    const p0 = startAnchors[0];
    const p1 = startAnchors[1];
    if (!p0 || !p1) return { points: startAnchors.slice(0, 2) };
    startAnchors = positionAnchorPoints({ ...drawing, points: [p0, p1] });
  }

  const startPoints = [
    {
      time: Math.min(startAnchors[0].time, startAnchors[3].time),
      price: Math.max(startAnchors[0].price, startAnchors[1].price),
    },
    {
      time: Math.max(startAnchors[1].time, startAnchors[2].time),
      price: Math.min(startAnchors[3].price, startAnchors[2].price),
    },
  ];
  const startGeom = positionGeometry({ ...drawing, points: startPoints });
  if (!startGeom) return { points: drawing.points.map((p) => ({ ...p })) };

  const isLong = drawing.type === "long-position";
  const entryPrice = startGeom.entryPrice;
  const nextAnchors = startAnchors.map((a, i) => (i === anchorIndex ? point : a));
  const topLeft = nextAnchors[0];
  const topRight = nextAnchors[1];
  const bottomRight = nextAnchors[2];
  const bottomLeft = nextAnchors[3];
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return { points: drawing.points.map((p) => ({ ...p })) };
  }

  const tStart = Math.min(topLeft.time, bottomLeft.time);
  const tEnd = Math.max(topRight.time, bottomRight.time);

  if (anchorIndex === 4 || anchorIndex === 5) {
    const newEntry = point.price;
    const targetPrice = isLong ? newEntry + startGeom.reward : newEntry - startGeom.reward;
    const stopPrice = isLong ? newEntry - startGeom.risk : newEntry + startGeom.risk;
    return {
      points: [
        { time: tStart, price: isLong ? targetPrice : stopPrice },
        { time: tEnd, price: isLong ? stopPrice : targetPrice },
      ],
      positionEntryPrice: newEntry,
    };
  }

  if (anchorIndex === 0 || anchorIndex === 1) {
    const newTarget = clampPositionLevelPrice(point.price, entryPrice, isLong, "target", tick);
    const stopPrice = startGeom.stopPrice;
    return {
      points: [
        { time: tStart, price: isLong ? newTarget : stopPrice },
        { time: tEnd, price: isLong ? stopPrice : newTarget },
      ],
      positionEntryPrice: entryPrice,
    };
  }

  if (anchorIndex === 2 || anchorIndex === 3) {
    const newStop = clampPositionLevelPrice(point.price, entryPrice, isLong, "stop", tick);
    const targetPrice = startGeom.targetPrice;
    return {
      points: [
        { time: tStart, price: isLong ? targetPrice : newStop },
        { time: tEnd, price: isLong ? newStop : targetPrice },
      ],
      positionEntryPrice: entryPrice,
    };
  }

  return {
    points: [
      { time: tStart, price: isLong ? startGeom.targetPrice : startGeom.stopPrice },
      { time: tEnd, price: isLong ? startGeom.stopPrice : startGeom.targetPrice },
    ],
    positionEntryPrice: entryPrice,
  };
}
