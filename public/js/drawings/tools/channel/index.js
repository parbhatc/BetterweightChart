import { clipLineThroughPoints, parallelLineThrough, strokeSegment } from "../line/math.js";

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
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }} bar
 * @param {string} source
 */
export function regressionBarValue(bar, source = "close") {
  const open = Number(bar.open ?? bar.close);
  const high = Number(bar.high ?? bar.close);
  const low = Number(bar.low ?? bar.close);
  const close = Number(bar.close ?? bar.open);
  switch (source) {
    case "open":
      return open;
    case "high":
      return high;
    case "low":
      return low;
    case "hl2":
      return (high + low) / 2;
    case "hlc3":
      return (high + low + close) / 3;
    case "ohlc4":
      return (open + high + low + close) / 4;
    default:
      return close;
  }
}

/**
 * @param {{ time: number }[]} bars
 * @param {number} time
 */
function nearestBarIndex(bars, time) {
  let best = 0;
  let bestDist = Math.abs(bars[0].time - time);
  for (let i = 1; i < bars.length; i += 1) {
    const dist = Math.abs(bars[i].time - time);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Inclusive bar window for regression (TradingView snaps both anchors to nearest bars).
 * @param {{ time: number }[]} bars
 * @param {number} t0
 * @param {number} t1
 */
export function regressionBarSlice(bars, t0, t1) {
  if (!bars?.length) return [];
  const i0 = nearestBarIndex(bars, t0);
  const i1 = nearestBarIndex(bars, t1);
  const lo = Math.min(i0, i1);
  const hi = Math.max(i0, i1);
  return bars.slice(lo, hi + 1);
}

/**
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} bars
 * @param {number} t0
 * @param {number} t1
 * @param {string} [source]
 */
export function regressionInRange(bars, t0, t1, source = "close") {
  const slice = regressionBarSlice(bars, t0, t1);
  if (slice.length < 2) return null;
  const values = slice.map((b) => regressionBarValue(b, source)).filter((v) => Number.isFinite(v));
  if (values.length < 2) return null;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  values.forEach((y, i) => {
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  });
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let sumErr2 = 0;
  values.forEach((y, i) => {
    const err = y - (intercept + slope * i);
    sumErr2 += err * err;
  });
  const stdDiv = n > 2 ? n - 2 : n;
  const std = Math.sqrt(sumErr2 / stdDiv);
  return { slice, values, slope, intercept, std, source };
}
