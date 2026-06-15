import { applyColorOpacity } from "../../../ui/color/picker.js";
import { strokeSegment } from "../line/math.js";

const CYCLE_TOOL_TYPES = new Set(["cyclic-lines", "time-cycles", "sine-line"]);

const CYCLE_DEFAULTS = {
  "cyclic-lines": { color: "#80CCDB" },
  "time-cycles": {
    color: "#159980",
    showCycleBackground: true,
    cycleBackgroundColor: "#6AA84F",
    cycleBackgroundOpacity: 50,
  },
  "sine-line": { color: "#159980" },
};

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function withDashed(ctx, fn) {
  const prev = ctx.getLineDash();
  ctx.setLineDash([5, 5]);
  fn();
  ctx.setLineDash(prev);
}

function resolveCycleStyle(drawing) {
  const defs = CYCLE_DEFAULTS[drawing.type] ?? {};
  const color = drawing.color ?? defs.color ?? "#159980";
  return {
    strokeColor: applyColorOpacity(color, drawing.colorOpacity ?? 100),
    lineWidth: drawing.lineWidth ?? 2,
    showBackground: drawing.showCycleBackground ?? defs.showCycleBackground ?? false,
    fillColor: applyColorOpacity(
      drawing.cycleBackgroundColor ?? defs.cycleBackgroundColor ?? color,
      drawing.cycleBackgroundOpacity ?? defs.cycleBackgroundOpacity ?? 50,
    ),
  };
}

/**
 * @param {number} origin
 * @param {number} span
 * @param {number} left
 * @param {number} right
 */
function cyclePositions(origin, span, left, right) {
  const positions = [];
  let x = origin;
  while (x > left - span) x -= span;
  for (; x <= right + span; x += span) positions.push(x);
  return positions;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }[]} pts
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 * @param {boolean} isPreview
 */
function renderCyclicLines(ctx, pts, left, right, bottom, isPreview) {
  if (pts.length < 1) return;
  if (pts.length < 2) {
    if (isPreview) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, 0);
      ctx.lineTo(pts[0].x, bottom);
      ctx.stroke();
    }
    return;
  }

  const span = Math.max(Math.abs(pts[1].x - pts[0].x), 1);
  const origin = pts[0].x;

  for (const x of cyclePositions(origin, span, left, right)) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  if (isPreview) {
    withDashed(ctx, () => strokeSegment(ctx, pts[0], pts[1]));
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }[]} pts
 * @param {number} left
 * @param {number} right
 * @param {ReturnType<typeof resolveCycleStyle>} style
 * @param {boolean} fillArches
 * @param {boolean} isPreview
 */
function renderArcCycles(ctx, pts, left, right, style, fillArches, isPreview) {
  if (pts.length < 1) return;
  if (pts.length < 2) {
    if (isPreview) {
      ctx.beginPath();
      ctx.moveTo(left, pts[0].y);
      ctx.lineTo(right, pts[0].y);
      ctx.stroke();
    }
    return;
  }

  const x0 = pts[0].x;
  const x1 = pts[1].x;
  const span = Math.max(Math.abs(x1 - x0), 1);
  const radius = span / 2;
  const baselineY = (pts[0].y + pts[1].y) / 2;
  const origin = Math.min(x0, x1);

  ctx.beginPath();
  ctx.moveTo(left, baselineY);
  ctx.lineTo(right, baselineY);
  ctx.stroke();

  let cx = origin + radius;
  while (cx - radius > left - span) cx -= span;

  for (; cx - radius <= right + span; cx += span) {
    if (fillArches && style.showBackground) {
      ctx.beginPath();
      ctx.moveTo(cx - radius, baselineY);
      ctx.arc(cx, baselineY, radius, Math.PI, 0, false);
      ctx.closePath();
      ctx.fillStyle = style.fillColor;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, baselineY, radius, Math.PI, 0, false);
    ctx.stroke();
  }

  if (isPreview) {
    withDashed(ctx, () => strokeSegment(ctx, pts[0], pts[1]));
  }
}

/** @param {string} type */
export function isCycleTool(type) {
  return CYCLE_TOOL_TYPES.has(type);
}

/** @param {string} type */
export function supportsCycleStyleSettings(type) {
  return isCycleTool(type);
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeCycleDrawing(drawing) {
  if (!isCycleTool(drawing.type)) return drawing;
  const defs = CYCLE_DEFAULTS[drawing.type] ?? {};
  const color = drawing.color ?? defs.color ?? "#159980";
  return {
    ...drawing,
    color,
    colorOpacity: drawing.colorOpacity ?? 100,
    lineWidth: drawing.lineWidth ?? 2,
    showCycleBackground: drawing.showCycleBackground ?? defs.showCycleBackground ?? false,
    cycleBackgroundColor: drawing.cycleBackgroundColor ?? defs.cycleBackgroundColor ?? color,
    cycleBackgroundOpacity: drawing.cycleBackgroundOpacity ?? defs.cycleBackgroundOpacity ?? 50,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 * @param {{ isPreview?: boolean }} [state]
 */
export function renderCycleDrawing(ctx, drawing, pts, left, right, bottom, state = {}) {
  if (!pts.length) return;
  const style = resolveCycleStyle(drawing);
  const isPreview = Boolean(state.isPreview);

  ctx.save();
  ctx.strokeStyle = style.strokeColor;
  ctx.fillStyle = style.fillColor;
  ctx.lineWidth = style.lineWidth;

  switch (drawing.type) {
    case "cyclic-lines":
      renderCyclicLines(ctx, pts, left, right, bottom, isPreview);
      break;
    case "time-cycles":
      renderArcCycles(ctx, pts, left, right, style, true, isPreview);
      break;
    case "sine-line":
      renderArcCycles(ctx, pts, left, right, style, false, isPreview);
      break;
    default:
      break;
  }
  ctx.restore();
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 */
export function hitCycleDrawing(type, pts, px, py, threshold, left, right, bottom) {
  if (!pts.length) return false;

  for (let i = 0; i < pts.length; i += 1) {
    if (Math.hypot(px - pts[i].x, py - pts[i].y) <= threshold * 2) return true;
  }

  if (type === "cyclic-lines" && pts.length >= 2) {
    const span = Math.max(Math.abs(pts[1].x - pts[0].x), 1);
    for (const x of cyclePositions(pts[0].x, span, left, right)) {
      if (Math.abs(px - x) <= threshold) return true;
    }
    if (distToSegment(px, py, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= threshold) return true;
    return false;
  }

  if ((type === "time-cycles" || type === "sine-line") && pts.length >= 2) {
    const x0 = pts[0].x;
    const x1 = pts[1].x;
    const span = Math.max(Math.abs(x1 - x0), 1);
    const radius = span / 2;
    const baselineY = (pts[0].y + pts[1].y) / 2;
    const origin = Math.min(x0, x1);

    if (Math.abs(py - baselineY) <= threshold && px >= left && px <= right) return true;

    let cx = origin + radius;
    while (cx - radius > left - span) cx -= span;
    for (; cx - radius <= right + span; cx += span) {
      const dx = px - cx;
      const dy = py - baselineY;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dist - radius) <= threshold && dy <= 0) return true;
      if (type === "time-cycles" && dy <= 0 && dy >= -radius && Math.abs(dx) <= radius + threshold) {
        return true;
      }
    }
    if (distToSegment(px, py, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= threshold) return true;
  }

  return false;
}
