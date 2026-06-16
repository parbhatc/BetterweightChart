import { applyColorOpacity } from "../../../ui/color/picker.js";
import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { newDrawingDefaults } from "../../toolbars/defaults/store.js";
import { extendedSegmentEndpoints, resolveExtendFlags } from "../line/extend.js";
import { LINE_STYLE_DASH } from "../../registry/tools.js";

/** @typedef {{ offset: number, enabled: boolean, lineWidth?: number, lineStyle?: number, color?: string, colorOpacity?: number }} ChannelLevel */

/** @returns {ChannelLevel[]} */
export function defaultChannelLevels() {
  return [
    { offset: -0.25, enabled: false, lineWidth: 1, lineStyle: 0 },
    { offset: 0, enabled: true, lineWidth: 2, lineStyle: 0 },
    { offset: 0.25, enabled: false, lineWidth: 1, lineStyle: 0 },
    { offset: 0.5, enabled: true, lineWidth: 1, lineStyle: 1 },
    { offset: 0.75, enabled: false, lineWidth: 1, lineStyle: 0 },
    { offset: 1, enabled: true, lineWidth: 2, lineStyle: 0 },
    { offset: 1.25, enabled: false, lineWidth: 1, lineStyle: 0 },
  ];
}

export const PARALLEL_CHANNEL_DEFAULTS = {
  extendLeft: false,
  extendRight: false,
  channelLevels: defaultChannelLevels(),
  showChannelBackground: true,
  channelBackgroundColor: DEFAULT_DRAWING_COLOR,
  channelBackgroundOpacity: 20,
};

/** @param {string} drawingType */
export function isParallelChannelTool(drawingType) {
  return drawingType === "parallel-channel";
}

/** @param {string} drawingType */
export function supportsParallelChannelSettings(drawingType) {
  return isParallelChannelTool(drawingType);
}

/**
 * @param {{ time: number, price: number }} p0
 * @param {{ time: number, price: number }} p1
 * @param {number} time
 */
export function interpolateBasePrice(p0, p1, time) {
  const dt = p1.time - p0.time;
  if (Math.abs(dt) < 1e-12) return p0.price;
  const t = (time - p0.time) / dt;
  return p0.price + (p1.price - p0.price) * t;
}

/**
 * @param {{ time: number, price: number }} p0
 * @param {{ time: number, price: number }} p1
 * @param {number} priceOffset
 * @param {number} level
 * @param {number} time
 */
export function priceAtLevel(p0, p1, priceOffset, level, time) {
  return interpolateBasePrice(p0, p1, time) + level * priceOffset;
}

/**
 * @param {{ time: number, price: number }} p0
 * @param {{ time: number, price: number }} p1
 * @param {{ time: number, price: number }} widthPoint
 */
export function computePriceOffset(p0, p1, widthPoint) {
  return widthPoint.price - interpolateBasePrice(p0, p1, widthPoint.time);
}

/**
 * @param {{ time: number, price: number }} p0
 * @param {{ time: number, price: number }} p1
 * @param {number} priceOffset
 * @param {number} [time]
 */
export function widthAnchorPoint(p0, p1, priceOffset, time) {
  const t = time ?? (p0.time + p1.time) / 2;
  return { time: t, price: priceAtLevel(p0, p1, priceOffset, 1, t) };
}

/**
 * Six handles: bottom L/R, top L/R, bottom mid, top mid.
 * @param {import("../../types.js").UserDrawing} drawing
 * @returns {import("../../types.js").DrawPoint[]}
 */
export function parallelChannelAnchorPoints(drawing) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0 || !p1) return drawing.points ?? [];

  const priceOffset = resolvePriceOffset(drawing);
  const midTime = (p0.time + p1.time) / 2;

  return [
    p0,
    p1,
    { time: p0.time, price: priceAtLevel(p0, p1, priceOffset, 1, p0.time) },
    { time: p1.time, price: priceAtLevel(p0, p1, priceOffset, 1, p1.time) },
    { time: midTime, price: priceAtLevel(p0, p1, priceOffset, 0, midTime) },
    { time: midTime, price: priceAtLevel(p0, p1, priceOffset, 1, midTime) },
  ];
}

/**
 * Channel width from cursor price only — top rail stays aligned with A/B bars.
 * @param {{ time: number, price: number }} p0 point A
 * @param {{ time: number, price: number }} p1 point B
 * @param {{ price: number }} cursor
 */
export function priceOffsetFromVerticalCursor(p0, p1, cursor) {
  return cursor.price - interpolateBasePrice(p0, p1, p0.time);
}

/**
 * @param {string} type
 * @param {import("../../types.js").DrawPoint[]} points
 * @param {Record<string, unknown>} [overrides]
 */
export function parallelChannelDraft(type, points, overrides = {}) {
  return finalizeParallelChannelDrawing({
    type,
    points,
    ...newDrawingDefaults(type),
    ...overrides,
  });
}

/**
 * @param {string} type
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint | null} cursor
 */
export function buildParallelChannelPreview(type, staged, cursor) {
  if (!staged.length || !cursor) return null;
  const p0 = staged[0];
  if (staged.length === 1) {
    return parallelChannelDraft(type, [p0, cursor], { priceOffset: 0 });
  }
  const p1 = staged[1];
  const priceOffset = priceOffsetFromVerticalCursor(p0, p1, cursor);
  return parallelChannelDraft(type, [p0, p1], { priceOffset });
}

/** @param {import("../../types.js").DrawPoint} p0 @param {import("../../types.js").DrawPoint} p1 @param {number} priceOffset */
export function parallelChannelPointsFromGeometry(p0, p1, priceOffset) {
  const p2 = widthAnchorPoint(p0, p1, priceOffset);
  return [p0, p1, p2];
}

/**
 * @param {number} anchorIndex
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {number} startPriceOffset
 * @param {import("../../types.js").DrawPoint} point
 * @param {import("../../types.js").DrawPoint | null} startMid
 */
export function parallelChannelDragUpdate(anchorIndex, p0, p1, startPriceOffset, point, startMid) {
  if (anchorIndex === 0) {
    return { points: parallelChannelPointsFromGeometry(point, p1, startPriceOffset), priceOffset: startPriceOffset };
  }
  if (anchorIndex === 1) {
    return { points: parallelChannelPointsFromGeometry(p0, point, startPriceOffset), priceOffset: startPriceOffset };
  }
  if (anchorIndex === 2) {
    const priceOffset = priceOffsetFromVerticalCursor(p0, p1, point);
    return { points: parallelChannelPointsFromGeometry(p0, p1, priceOffset), priceOffset };
  }
  if (anchorIndex === 3) {
    const priceOffset = point.price - interpolateBasePrice(p0, p1, p1.time);
    return { points: parallelChannelPointsFromGeometry(p0, p1, priceOffset), priceOffset };
  }
  if (anchorIndex === 4) {
    const mid =
      startMid ??
      parallelChannelAnchorPoints({ type: "parallel-channel", points: [p0, p1], priceOffset: startPriceOffset })[4];
    const dt = point.time - mid.time;
    const dp = point.price - mid.price;
    const newP0 = { time: p0.time + dt, price: p0.price + dp };
    const newP1 = { time: p1.time + dt, price: p1.price + dp };
    return {
      points: parallelChannelPointsFromGeometry(newP0, newP1, startPriceOffset),
      priceOffset: startPriceOffset,
    };
  }
  if (anchorIndex === 5) {
    const priceOffset = priceOffsetFromVerticalCursor(p0, p1, point);
    return { points: parallelChannelPointsFromGeometry(p0, p1, priceOffset), priceOffset };
  }
  return { points: parallelChannelPointsFromGeometry(p0, p1, startPriceOffset), priceOffset: startPriceOffset };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function resolvePriceOffset(drawing) {
  if (drawing.priceOffset != null && Number.isFinite(Number(drawing.priceOffset))) {
    return Number(drawing.priceOffset);
  }
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  const p2 = drawing.points?.[2];
  if (p0 && p1 && p2) return computePriceOffset(p0, p1, p2);
  return 0;
}

/** @param {ChannelLevel[] | undefined} levels */
export function normalizeChannelLevels(levels) {
  const defaults = defaultChannelLevels();
  if (!Array.isArray(levels) || !levels.length) return defaults;
  return defaults.map((def, i) => {
    const src = levels[i] ?? levels.find((l) => l.offset === def.offset) ?? def;
    return {
      offset: Number.isFinite(Number(src.offset)) ? Number(src.offset) : def.offset,
      enabled: Boolean(src.enabled),
      lineWidth: src.lineWidth ?? def.lineWidth ?? 1,
      lineStyle: src.lineStyle ?? def.lineStyle ?? 0,
      color: src.color,
      colorOpacity: src.colorOpacity,
    };
  });
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeParallelChannelDrawing(drawing) {
  if (!isParallelChannelTool(drawing.type)) return drawing;
  const pts = drawing.points ?? [];
  if (pts.length < 2) return drawing;

  const levels = normalizeChannelLevels(drawing.channelLevels);
  let priceOffset = drawing.priceOffset;
  if ((priceOffset == null || !Number.isFinite(Number(priceOffset))) && pts.length >= 3) {
    priceOffset = computePriceOffset(pts[0], pts[1], pts[2]);
  }
  if (priceOffset == null || !Number.isFinite(Number(priceOffset))) priceOffset = 0;

  const widthPt = widthAnchorPoint(pts[0], pts[1], Number(priceOffset));

  return {
    ...PARALLEL_CHANNEL_DEFAULTS,
    ...drawing,
    priceOffset: Number(priceOffset),
    channelLevels: levels,
    showChannelBackground:
      drawing.showChannelBackground ?? PARALLEL_CHANNEL_DEFAULTS.showChannelBackground,
    channelBackgroundColor:
      drawing.channelBackgroundColor ??
      drawing.color ??
      PARALLEL_CHANNEL_DEFAULTS.channelBackgroundColor,
    channelBackgroundOpacity:
      drawing.channelBackgroundOpacity ?? PARALLEL_CHANNEL_DEFAULTS.channelBackgroundOpacity,
    points: [pts[0], pts[1], widthPt],
  };
}

/**
 * @param {{ time: number, price: number }} p0
 * @param {{ time: number, price: number }} p1
 * @param {number} priceOffset
 * @param {number} level
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {{ extendLeft: boolean, extendRight: boolean }} extend
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 */
export function levelSegmentPixels(p0, p1, priceOffset, level, timeToX, priceToY, extend, left, right, bottom) {
  const price0 = priceAtLevel(p0, p1, priceOffset, level, p0.time);
  const price1 = priceAtLevel(p0, p1, priceOffset, level, p1.time);
  const x0 = timeToX(p0.time);
  const x1 = timeToX(p1.time);
  const y0 = priceToY(price0);
  const y1 = priceToY(price1);
  if (x0 == null || x1 == null || y0 == null || y1 == null) return null;
  return extendedSegmentEndpoints({ x: x0, y: y0 }, { x: x1, y: y1 }, extend, left, right, bottom);
}

/** @param {ChannelLevel[]} levels */
export function channelBackgroundLevelBounds(levels) {
  const normalized = normalizeChannelLevels(levels);
  let min = 0;
  let max = 1;
  for (const level of normalized) {
    if (!level.enabled) continue;
    if (level.offset < min) min = level.offset;
    if (level.offset > max) max = level.offset;
  }
  return { min, max };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 */
export function renderParallelChannelDrawing(ctx, drawing, timeToX, priceToY, left, right, bottom) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0 || !p1) return;

  const priceOffset = resolvePriceOffset(drawing);
  const extend = resolveExtendFlags(drawing);
  const levels = normalizeChannelLevels(drawing.channelLevels);
  const baseColor = drawing.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = drawing.colorOpacity ?? 100;

  if (drawing.showChannelBackground) {
    const { min: bgMin, max: bgMax } = channelBackgroundLevelBounds(levels);
    const segLow = levelSegmentPixels(p0, p1, priceOffset, bgMin, timeToX, priceToY, extend, left, right, bottom);
    const segHigh = levelSegmentPixels(p0, p1, priceOffset, bgMax, timeToX, priceToY, extend, left, right, bottom);
    if (segLow && segHigh) {
      const bgColor = drawing.channelBackgroundColor ?? baseColor;
      const bgOpacity = drawing.channelBackgroundOpacity ?? 20;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(segLow.x1, segLow.y1);
      ctx.lineTo(segLow.x2, segLow.y2);
      ctx.lineTo(segHigh.x2, segHigh.y2);
      ctx.lineTo(segHigh.x1, segHigh.y1);
      ctx.closePath();
      ctx.fillStyle = applyColorOpacity(bgColor, bgOpacity);
      ctx.fill();
      ctx.restore();
    }
  }

  for (const level of levels) {
    if (!level.enabled) continue;
    const seg = levelSegmentPixels(
      p0,
      p1,
      priceOffset,
      level.offset,
      timeToX,
      priceToY,
      extend,
      left,
      right,
      bottom,
    );
    if (!seg) continue;

    const color = level.color ?? baseColor;
    const opacity = level.colorOpacity ?? baseOpacity;
    const lw = level.lineWidth ?? drawing.lineWidth ?? 2;
    const dash = LINE_STYLE_DASH[level.lineStyle ?? drawing.lineStyle ?? 0] ?? [];

    ctx.save();
    ctx.strokeStyle = applyColorOpacity(color, opacity);
    ctx.lineWidth = lw;
    if (dash.length) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} right
 * @param {number} bottom
 * @param {(px: number, py: number, x1: number, y1: number, x2: number, y2: number) => number} distToSegment
 */
export function hitParallelChannelDrawing(
  drawing,
  px,
  py,
  threshold,
  timeToX,
  priceToY,
  right,
  bottom,
  distToSegment,
) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0 || !p1 || !timeToX || !priceToY) return false;

  const priceOffset = resolvePriceOffset(drawing);
  const extend = resolveExtendFlags(drawing);
  const levels = normalizeChannelLevels(drawing.channelLevels);

  for (const level of levels) {
    if (!level.enabled) continue;
    const seg = levelSegmentPixels(p0, p1, priceOffset, level.offset, timeToX, priceToY, extend, 0, right, bottom);
    if (!seg) continue;
    if (distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold) return true;
  }
  return false;
}
