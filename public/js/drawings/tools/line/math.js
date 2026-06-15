/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} topY
 * @param {number} bottomY
 */
export function clipLineThroughPoints(a, b, leftX, rightX, topY = 0, bottomY = 1e9) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x1: a.x, y1: a.y, x2: a.x, y2: a.y };
  }

  if (Math.abs(dx) < 0.001) {
    return { x1: a.x, y1: topY, x2: a.x, y2: bottomY };
  }

  const ts = [
    (leftX - a.x) / dx,
    (rightX - a.x) / dx,
    (topY - a.y) / dy,
    (bottomY - a.y) / dy,
  ].filter((t) => Number.isFinite(t));

  const points = ts.map((t) => ({ x: a.x + dx * t, y: a.y + dy * t }));
  const inside = points.filter(
    (p) => p.x >= leftX - 0.5 && p.x <= rightX + 0.5 && p.y >= topY - 0.5 && p.y <= bottomY + 0.5,
  );
  if (inside.length < 2) {
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  inside.sort((p, q) => p.x - q.x || p.y - q.y);
  const first = inside[0];
  const last = inside[inside.length - 1];
  return { x1: first.x, y1: first.y, x2: last.x, y2: last.y };
}

/**
 * @param {{ x: number, y: number }} through
 * @param {{ x: number, y: number }} dirFrom
 * @param {{ x: number, y: number }} dirTo
 */
export function parallelLineThrough(through, dirFrom, dirTo, leftX, rightX, topY, bottomY) {
  const dx = dirTo.x - dirFrom.x;
  const dy = dirTo.y - dirFrom.y;
  const len = Math.hypot(dx, dy) || 1;
  const b = { x: through.x + dx / len, y: through.y + dy / len };
  return clipLineThroughPoints(through, b, leftX, rightX, topY, bottomY);
}

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x1: number, y1: number, x2: number, y2: number }} seg
 */
export function strokeSegment(ctx, seg) {
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
}
