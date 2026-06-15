/** @param {string} type */
export function isTrendAngleDrawing(type) {
  return type === "trend-angle";
}

/** @param {number} angle */
export function normalizeAngleDeg(angle) {
  let deg = angle % 360;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Angle in chart space: 0° = right (later time), 90° = up (higher price).
 * @param {{ time: number, price: number }} anchor
 * @param {{ time: number, price: number }} target
 */
export function chartAngleFromPoints(anchor, target) {
  const dx = target.time - anchor.time;
  const dy = target.price - anchor.price;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return 0;
  return normalizeAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI);
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function resolveTrendAngleDeg(drawing) {
  const p0 = drawing.points[0];
  const p1 = drawing.points[1];
  if (p0 && p1) return chartAngleFromPoints(p0, p1);
  if (!p0) return 45;
  if (drawing.angle != null && Number.isFinite(Number(drawing.angle))) {
    return normalizeAngleDeg(Number(drawing.angle));
  }
  return 45;
}

/**
 * @param {{ time: number, price: number }} anchor
 * @param {number} angleDeg
 * @param {{ time: number, price: number }} currentEnd
 */
export function retargetEndFromAngle(anchor, angleDeg, currentEnd) {
  const dx = currentEnd.time - anchor.time;
  const dy = currentEnd.price - anchor.price;
  const len = Math.hypot(dx, dy) || 1;
  const rad = (angleDeg * Math.PI) / 180;
  return {
    time: anchor.time + Math.cos(rad) * len,
    price: anchor.price + Math.sin(rad) * len,
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function trendAngleSecondPoint(drawing) {
  const p0 = drawing.points[0];
  const p1 = drawing.points[1];
  if (p0 && p1) return p1;
  if (!p0) return null;
  return secondPointForAngle(p0, resolveTrendAngleDeg(drawing));
}

/**
 * @param {{ time: number, price: number }} anchor
 * @param {number} angleDeg
 * @param {number} [scale]
 */
export function secondPointForAngle(anchor, angleDeg, scale = 1) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    time: anchor.time + Math.cos(rad) * scale,
    price: anchor.price + Math.sin(rad) * scale,
  };
}

/**
 * Move anchor and end by the same delta (preserves angle and segment length).
 * @param {import("../../types.js").DrawPoint[]} points
 * @param {number} dt
 * @param {number} dp
 */
export function translateTrendAnglePoints(points, dt, dp) {
  return points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
}

/** @param {import("../../types.js").UserDrawing} drawing @param {number} [barSec] */
export function ensureTrendAngleDrawing(drawing, barSec = 60) {
  if (drawing.type !== "trend-angle") return drawing;
  const p0 = drawing.points[0];
  if (!p0 || drawing.points.length >= 2) return drawing;
  const p1 = secondPointForAngle(p0, resolveTrendAngleDeg(drawing), barSec * 5);
  const points = [p0, p1];
  return { ...drawing, points, angle: chartAngleFromPoints(p0, p1) };
}

/**
 * Pixel segment from anchor (point A) to end (point B).
 * @param {{ time: number, price: number }} anchor
 * @param {{ time: number, price: number }} end
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
export function trendAngleSegmentPixels(anchor, end, timeToX, priceToY) {
  const ax = timeToX(anchor.time);
  const ay = priceToY(anchor.price);
  const bx = timeToX(end.time);
  const by = priceToY(end.price);
  if (ax == null || ay == null || bx == null || by == null) return null;
  return { x1: ax, y1: ay, x2: bx, y2: by, ax, ay, bx, by };
}

/** @param {import("../../types.js").UserDrawing} drawing @param {(t: number) => number | null} timeToX @param {(p: number) => number | null} priceToY */
export function trendAngleSegmentForDrawing(drawing, timeToX, priceToY) {
  const anchor = drawing.points[0];
  const end = trendAngleSecondPoint(drawing);
  if (!anchor || !end) return null;
  return trendAngleSegmentPixels(anchor, end, timeToX, priceToY);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} angleDeg
 * @param {string} color
 */
export function drawTrendAngleDecoration(ctx, ax, ay, bx, by, angleDeg, color) {
  const radius = 36;
  const lineAngle = Math.atan2(by - ay, bx - ax);
  const arcEnd = lineAngle;
  const arcCounter = arcEnd < 0;

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + radius, ay);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ax, ay, radius, 0, arcEnd, arcCounter);
  ctx.stroke();
  ctx.setLineDash([]);

  const labelAngle = arcEnd / 2;
  const lx = ax + (radius + 16) * Math.cos(labelAngle);
  const ly = ay + (radius + 16) * Math.sin(labelAngle);
  ctx.font = "400 11px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`${angleDeg.toFixed(2)}°`, lx, ly);
  ctx.restore();
}
