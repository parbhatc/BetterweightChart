import { applyColorOpacity } from "../../../ui/color/picker.js";
import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { clipLineThroughPoints, parallelLineThrough, strokeSegment } from "../line/math.js";

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
 * Legacy fib renderer — only used for types not handled by fibRetracementTools.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} rightX
 * @param {number} bottomY
 */
export function renderFibDrawing(ctx, drawing, pts, rightX, bottomY) {
  void ctx;
  void drawing;
  void pts;
  void rightX;
  void bottomY;
}

/** @param {string} type */
export function isFibDrawingType(type) {
  return false;
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

/** @param {string} type @param {{ x: number, y: number }[]} pts @param {number} px @param {number} py @param {number} threshold @param {number} right @param {number} bottom */
export function hitFibDrawing(type, pts, px, py, threshold, right, bottom) {
  void type;
  void pts;
  void px;
  void py;
  void threshold;
  void right;
  void bottom;
  return false;
}
