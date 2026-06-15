import { distToSegment, rectFromTwoPoints, sampleCurve } from "./annotationGeometry.js";

export function hitPolyline(pts, px, py, threshold) {
  if (!pts.length) return false;
  for (let i = 0; i < pts.length; i += 1) {
    if (Math.hypot(px - pts[i].x, py - pts[i].y) <= threshold * 2) return true;
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
  }
  return false;
}

export function hitRectBorder(a, b, px, py, threshold) {
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

export function hitRectArea(a, b, px, py, pad = 0) {
  const x1 = Math.min(a.x, b.x) - pad;
  const x2 = Math.max(a.x, b.x) + pad;
  const y1 = Math.min(a.y, b.y) - pad;
  const y2 = Math.max(a.y, b.y) + pad;
  return px >= x1 && px <= x2 && py >= y1 && py <= y2;
}

export function hitEllipseBox(a, b, px, py, threshold, forceCircle = false) {
  const { x, y, w, h } = rectFromTwoPoints(a, b);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max((forceCircle ? Math.min(w, h) : w) / 2, 1);
  const ry = Math.max((forceCircle ? Math.min(w, h) : h) / 2, 1);
  const steps = 32;
  let prev = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const pt = { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
    if (prev && distToSegment(px, py, prev.x, prev.y, pt.x, pt.y) <= threshold) return true;
    prev = pt;
  }
  return false;
}

export function hitParallelogram(p0, p1, p2, px, py, threshold) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const p3 = { x: p0.x + dx, y: p0.y + dy };
  return hitPolyline([p0, p1, p2, p3, p0], px, py, threshold);
}

export function hitArcThreePoints(p0, p1, p2, px, py, threshold) {
  const ax = p0.x;
  const ay = p0.y;
  const bx = p1.x;
  const by = p1.y;
  const cx = p2.x;
  const cy = p2.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return hitPolyline([p0, p1, p2], px, py, threshold);
  const ux =
    ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const a0 = Math.atan2(ay - uy, ax - ux);
  const a1 = Math.atan2(by - uy, bx - ux);
  const am = Math.atan2(cy - uy, cx - ux);
  const norm = (a) => {
    let v = a;
    while (v < 0) v += Math.PI * 2;
    while (v >= Math.PI * 2) v -= Math.PI * 2;
    return v;
  };
  const s = norm(a0);
  const e = norm(a1);
  const m = norm(am);
  const ccw = s < e ? m < s || m > e : m > e && m < s;
  const steps = 24;
  let prev = { x: ux + Math.cos(a0) * r, y: uy + Math.sin(a0) * r };
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ang = ccw ? a0 - t * (a0 - a1) : a0 + t * (a1 - a0);
    const pt = { x: ux + Math.cos(ang) * r, y: uy + Math.sin(ang) * r };
    if (distToSegment(px, py, prev.x, prev.y, pt.x, pt.y) <= threshold) return true;
    prev = pt;
  }
  return false;
}

export function hitSampledCurve(samples, px, py, threshold) {
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
  }
  return false;
}

export function hitPointMarker(px, py, x, y, threshold, radius = 12) {
  return Math.hypot(px - x, py - y) <= threshold + radius;
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 */
export function hitAnnotationDrawing(type, pts, px, py, threshold) {
  if (!pts.length) return false;
  const a = pts[0];
  const b = pts[1];

  switch (type) {
    case "brush":
    case "highlighter":
    case "path":
    case "polyline":
      return hitPolyline(pts, px, py, threshold);
    case "arrow-marker":
    case "arrow-mark-up":
    case "arrow-mark-down":
    case "post":
    case "idea":
      return hitPointMarker(px, py, a.x, a.y, threshold);
    case "line-arrow":
      if (!b) return hitPointMarker(px, py, a.x, a.y, threshold);
      return (
        distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold ||
        hitPointMarker(px, py, b.x, b.y, threshold, 6)
      );
    case "rectangle":
      return b ? hitRectBorder(a, b, px, py, threshold) : hitPointMarker(px, py, a.x, a.y, threshold);
    case "rotated-rectangle":
      return pts.length >= 3 ? hitParallelogram(pts[0], pts[1], pts[2], px, py, threshold) : false;
    case "circle":
      return b ? hitEllipseBox(a, b, px, py, threshold, true) : hitPointMarker(px, py, a.x, a.y, threshold);
    case "ellipse":
      return b ? hitEllipseBox(a, b, px, py, threshold, false) : hitPointMarker(px, py, a.x, a.y, threshold);
    case "triangle":
      return pts.length >= 3 ? hitPolyline([...pts.slice(0, 3), pts[0]], px, py, threshold) : false;
    case "arc":
      return pts.length >= 3 ? hitArcThreePoints(pts[0], pts[1], pts[2], px, py, threshold) : false;
    case "curve":
      if (pts.length < 3) return false;
      return hitSampledCurve(
        sampleCurve((t) => {
          const u = 1 - t;
          return {
            x: u * u * pts[0].x + 2 * u * t * pts[1].x + t * t * pts[2].x,
            y: u * u * pts[0].y + 2 * u * t * pts[1].y + t * t * pts[2].y,
          };
        }),
        px,
        py,
        threshold,
      );
    case "double-curve":
      if (pts.length < 4) return false;
      return hitSampledCurve(
        sampleCurve((t) => {
          const u = 1 - t;
          return {
            x:
              u * u * u * pts[0].x +
              3 * u * u * t * pts[1].x +
              3 * u * t * t * pts[2].x +
              t * t * t * pts[3].x,
            y:
              u * u * u * pts[0].y +
              3 * u * u * t * pts[1].y +
              3 * u * t * t * pts[2].y +
              t * t * t * pts[3].y,
          };
        }),
        px,
        py,
        threshold,
      );
    case "text":
    case "text-annotation":
    case "note":
    case "price-note":
    case "price-label":
      return hitPointMarker(px, py, a.x, a.y, threshold, 24);
    case "pin":
    case "signpost":
    case "flag-mark":
      return hitPointMarker(px, py, a.x, a.y, threshold, 16);
    case "table":
    case "image":
      return b
        ? hitRectBorder(a, b, px, py, threshold) || hitRectArea(a, b, px, py, 2)
        : hitPointMarker(px, py, a.x, a.y, threshold);
    case "callout":
    case "comment":
      if (!b) return hitPointMarker(px, py, a.x, a.y, threshold);
      return (
        hitRectArea(
          { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
          {
            x: Math.min(a.x, b.x) + Math.max(Math.abs(b.x - a.x), 48),
            y: Math.min(a.y, b.y) + Math.max(Math.abs(b.y - a.y), 28),
          },
          px,
          py,
          4,
        ) || hitPointMarker(px, py, a.x, a.y, threshold)
      );
    default:
      return hitPolyline(pts, px, py, threshold);
  }
}
