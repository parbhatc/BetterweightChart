import { applyColorOpacity } from "../../ui/colorPicker.js";
import { DEFAULT_DRAWING_COLOR } from "../constants.js";
import { clipLineThroughPoints, parallelLineThrough, strokeSegment } from "./lineMath.js";

export const FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618, 4.236];
export const FIB_TIME_RATIOS = [0, 1, 1.618, 2.618, 4.236, 6.854];
export const FIB_FAN_RATIOS = [0.382, 0.5, 0.618, 0.786, 1];
export const FIB_CIRCLE_RATIOS = [0.382, 0.5, 0.618, 1];

/** @param {CanvasRenderingContext2D} ctx @param {object} drawing */
function labelStyle(ctx, drawing) {
  const base = drawing.textColor ?? drawing.color ?? DEFAULT_DRAWING_COLOR;
  ctx.font = "500 10px system-ui,sans-serif";
  ctx.fillStyle = applyColorOpacity(base, drawing.textColorOpacity ?? drawing.colorOpacity ?? 100);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} rightX
 * @param {number[]} levels
 */
export function drawFibHorizontalLevels(ctx, drawing, a, b, rightX, levels) {
  const x1 = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bot = Math.max(a.y, b.y);
  const range = bot - top;
  labelStyle(ctx, drawing);
  for (const lvl of levels) {
    const y = bot - range * lvl;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(rightX, y);
    ctx.stroke();
    ctx.fillText(String(lvl), rightX + 4, y + 3);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} rightX
 * @param {number} bottomY
 */
export function renderFibDrawing(ctx, drawing, pts, rightX, bottomY) {
  const a = pts[0];
  const b = pts[1];
  const c = pts[2];
  if (!a) return;

  switch (drawing.type) {
    case "fib-retracement":
      if (b) drawFibHorizontalLevels(ctx, drawing, a, b, rightX, FIB_RETRACEMENT_LEVELS);
      break;
    case "fib-extension":
      if (b && c) {
        const ab = b.y - a.y;
        const x1 = Math.min(a.x, c.x);
        labelStyle(ctx, drawing);
        for (const lvl of FIB_EXTENSION_LEVELS) {
          const y = c.y - ab * lvl;
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(rightX, y);
          ctx.stroke();
          ctx.fillText(String(lvl), rightX + 4, y + 3);
        }
      }
      break;
    case "fib-channel":
      if (b && c) {
        const base = clipLineThroughPoints(a, b, 0, rightX, 0, bottomY);
        const top = parallelLineThrough(c, a, b, 0, rightX, 0, bottomY);
        strokeSegment(ctx, base);
        strokeSegment(ctx, top);
        const y0 = base.y1;
        const y1 = top.y1;
        const topY = Math.min(y0, y1);
        const botY = Math.max(y0, y1);
        const range = botY - topY;
        labelStyle(ctx, drawing);
        for (const lvl of FIB_RETRACEMENT_LEVELS) {
          const y = botY - range * lvl;
          ctx.beginPath();
          ctx.moveTo(Math.min(a.x, b.x), y);
          ctx.lineTo(rightX, y);
          ctx.stroke();
        }
      }
      break;
    case "fib-time-zone":
      if (b) {
        const span = b.x - a.x;
        labelStyle(ctx, drawing);
        for (const r of FIB_TIME_RATIOS) {
          const x = a.x + span * r;
          if (x < 0 || x > rightX) continue;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, bottomY);
          ctx.stroke();
        }
      }
      break;
    case "fib-speed-fan":
      if (b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        for (const r of FIB_FAN_RATIOS) {
          const seg = clipLineThroughPoints(
            a,
            { x: a.x + dx * r, y: a.y + dy * r },
            0,
            rightX,
            0,
            bottomY,
          );
          strokeSegment(ctx, seg);
        }
      }
      break;
    case "fib-circles":
      if (b) {
        const r0 = Math.hypot(b.x - a.x, b.y - a.y);
        for (const r of FIB_CIRCLE_RATIOS) {
          const rad = r0 * r;
          if (rad < 2) continue;
          ctx.beginPath();
          ctx.arc(a.x, a.y, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    case "fib-arcs":
    case "fib-speed-resistance-arcs":
      if (b) {
        const r0 = Math.hypot(b.x - a.x, b.y - a.y);
        for (const r of FIB_CIRCLE_RATIOS) {
          const rad = r0 * r;
          if (rad < 2) continue;
          ctx.beginPath();
          ctx.arc(a.x, a.y, rad, Math.PI, 0);
          ctx.stroke();
        }
      }
      break;
    case "fib-spiral":
      if (b) {
        const turns = 2.5;
        const maxR = Math.hypot(b.x - a.x, b.y - a.y);
        ctx.beginPath();
        for (let t = 0; t <= 100; t += 1) {
          const ang = (t / 100) * Math.PI * 2 * turns;
          const r = (t / 100) * maxR;
          const x = a.x + Math.cos(ang) * r;
          const y = a.y + Math.sin(ang) * r;
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    case "trend-based-fib-time":
      if (b && c) {
        const span = c.x - a.x;
        labelStyle(ctx, drawing);
        for (const r of FIB_TIME_RATIOS) {
          const x = a.x + span * r;
          if (x < 0 || x > rightX) continue;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, bottomY);
          ctx.stroke();
        }
        const seg = clipLineThroughPoints(a, b, 0, rightX, 0, bottomY);
        strokeSegment(ctx, seg);
      }
      break;
    case "fib-wedge":
      if (b && c) {
        const seg = clipLineThroughPoints(a, b, 0, rightX, 0, bottomY);
        strokeSegment(ctx, seg);
        const left = clipLineThroughPoints(a, c, 0, rightX, 0, bottomY);
        const right = clipLineThroughPoints(b, c, 0, rightX, 0, bottomY);
        strokeSegment(ctx, left);
        strokeSegment(ctx, right);
      }
      break;
    case "pitchfan":
      if (b && c) {
        const lines = [
          clipLineThroughPoints(a, b, 0, rightX, 0, bottomY),
          clipLineThroughPoints(a, c, 0, rightX, 0, bottomY),
          clipLineThroughPoints(a, { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }, 0, rightX, 0, bottomY),
        ];
        lines.forEach((seg) => strokeSegment(ctx, seg));
      }
      break;
    default:
      break;
  }
}

/** @param {string} type */
export function isFibDrawingType(type) {
  return (
    type === "fib-retracement" ||
    type === "fib-extension" ||
    type === "fib-channel" ||
    type === "fib-time-zone" ||
    type === "fib-speed-fan" ||
    type === "fib-circles" ||
    type === "fib-arcs" ||
    type === "fib-spiral" ||
    type === "trend-based-fib-time" ||
    type === "fib-wedge" ||
    type === "fib-speed-resistance-arcs" ||
    type === "pitchfan"
  );
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
export function hitFibDrawing(type, pts, px, py, threshold, right, bottom) {
  const a = pts[0];
  const b = pts[1];
  const c = pts[2];
  if (!a) return false;

  if (type === "fib-retracement" && b) {
    const top = Math.min(a.y, b.y);
    const bot = Math.max(a.y, b.y);
    for (const lvl of FIB_RETRACEMENT_LEVELS) {
      const y = bot - (bot - top) * lvl;
      if (Math.abs(py - y) <= threshold && px >= Math.min(a.x, b.x) - threshold) return true;
    }
    return false;
  }

  if ((type === "fib-extension" || type === "fib-channel") && b && c) {
    const top = Math.min(a.y, b.y, c.y);
    const bot = Math.max(a.y, b.y, c.y);
    for (let i = 0; i <= 10; i += 1) {
      const y = top + ((bot - top) * i) / 10;
      if (Math.abs(py - y) <= threshold && px >= Math.min(a.x, b.x, c.x) - threshold) return true;
    }
    if (type === "fib-channel") {
      const base = clipLineThroughPoints(a, b, 0, right, 0, bottom);
      const topLine = parallelLineThrough(c, a, b, 0, right, 0, bottom);
      if (
        distToSegment(px, py, base.x1, base.y1, base.x2, base.y2) <= threshold ||
        distToSegment(px, py, topLine.x1, topLine.y1, topLine.x2, topLine.y2) <= threshold
      ) {
        return true;
      }
    }
    return false;
  }

  if (type === "fib-time-zone" && b) {
    const span = b.x - a.x;
    for (const r of FIB_TIME_RATIOS) {
      const x = a.x + span * r;
      if (Math.abs(px - x) <= threshold) return true;
    }
    return false;
  }

  if (type === "fib-speed-fan" && b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const r of FIB_FAN_RATIOS) {
      const seg = clipLineThroughPoints(a, { x: a.x + dx * r, y: a.y + dy * r }, 0, right, 0, bottom);
      if (distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold) return true;
    }
    return false;
  }

  if ((type === "fib-circles" || type === "fib-arcs" || type === "fib-speed-resistance-arcs") && b) {
    const r0 = Math.hypot(b.x - a.x, b.y - a.y);
    for (const r of FIB_CIRCLE_RATIOS) {
      const rad = r0 * r;
      const d = Math.abs(Math.hypot(px - a.x, py - a.y) - rad);
      if (d <= threshold) return true;
    }
    return false;
  }

  if (type === "fib-spiral" && b) {
    return distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold * 2;
  }

  if (type === "trend-based-fib-time" && b && c) {
    const span = c.x - a.x;
    for (const r of FIB_TIME_RATIOS) {
      const x = a.x + span * r;
      if (Math.abs(px - x) <= threshold) return true;
    }
    const seg = clipLineThroughPoints(a, b, 0, right, 0, bottom);
    return distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold;
  }

  if (type === "fib-wedge" && b && c) {
    const lines = [
      clipLineThroughPoints(a, b, 0, right, 0, bottom),
      clipLineThroughPoints(a, c, 0, right, 0, bottom),
      clipLineThroughPoints(b, c, 0, right, 0, bottom),
    ];
    return lines.some((seg) => distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold);
  }

  if (type === "pitchfan" && b && c) {
    const lines = [
      clipLineThroughPoints(a, b, 0, right, 0, bottom),
      clipLineThroughPoints(a, c, 0, right, 0, bottom),
      clipLineThroughPoints(a, { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }, 0, right, 0, bottom),
    ];
    return lines.some((seg) => distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold);
  }

  if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
  return distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold;
}
