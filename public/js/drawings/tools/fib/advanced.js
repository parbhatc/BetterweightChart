import { applyColorOpacity } from "../../../ui/color/picker.js";
import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { clipLineThroughPoints, strokeSegment } from "../line/math.js";
import { LINE_STYLE_DASH } from "../../registry/tools.js";
import {
  fibTimeZoneLabelLayout,
  finalizeFibRetracementDrawing,
  formatFibLevelOffset,
  normalizeFibLevels,
} from "./retracement.js";

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 */
function trendBasedFibTimeGeometry(drawing, timeToX) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  const p2 = normalized.points?.[2];
  if (!p0 || !p1 || !p2) return null;

  const ax = timeToX(p0.time);
  const bx = timeToX(p1.time);
  const cx = timeToX(p2.time);
  if (ax == null || bx == null || cx == null) return null;

  const unitSpan = bx - ax;
  const levels = normalizeFibLevels(normalized.fibLevels, normalized.type)
    .filter((l) => l.enabled)
    .map((level) => ({
      level,
      x: cx + unitSpan * level.offset,
    }))
    .sort((a, b) => a.x - b.x);

  const ay = null;
  const by = null;
  const cy = null;
  return { normalized, p0, p1, p2, ax, bx, cx, unitSpan, levels };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottomY
 * @param {{ precision?: number }} [state]
 */
export function renderTrendBasedFibTimeDrawing(
  ctx,
  drawing,
  timeToX,
  priceToY,
  leftX,
  rightX,
  bottomY,
  state = {},
) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  const p2 = normalized.points?.[2];
  if (!p0 || !p1 || !p2) return;

  const ax = timeToX(p0.time);
  const ay = priceToY(p0.price);
  const bx = timeToX(p1.time);
  const by = priceToY(p1.price);
  const cx = timeToX(p2.time);
  const cy = priceToY(p2.price);
  if ([ax, ay, bx, by, cx, cy].some((v) => v == null)) return;

  const geom = trendBasedFibTimeGeometry(drawing, timeToX);
  if (!geom) return;

  const { levels } = geom;
  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  const useOne = Boolean(normalized.fibUseOneColor);
  const lw = normalized.fibLevelsLineWidth ?? 2;
  const dash = LINE_STYLE_DASH[normalized.fibLevelsLineStyle ?? 0] ?? [];
  const displayMode = normalized.fibLevelsDisplayMode === "percents" ? "percents" : "values";
  const fontSize = normalized.fontSize ?? 12;
  const topY = 0;
  const visible = levels.filter((item) => item.x >= leftX - 1 && item.x <= rightX + 1);

  if (normalized.showFibBackground !== false && visible.length >= 2) {
    for (let i = 0; i < visible.length - 1; i += 1) {
      const left = visible[i];
      const right = visible[i + 1];
      const fillColor = applyColorOpacity(
        useOne ? baseColor : left.level.color ?? baseColor,
        normalized.fibBackgroundOpacity ?? 20,
      );
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.fillRect(left.x, topY, right.x - left.x, bottomY - topY);
      ctx.restore();
    }
  }

  for (const item of visible) {
    const color = applyColorOpacity(
      useOne ? baseColor : item.level.color ?? baseColor,
      useOne ? baseOpacity : item.level.colorOpacity ?? baseOpacity,
    );
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    if (dash.length) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(item.x, topY);
    ctx.lineTo(item.x, bottomY);
    ctx.stroke();
    ctx.restore();

    if (normalized.showFibLevelLabels !== false) {
      const label = formatFibLevelOffset(item.level.offset, displayMode);
      const layout = fibTimeZoneLabelLayout(
        normalized.fibLabelAlignH ?? "right",
        normalized.fibLabelAlignV ?? "bottom",
        item.x,
        topY,
        bottomY,
        fontSize,
      );
      ctx.save();
      ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = layout.textAlign;
      ctx.textBaseline = layout.textBaseline;
      ctx.fillText(label, layout.x, layout.y);
      ctx.restore();
    }
  }

  if (normalized.showFibTrendLine !== false) {
    const trendColor = applyColorOpacity(
      normalized.fibTrendLineColor ?? "#808080",
      normalized.fibTrendLineOpacity ?? 100,
    );
    const trendDash = LINE_STYLE_DASH[normalized.fibTrendLineStyle ?? 1] ?? [4, 4];
    ctx.save();
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = normalized.fibTrendLineWidth ?? 2;
    ctx.setLineDash(trendDash);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
function fibCirclesGeometry(drawing, timeToX, priceToY) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return null;

  const ax = timeToX(p0.time);
  const ay = priceToY(p0.price);
  const bx = timeToX(p1.time);
  const by = priceToY(p1.price);
  if ([ax, ay, bx, by].some((v) => v == null)) return null;

  const rx0 = Math.abs(bx - ax);
  const ry0 = Math.abs(by - ay);
  const angle = Math.atan2(by - ay, bx - ax);
  const levels = normalizeFibLevels(normalized.fibLevels, normalized.type).filter((l) => l.enabled);
  return { normalized, ax, ay, rx0, ry0, angle, levels };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
export function renderFibCirclesDrawing(ctx, drawing, timeToX, priceToY) {
  const geom = fibCirclesGeometry(drawing, timeToX, priceToY);
  if (!geom) return;
  const { normalized, ax, ay, rx0, ry0, angle, levels } = geom;
  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  const useOne = Boolean(normalized.fibUseOneColor);
  const lw = normalized.fibLevelsLineWidth ?? 2;
  const dash = LINE_STYLE_DASH[normalized.fibLevelsLineStyle ?? 0] ?? [];
  const displayMode = normalized.fibLevelsDisplayMode === "percents" ? "percents" : "values";
  const fontSize = normalized.fontSize ?? 12;
  const sorted = [...levels].sort((a, b) => a.offset - b.offset);

  if (normalized.showFibBackground !== false && sorted.length >= 2) {
    for (let i = sorted.length - 1; i >= 1; i -= 1) {
      const outer = sorted[i];
      const inner = sorted[i - 1];
      const fillColor = applyColorOpacity(
        useOne ? baseColor : outer.color ?? baseColor,
        normalized.fibBackgroundOpacity ?? 20,
      );
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.ellipse(ax, ay, rx0 * outer.offset, ry0 * outer.offset, angle, 0, Math.PI * 2);
      ctx.ellipse(ax, ay, rx0 * inner.offset, ry0 * inner.offset, angle, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.restore();
    }
  }

  for (const level of sorted) {
    const { offset, color, colorOpacity, enabled } = level;
    if (!enabled) continue;
    const strokeColor = applyColorOpacity(
      useOne ? baseColor : color ?? baseColor,
      useOne ? baseOpacity : colorOpacity ?? baseOpacity,
    );
    const rx = rx0 * offset;
    const ry = ry0 * offset;
    if (rx < 1 && ry < 1) continue;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw;
    if (dash.length) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.ellipse(ax, ay, rx, ry, angle, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (normalized.showFibLevelLabels !== false) {
      const label = formatFibLevelOffset(offset, displayMode);
      const lx = ax + Math.cos(angle) * rx;
      const ly = ay + Math.sin(angle) * ry;
      ctx.save();
      ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
      ctx.fillStyle = strokeColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx + 4, ly);
      ctx.restore();
    }
  }

  if (normalized.showFibTrendLine !== false) {
    const trendColor = applyColorOpacity(
      normalized.fibTrendLineColor ?? "#808080",
      normalized.fibTrendLineOpacity ?? 100,
    );
    const trendDash = LINE_STYLE_DASH[normalized.fibTrendLineStyle ?? 1] ?? [4, 4];
    ctx.save();
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = normalized.fibTrendLineWidth ?? 2;
    ctx.setLineDash(trendDash);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(angle) * rx0, ay + Math.sin(angle) * ry0);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
export function renderFibSpiralDrawing(ctx, drawing, timeToX, priceToY) {
  const geom = fibCirclesGeometry(drawing, timeToX, priceToY);
  if (!geom) return;
  const { normalized, ax, ay, rx0, ry0, angle, levels } = geom;
  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  const useOne = Boolean(normalized.fibUseOneColor);
  const lw = normalized.fibLevelsLineWidth ?? 2;
  const maxR = Math.hypot(rx0, ry0);
  const turns = 3;
  const steps = 240;

  ctx.save();
  ctx.strokeStyle = applyColorOpacity(baseColor, baseOpacity);
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const theta = t * Math.PI * 2 * turns;
    const r = maxR * (t ** 1.1);
    const x = ax + Math.cos(angle + theta) * r * (rx0 / maxR || 1);
    const y = ay + Math.sin(angle + theta) * r * (ry0 / maxR || 1);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  const sorted = [...levels].sort((a, b) => a.offset - b.offset);
  for (const { offset, color, colorOpacity } of sorted) {
    const strokeColor = applyColorOpacity(
      useOne ? baseColor : color ?? baseColor,
      useOne ? baseOpacity : colorOpacity ?? baseOpacity,
    );
    const targetR = maxR * offset;
    let bestI = 0;
    let bestDiff = Infinity;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const r = maxR * (t ** 1.1);
      const diff = Math.abs(r - targetR);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestI = i;
      }
    }
    const t = bestI / steps;
    const theta = t * Math.PI * 2 * turns;
    const r = maxR * (t ** 1.1);
    const x = ax + Math.cos(angle + theta) * r * (rx0 / maxR || 1);
    const y = ay + Math.sin(angle + theta) * r * (ry0 / maxR || 1);
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (normalized.showFibTrendLine !== false) {
    const trendColor = applyColorOpacity(
      normalized.fibTrendLineColor ?? "#808080",
      normalized.fibTrendLineOpacity ?? 100,
    );
    const trendDash = LINE_STYLE_DASH[normalized.fibTrendLineStyle ?? 1] ?? [4, 4];
    ctx.save();
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = normalized.fibTrendLineWidth ?? 2;
    ctx.setLineDash(trendDash);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(angle) * rx0, ay + Math.sin(angle) * ry0);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
function fibWedgeGeometry(drawing, timeToX, priceToY) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  const p2 = normalized.points?.[2];
  if (!p0 || !p1 || !p2) return null;

  const a = { x: timeToX(p0.time), y: priceToY(p0.price) };
  const b = { x: timeToX(p1.time), y: priceToY(p1.price) };
  const c = { x: timeToX(p2.time), y: priceToY(p2.price) };
  if ([a.x, a.y, b.x, b.y, c.x, c.y].some((v) => v == null)) return null;

  const angB = Math.atan2(b.y - a.y, b.x - a.x);
  const angC = Math.atan2(c.y - a.y, c.x - a.x);
  const levels = normalizeFibLevels(normalized.fibLevels, normalized.type).filter((l) => l.enabled);
  return { normalized, a, b, c, angB, angC, levels };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} rightX
 * @param {number} bottomY
 */
export function renderFibWedgeDrawing(ctx, drawing, timeToX, priceToY, rightX, bottomY) {
  const geom = fibWedgeGeometry(drawing, timeToX, priceToY);
  if (!geom) return;
  const { normalized, a, b, c, angB, angC, levels } = geom;
  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  const useOne = Boolean(normalized.fibUseOneColor);
  const lw = normalized.fibLevelsLineWidth ?? 2;
  const dash = LINE_STYLE_DASH[normalized.fibLevelsLineStyle ?? 0] ?? [];
  const displayMode = normalized.fibLevelsDisplayMode === "percents" ? "percents" : "values";
  const fontSize = normalized.fontSize ?? 12;
  const maxLen = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));

  const rays = levels.map((level) => {
    const ang = angB + (angC - angB) * level.offset;
    const end = { x: a.x + Math.cos(ang) * maxLen * 2, y: a.y + Math.sin(ang) * maxLen * 2 };
    const seg = clipLineThroughPoints(a, end, 0, rightX, 0, bottomY);
    return { level, seg, ang };
  });

  if (normalized.showFibBackground !== false && rays.length >= 2) {
    for (let i = 0; i < rays.length - 1; i += 1) {
      const r0 = rays[i];
      const r1 = rays[i + 1];
      const fillColor = applyColorOpacity(
        useOne ? baseColor : r0.level.color ?? baseColor,
        normalized.fibBackgroundOpacity ?? 20,
      );
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(r0.seg.x2, r0.seg.y2);
      ctx.lineTo(r1.seg.x2, r1.seg.y2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  for (const { level, seg } of rays) {
    const color = applyColorOpacity(
      useOne ? baseColor : level.color ?? baseColor,
      useOne ? baseOpacity : level.colorOpacity ?? baseOpacity,
    );
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    if (dash.length) ctx.setLineDash(dash);
    strokeSegment(ctx, seg);
    ctx.restore();

    if (normalized.showFibLevelLabels !== false) {
      const label = formatFibLevelOffset(level.offset, displayMode);
      const midX = (a.x + seg.x2) / 2;
      const midY = (a.y + seg.y2) / 2;
      ctx.save();
      ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX + 4, midY);
      ctx.restore();
    }
  }

  if (normalized.showFibTrendLine !== false) {
    const trendColor = applyColorOpacity(
      normalized.fibTrendLineColor ?? "#808080",
      normalized.fibTrendLineOpacity ?? 100,
    );
    const trendDash = LINE_STYLE_DASH[normalized.fibTrendLineStyle ?? 1] ?? [4, 4];
    ctx.save();
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = normalized.fibTrendLineWidth ?? 2;
    ctx.setLineDash(trendDash);
    const base = clipLineThroughPoints(a, b, 0, rightX, 0, bottomY);
    const top = clipLineThroughPoints(a, c, 0, rightX, 0, bottomY);
    strokeSegment(ctx, base);
    strokeSegment(ctx, top);
    ctx.restore();
  }
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

/** @param {import("../../types.js").UserDrawing} drawing @param {number} px @param {number} py @param {number} threshold @param {(t: number) => number | null} timeToX @param {(p: number) => number | null} priceToY @param {number} right @param {number} bottom */
export function hitTrendBasedFibTimeDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom) {
  const geom = trendBasedFibTimeGeometry(drawing, timeToX);
  if (!geom) return false;
  for (const item of geom.levels) {
    if (Math.abs(px - item.x) <= threshold) return true;
  }
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  const p2 = drawing.points?.[2];
  if (!p0 || !p1 || !p2) return false;
  const ax = timeToX(p0.time);
  const ay = priceToY(p0.price);
  const bx = timeToX(p1.time);
  const by = priceToY(p1.price);
  const cx = timeToX(p2.time);
  const cy = priceToY(p2.price);
  if ([ax, ay, bx, by, cx, cy].some((v) => v == null)) return false;
  if (distToSegment(px, py, ax, ay, bx, by) <= threshold) return true;
  return distToSegment(px, py, bx, by, cx, cy) <= threshold;
}

/** @param {import("../../types.js").UserDrawing} drawing @param {number} px @param {number} py @param {number} threshold @param {(t: number) => number | null} timeToX @param {(p: number) => number | null} priceToY */
export function hitFibCirclesDrawing(drawing, px, py, threshold, timeToX, priceToY) {
  const geom = fibCirclesGeometry(drawing, timeToX, priceToY);
  if (!geom) return false;
  const { ax, ay, rx0, ry0, angle, levels } = geom;
  const dx = px - ax;
  const dy = py - ay;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  for (const level of levels) {
    const rx = rx0 * level.offset;
    const ry = ry0 * level.offset;
    if (rx < 1 && ry < 1) continue;
    const norm = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
    const d = Math.abs(Math.sqrt(norm) - 1) * Math.min(rx, ry);
    if (d <= threshold) return true;
  }
  return false;
}

/** @param {import("../../types.js").UserDrawing} drawing @param {number} px @param {number} py @param {number} threshold @param {(t: number) => number | null} timeToX @param {(p: number) => number | null} priceToY */
export function hitFibSpiralDrawing(drawing, px, py, threshold, timeToX, priceToY) {
  const geom = fibCirclesGeometry(drawing, timeToX, priceToY);
  if (!geom) return false;
  const { ax, ay, rx0, ry0, angle } = geom;
  return distToSegment(px, py, ax, ay, ax + Math.cos(angle) * rx0, ay + Math.sin(angle) * ry0) <= threshold * 2;
}

/** @param {import("../../types.js").UserDrawing} drawing @param {number} px @param {number} py @param {number} threshold @param {(t: number) => number | null} timeToX @param {(p: number) => number | null} priceToY @param {number} right @param {number} bottom */
export function hitFibWedgeDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom) {
  const geom = fibWedgeGeometry(drawing, timeToX, priceToY);
  if (!geom) return false;
  const { a, b, c, angB, angC, levels } = geom;
  const maxLen = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
  for (const level of levels) {
    const ang = angB + (angC - angB) * level.offset;
    const end = { x: a.x + Math.cos(ang) * maxLen * 2, y: a.y + Math.sin(ang) * maxLen * 2 };
    const seg = clipLineThroughPoints(a, end, 0, right, 0, bottom);
    if (distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold) return true;
  }
  const base = clipLineThroughPoints(a, b, 0, right, 0, bottom);
  const top = clipLineThroughPoints(a, c, 0, right, 0, bottom);
  return (
    distToSegment(px, py, base.x1, base.y1, base.x2, base.y2) <= threshold ||
    distToSegment(px, py, top.x1, top.y1, top.x2, top.y2) <= threshold
  );
}
