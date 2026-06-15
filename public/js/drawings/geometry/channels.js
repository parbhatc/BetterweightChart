import { clipLineThroughPoints, parallelLineThrough, strokeSegment } from "./lineMath.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {{ x: number, y: number }} p3
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottomY
 */
export function drawParallelChannel(ctx, p1, p2, p3, leftX, rightX, bottomY) {
  const base = clipLineThroughPoints(p1, p2, leftX, rightX, 0, bottomY);
  const top = parallelLineThrough(p3, p1, p2, leftX, rightX, 0, bottomY);
  strokeSegment(ctx, base);
  strokeSegment(ctx, top);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {{ x: number, y: number }} p3
 * @param {{ x: number, y: number }} p4
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottomY
 */
export function drawDisjointChannel(ctx, p1, p2, p3, p4, leftX, rightX, bottomY) {
  const a = clipLineThroughPoints(p1, p2, leftX, rightX, 0, bottomY);
  const b = clipLineThroughPoints(p3, p4, leftX, rightX, 0, bottomY);
  strokeSegment(ctx, a);
  strokeSegment(ctx, b);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {{ x: number, y: number }} p3
 * @param {number} leftX
 * @param {number} rightX
 */
export function drawFlatTopBottom(ctx, p1, p2, p3, leftX, rightX) {
  const slope = clipLineThroughPoints(p1, p2, leftX, rightX, 0, 1e9);
  strokeSegment(ctx, slope);
  const y = p3.y;
  const x1 = Math.min(p1.x, p2.x, p3.x, leftX);
  const x2 = Math.max(p1.x, p2.x, p3.x, rightX);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

/**
 * @param {{ time: number, close: number }[]} bars
 * @param {number} t0
 * @param {number} t1
 */
export function regressionInRange(bars, t0, t1) {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const slice = bars.filter((b) => b.time >= lo && b.time <= hi);
  if (slice.length < 2) return null;
  const n = slice.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  slice.forEach((b, i) => {
    sumX += i;
    sumY += b.close;
    sumXY += i * b.close;
    sumXX += i * i;
  });
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let sumErr2 = 0;
  slice.forEach((b, i) => {
    const err = b.close - (intercept + slope * i);
    sumErr2 += err * err;
  });
  const std = Math.sqrt(sumErr2 / n);
  return { slice, slope, intercept, std };
}
