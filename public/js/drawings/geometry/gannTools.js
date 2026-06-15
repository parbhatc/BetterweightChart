import { clipLineThroughPoints, strokeSegment } from "./lineMath.js";

const GANN_FAN_RATIOS = [
  [1, 8],
  [1, 4],
  [1, 3],
  [1, 2],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [8, 1],
];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }[]} pts
 * @param {number} rightX
 * @param {number} bottomY
 */
export function renderGannDrawing(ctx, drawing, pts, rightX, bottomY) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return;

  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  const w = x2 - x1;
  const h = y2 - y1;

  switch (drawing.type) {
    case "gann-box": {
      const cols = 8;
      const rows = 8;
      ctx.strokeRect(x1, y1, w, h);
      for (let i = 1; i < cols; i += 1) {
        const x = x1 + (w * i) / cols;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
      }
      for (let j = 1; j < rows; j += 1) {
        const y = y1 + (h * j) / rows;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
      break;
    }
    case "gann-square":
    case "gann-square-fixed": {
      ctx.strokeRect(x1, y1, w, h);
      const diag = clipLineThroughPoints({ x: x1, y: y2 }, { x: x2, y: y1 }, 0, rightX, 0, bottomY);
      strokeSegment(ctx, diag);
      const steps = 8;
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = x1 + w * t;
        const y = y1 + h * t;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
      break;
    }
    case "gann-fan": {
      const origin = { x: x1, y: y2 };
      for (const [rx, ry] of GANN_FAN_RATIOS) {
        const seg = clipLineThroughPoints(
          origin,
          { x: origin.x + rx * 40, y: origin.y - ry * 40 },
          0,
          rightX,
          0,
          bottomY,
        );
        strokeSegment(ctx, seg);
      }
      break;
    }
    default:
      break;
  }
}

/** @param {string} type */
export function isGannDrawingType(type) {
  return type === "gann-box" || type === "gann-fan" || type === "gann-square" || type === "gann-square-fixed";
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

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {number} right
 * @param {number} bottom
 */
export function hitGannDrawing(type, pts, px, py, threshold, right, bottom) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return false;

  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);

  if (type === "gann-box" || type === "gann-square" || type === "gann-square-fixed") {
    return (
      distToSegment(px, py, x1, y1, x2, y1) <= threshold ||
      distToSegment(px, py, x2, y1, x2, y2) <= threshold ||
      distToSegment(px, py, x2, y2, x1, y2) <= threshold ||
      distToSegment(px, py, x1, y2, x1, y1) <= threshold
    );
  }

  if (type === "gann-fan") {
    const origin = { x: x1, y: y2 };
    for (const [rx, ry] of GANN_FAN_RATIOS) {
      const seg = clipLineThroughPoints(
        origin,
        { x: origin.x + rx * 40, y: origin.y - ry * 40 },
        0,
        right,
        0,
        bottom,
      );
      if (distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold) return true;
    }
  }

  return false;
}
