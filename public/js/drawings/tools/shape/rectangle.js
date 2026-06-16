/** @typedef {import("../../types.js").DrawPoint} DrawPoint */

/** @param {DrawPoint} a @param {DrawPoint} b */
export function rectangleBoundsFromPoints(a, b) {
  return {
    minT: Math.min(a.time, b.time),
    maxT: Math.max(a.time, b.time),
    minP: Math.min(a.price, b.price),
    maxP: Math.max(a.price, b.price),
  };
}

/** @param {{ minT: number, maxT: number, minP: number, maxP: number }} bounds */
export function rectangleCornersFromBounds(bounds) {
  const { minT, maxT, minP, maxP } = bounds;
  return [
    { time: minT, price: maxP },
    { time: maxT, price: maxP },
    { time: maxT, price: minP },
    { time: minT, price: minP },
  ];
}

/** @param {DrawPoint[]} points */
export function rectangleStorageFromCorners(corners) {
  if (!corners.length) return [];
  if (corners.length < 4) return corners.map((p) => ({ ...p }));
  return [{ ...corners[0] }, { ...corners[2] }];
}

/** @param {{ points: DrawPoint[] }} drawing */
export function rectangleAnchorPoints(drawing) {
  const p0 = drawing.points[0];
  const p1 = drawing.points[1];
  if (!p0 || !p1) return drawing.points.map((p) => ({ ...p }));
  return rectangleCornersFromBounds(rectangleBoundsFromPoints(p0, p1));
}

/**
 * Resize axis-aligned rectangle by dragging one corner (opposite corner fixed).
 * @param {number} cornerIndex 0–3
 * @param {DrawPoint[]} startPoints two stored placement corners
 * @param {DrawPoint} point cursor
 */
export function rectangleCornerDragUpdate(cornerIndex, startPoints, point) {
  const p0 = startPoints[0];
  const p1 = startPoints[1];
  if (!p0 || !p1) return { points: startPoints.map((p) => ({ ...p })) };
  const corners = rectangleCornersFromBounds(rectangleBoundsFromPoints(p0, p1));
  const idx = cornerIndex >= 0 && cornerIndex < 4 ? cornerIndex : 0;
  const fixed = corners[(idx + 2) % 4];
  const bounds = rectangleBoundsFromPoints(fixed, point);
  return { points: rectangleStorageFromCorners(rectangleCornersFromBounds(bounds)) };
}
