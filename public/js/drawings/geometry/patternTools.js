import { clipLineThroughPoints, strokeSegment } from "./lineMath.js";

const PATTERN_LABELS = {
  "xabcd-pattern": ["X", "A", "B", "C", "D"],
  "cypher-pattern": ["X", "A", "B", "C", "D"],
  "abcd-pattern": ["A", "B", "C", "D"],
  "triangle-pattern": ["A", "B", "C", "D"],
  "head-and-shoulders": ["L", "LS", "H", "RS", "R"],
  "three-drives": ["1", "2", "3", "4", "5", "6", "7"],
  "elliott-impulse": ["0", "1", "2", "3", "4", "5"],
  "elliott-correction": ["A", "B", "C", "D"],
  "elliott-triangle": ["A", "B", "C", "D", "E", "F"],
  "elliott-double-combo": ["W", "X", "Y", "Z"],
  "elliott-triple-combo": ["W", "X", "Y", "X2", "Z", "End"],
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

function drawPolyline(ctx, pts, close = false) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

function drawPointLabels(ctx, type, pts) {
  const labels = PATTERN_LABELS[type];
  if (!labels) return;
  ctx.font = "600 10px system-ui,sans-serif";
  ctx.fillStyle = ctx.strokeStyle;
  for (let i = 0; i < pts.length && i < labels.length; i += 1) {
    ctx.fillText(labels[i], pts[i].x + 5, pts[i].y - 5);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 * @param {number} bottom
 */
export function renderPatternDrawing(ctx, drawing, pts, right, bottom) {
  if (!pts.length) return;
  const type = drawing.type;

  switch (type) {
    case "xabcd-pattern":
    case "cypher-pattern":
    case "abcd-pattern":
      drawPolyline(ctx, pts);
      break;
    case "triangle-pattern":
      if (pts.length >= 4) {
        drawPolyline(ctx, [pts[0], pts[1]], false);
        drawPolyline(ctx, [pts[2], pts[3]], false);
        if (pts[0] && pts[2]) drawPolyline(ctx, [pts[0], pts[2]], false);
        if (pts[1] && pts[3]) drawPolyline(ctx, [pts[1], pts[3]], false);
      }
      break;
    case "head-and-shoulders":
      if (pts.length >= 5) {
        drawPolyline(ctx, pts.slice(0, 5));
        const neckline = clipLineThroughPoints(pts[0], pts[4], 0, right, 0, bottom);
        strokeSegment(ctx, neckline);
      }
      break;
    case "three-drives":
    case "elliott-impulse":
    case "elliott-correction":
    case "elliott-triangle":
    case "elliott-double-combo":
    case "elliott-triple-combo":
      drawPolyline(ctx, pts);
      break;
    case "cyclic-lines": {
      if (pts.length < 2) break;
      const span = Math.abs(pts[1].x - pts[0].x) || 40;
      const start = Math.min(pts[0].x, pts[1].x);
      for (let x = start; x <= right + span; x += span) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
      break;
    }
    case "time-cycles": {
      if (pts.length < 2) break;
      const span = Math.abs(pts[1].x - pts[0].x) || 50;
      const cy = (pts[0].y + pts[1].y) / 2;
      const start = Math.min(pts[0].x, pts[1].x);
      for (let cx = start; cx <= right + span; cx += span) {
        ctx.beginPath();
        ctx.arc(cx, cy, span / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "sine-line": {
      if (pts.length < 2) break;
      const x1 = pts[0].x;
      const x2 = pts[1].x;
      const midY = (pts[0].y + pts[1].y) / 2;
      const amp = Math.abs(pts[1].y - pts[0].y) / 2 || 20;
      const waves = 2;
      ctx.beginPath();
      for (let t = 0; t <= 100; t += 1) {
        const u = t / 100;
        const x = x1 + (x2 - x1) * u;
        const y = midY + Math.sin(u * Math.PI * 2 * waves) * amp;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    default:
      drawPolyline(ctx, pts);
  }

  drawPointLabels(ctx, type, pts);
}

/** @param {string} type */
export function isPatternDrawingType(type) {
  return (
    type === "xabcd-pattern" ||
    type === "cypher-pattern" ||
    type === "head-and-shoulders" ||
    type === "abcd-pattern" ||
    type === "triangle-pattern" ||
    type === "three-drives" ||
    type === "elliott-impulse" ||
    type === "elliott-correction" ||
    type === "elliott-triangle" ||
    type === "elliott-double-combo" ||
    type === "elliott-triple-combo" ||
    type === "cyclic-lines" ||
    type === "time-cycles" ||
    type === "sine-line"
  );
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
export function hitPatternDrawing(type, pts, px, py, threshold, right, bottom) {
  if (!pts.length) return false;

  for (let i = 0; i < pts.length; i += 1) {
    if (Math.hypot(px - pts[i].x, py - pts[i].y) <= threshold * 2) return true;
  }

  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
  }

  if (type === "head-and-shoulders" && pts.length >= 5) {
    const nl = clipLineThroughPoints(pts[0], pts[4], 0, right, 0, bottom);
    if (distToSegment(px, py, nl.x1, nl.y1, nl.x2, nl.y2) <= threshold) return true;
  }

  if (type === "triangle-pattern" && pts.length >= 4) {
    const extras = [
      [pts[0], pts[2]],
      [pts[1], pts[3]],
    ];
    for (const [a, b] of extras) {
      if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
    }
  }

  if (type === "cyclic-lines" && pts.length >= 2) {
    const span = Math.abs(pts[1].x - pts[0].x) || 40;
    const start = Math.min(pts[0].x, pts[1].x);
    for (let x = start; x <= right + span; x += span) {
      if (Math.abs(px - x) <= threshold) return true;
    }
  }

  return false;
}
