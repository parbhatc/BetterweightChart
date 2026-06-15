import { applyColorOpacity } from "../../../ui/color/picker.js";
import { newDrawingDefaults } from "../../toolbars/defaults/store.js";
import { extendedSegmentEndpoints, resolveExtendFlags } from "../line/extend.js";
import { strokeTrendLineShaft } from "../line/trendStyle.js";

export const FLAT_TOP_BOTTOM_COLOR = "#ff9800";

const CHANNEL_LINE_DEFAULTS = {
  extendLeft: false,
  extendRight: false,
  showChannelBackground: true,
  channelBackgroundColor: FLAT_TOP_BOTTOM_COLOR,
  channelBackgroundOpacity: 20,
  showPriceLabels: false,
  leftEnd: "normal",
  rightEnd: "normal",
};

export const FLAT_TOP_BOTTOM_DEFAULTS = {
  ...CHANNEL_LINE_DEFAULTS,
  color: FLAT_TOP_BOTTOM_COLOR,
  channelBackgroundColor: FLAT_TOP_BOTTOM_COLOR,
};

/** @param {string} drawingType */
export function isFlatTopBottomTool(drawingType) {
  return drawingType === "flat-top-bottom";
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

/** @param {import("../../types.js").UserDrawing} drawing */
export function resolveFlatPrice(drawing) {
  if (drawing.flatPrice != null && Number.isFinite(Number(drawing.flatPrice))) {
    return Number(drawing.flatPrice);
  }
  const p2 = drawing.points?.[2];
  if (p2 && Number.isFinite(p2.price)) return p2.price;
  return 0;
}

/**
 * Four handles: slope L/R, flat L/R (flat handles move vertically only).
 * @param {import("../../types.js").UserDrawing} drawing
 * @returns {import("../../types.js").DrawPoint[]}
 */
export function flatTopBottomAnchorPoints(drawing) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0 || !p1) return drawing.points ?? [];

  const flatPrice = resolveFlatPrice(drawing);
  return [
    p0,
    p1,
    { time: p0.time, price: flatPrice },
    { time: p1.time, price: flatPrice },
  ];
}

/** @param {{ price: number }} cursor */
export function flatPriceFromVerticalCursor(cursor) {
  return cursor.price;
}

/**
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {number} flatPrice
 */
export function flatTopBottomPointsFromGeometry(p0, p1, flatPrice) {
  return [p0, p1, { time: p1.time, price: flatPrice }];
}

/**
 * @param {string} type
 * @param {import("../../types.js").DrawPoint[]} points
 * @param {Record<string, unknown>} [overrides]
 */
export function flatTopBottomDraft(type, points, overrides = {}) {
  return finalizeFlatTopBottomDrawing({
    type,
    points,
    ...newDrawingDefaults(type),
    ...FLAT_TOP_BOTTOM_DEFAULTS,
    ...overrides,
  });
}

/**
 * @param {string} type
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint | null} cursor
 */
export function buildFlatTopBottomPreview(type, staged, cursor) {
  if (!staged.length || !cursor) return null;
  const p0 = staged[0];
  if (staged.length === 1) {
    return flatTopBottomDraft(type, [p0, cursor], { flatPrice: cursor.price });
  }
  const p1 = staged[1];
  const flatPrice = flatPriceFromVerticalCursor(cursor);
  return flatTopBottomDraft(type, [p0, p1], { flatPrice });
}

/**
 * @param {number} anchorIndex
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {number} startFlatPrice
 * @param {import("../../types.js").DrawPoint} point
 */
export function flatTopBottomDragUpdate(anchorIndex, p0, p1, startFlatPrice, point) {
  if (anchorIndex === 0) {
    return {
      points: flatTopBottomPointsFromGeometry(point, p1, startFlatPrice),
      flatPrice: startFlatPrice,
    };
  }
  if (anchorIndex === 1) {
    return {
      points: flatTopBottomPointsFromGeometry(p0, point, startFlatPrice),
      flatPrice: startFlatPrice,
    };
  }
  if (anchorIndex === 2 || anchorIndex === 3) {
    const flatPrice = point.price;
    return {
      points: flatTopBottomPointsFromGeometry(p0, p1, flatPrice),
      flatPrice,
    };
  }
  return {
    points: flatTopBottomPointsFromGeometry(p0, p1, startFlatPrice),
    flatPrice: startFlatPrice,
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
function normalizeFlatTopBottomDrawing(drawing) {
  const color = drawing.color ?? FLAT_TOP_BOTTOM_COLOR;
  return {
    ...CHANNEL_LINE_DEFAULTS,
    ...drawing,
    channelBackgroundColor: drawing.channelBackgroundColor ?? color,
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeFlatTopBottomDrawing(drawing) {
  if (!isFlatTopBottomTool(drawing.type)) return drawing;
  const pts = drawing.points ?? [];
  if (pts.length < 2) return normalizeFlatTopBottomDrawing({ ...FLAT_TOP_BOTTOM_DEFAULTS, ...drawing });

  let flatPrice = drawing.flatPrice;
  if ((flatPrice == null || !Number.isFinite(Number(flatPrice))) && pts.length >= 3) {
    flatPrice = pts[2].price;
  }
  if (flatPrice == null || !Number.isFinite(Number(flatPrice))) flatPrice = pts[1].price;

  return normalizeFlatTopBottomDrawing({
    ...FLAT_TOP_BOTTOM_DEFAULTS,
    ...drawing,
    flatPrice: Number(flatPrice),
    color: drawing.color ?? FLAT_TOP_BOTTOM_COLOR,
    channelBackgroundColor:
      drawing.channelBackgroundColor ?? drawing.color ?? FLAT_TOP_BOTTOM_COLOR,
    points: flatTopBottomPointsFromGeometry(pts[0], pts[1], Number(flatPrice)),
  });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {import("../../types.js").UserDrawing} drawing
 */
function strokeChannelSegment(ctx, a, b, drawing) {
  const segment = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  strokeTrendLineShaft(ctx, segment, drawing.leftEnd, drawing.rightEnd, drawing.lineWidth ?? 2);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottomY
 */
export function renderFlatTopBottomDrawing(ctx, drawing, timeToX, priceToY, leftX, rightX, bottomY) {
  const normalized = finalizeFlatTopBottomDrawing(drawing);
  const points = normalized.points ?? [];
  const p0 = points[0];
  const p1 = points[1];
  if (!p0 || !p1) return;

  const a = { x: timeToX(p0.time), y: priceToY(p0.price) };
  const b = { x: timeToX(p1.time), y: priceToY(p1.price) };
  if ([a.x, a.y, b.x, b.y].some((v) => v == null)) return;

  const flatPrice = resolveFlatPrice(normalized);
  const flatY = priceToY(flatPrice);
  if (flatY == null) return;

  const extend = resolveExtendFlags(normalized);
  const slopeSeg = extendedSegmentEndpoints(
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    extend,
    leftX,
    rightX,
    bottomY,
  );

  const flatX1 = extend.extendLeft ? leftX : Math.min(a.x, b.x);
  const flatX2 = extend.extendRight ? rightX : Math.max(a.x, b.x);

  if (normalized.showChannelBackground !== false) {
    const yAt = (x) => {
      const dx = b.x - a.x;
      if (Math.abs(dx) < 0.001) return a.y;
      const t = (x - a.x) / dx;
      return a.y + (b.y - a.y) * t;
    };
    const xStart = Math.min(slopeSeg.x1, slopeSeg.x2, flatX1);
    const xEnd = Math.max(slopeSeg.x1, slopeSeg.x2, flatX2);
    const bgColor = normalized.channelBackgroundColor ?? normalized.color ?? FLAT_TOP_BOTTOM_COLOR;
    const bgOpacity = normalized.channelBackgroundOpacity ?? 20;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xStart, yAt(xStart));
    ctx.lineTo(xEnd, yAt(xEnd));
    ctx.lineTo(xEnd, flatY);
    ctx.lineTo(xStart, flatY);
    ctx.closePath();
    ctx.fillStyle = applyColorOpacity(bgColor, bgOpacity);
    ctx.fill();
    ctx.restore();
  }

  strokeChannelSegment(ctx, { x: slopeSeg.x1, y: slopeSeg.y1 }, { x: slopeSeg.x2, y: slopeSeg.y2 }, normalized);
  strokeChannelSegment(ctx, { x: flatX1, y: flatY }, { x: flatX2, y: flatY }, normalized);
}
