import { clipLineThroughPoints, midpoint, parallelLineThrough } from "./lineMath.js";

/**
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {{ x: number, y: number }} p3
 * @param {string} variant
 */
export function pitchforkOrigin(p1, p2, p3, variant) {
  switch (variant) {
    case "schiff-pitchfork":
      return midpoint(p1, p2);
    case "modified-schiff-pitchfork":
      return { x: (p1.x + p2.x) / 2, y: p1.y };
    default:
      return p1;
  }
}

/**
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {{ x: number, y: number }} p3
 * @param {string} variant
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottomY
 */
export function pitchforkLines(p1, p2, p3, variant, leftX, rightX, bottomY) {
  const m23 = midpoint(p2, p3);
  const origin = pitchforkOrigin(p1, p2, p3, variant);

  let upperThrough = p2;
  let lowerThrough = p3;
  if (variant === "inside-pitchfork") {
    upperThrough = midpoint(p1, p2);
    lowerThrough = midpoint(p1, p3);
  }

  const median = clipLineThroughPoints(origin, m23, leftX, rightX, 0, bottomY);
  const upper = parallelLineThrough(upperThrough, origin, m23, leftX, rightX, 0, bottomY);
  const lower = parallelLineThrough(lowerThrough, origin, m23, leftX, rightX, 0, bottomY);

  return { median, upper, lower };
}
