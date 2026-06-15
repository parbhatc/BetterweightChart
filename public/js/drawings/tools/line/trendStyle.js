import {
  resolveStatsFields,
  shouldShowTrendLineStats,
  computeTrendLineStatValues,
  drawTrendLineStatBadges,
  buildTrendLineStatBadges,
  isTrendLineFamilyType,
} from "./trendStats.js";
import { trendAngleSecondPoint } from "./trendAngle.js";

export {
  STATS_FIELD_ITEMS,
  STATS_POSITION_ITEMS,
  statsSummaryLabel,
  defaultStatsFields,
  allStatsFieldsEnabled,
  isTrendLineFamilyType,
  TREND_LINE_FAMILY_TYPES,
  resolveStatsFields,
  buildTrendLineStatBadges,
  hitTrendLineStatsBox,
  shouldShowTrendLineStats,
} from "./trendStats.js";

export const LINE_END_NORMAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M8.5 13.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 0H24"></path></svg>`;

export const LINE_END_ARROW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M4.5 13.5H24m-19.5 0L8 17m-3.5-3.5L8 10"></path></svg>`;

export const LINE_END_ITEMS = [
  { id: "normal", label: "Normal", icon: LINE_END_NORMAL_ICON },
  { id: "arrow", label: "Arrow", icon: LINE_END_ARROW_ICON },
];

/** @param {string} drawingType */
export function supportsTrendLineStyleSettings(drawingType) {
  return isTrendLineFamilyType(drawingType);
}

/** @param {number} lineWidth */
export function arrowWingSpan(lineWidth) {
  return Math.max(11, lineWidth * 5);
}

/**
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @param {"normal" | "arrow" | undefined} leftEnd
 * @param {"normal" | "arrow" | undefined} rightEnd
 * @param {number} lineWidth
 */
export function trimSegmentForArrowEnds(x1, y1, x2, y2, leftEnd, rightEnd, lineWidth) {
  void leftEnd;
  void rightEnd;
  void lineWidth;
  return { x1, y1, x2, y2 };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x1: number, y1: number, x2: number, y2: number }} segment
 * @param {"normal" | "arrow" | undefined} leftEnd
 * @param {"normal" | "arrow" | undefined} rightEnd
 * @param {number} lineWidth
 */
export function strokeTrendLineShaft(ctx, segment, leftEnd, rightEnd, lineWidth) {
  const trimmed = trimSegmentForArrowEnds(
    segment.x1,
    segment.y1,
    segment.x2,
    segment.y2,
    leftEnd,
    rightEnd,
    lineWidth,
  );
  const hasArrow = leftEnd === "arrow" || rightEnd === "arrow";
  ctx.save();
  if (hasArrow) ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(trimmed.x1, trimmed.y1);
  ctx.lineTo(trimmed.x2, trimmed.y2);
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} outwardAngle
 * @param {string} color
 * @param {number} lineWidth
 */
function drawArrowHead(ctx, x, y, outwardAngle, color, lineWidth) {
  const span = arrowWingSpan(lineWidth);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(outwardAngle + Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(span, -span);
  ctx.moveTo(0, 0);
  ctx.lineTo(span, span);
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ x1: number, y1: number, x2: number, y2: number }} segment
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {string} color
 * @param {number} lineWidth
 * @param {{ isSelected?: boolean, barSec?: number, precision?: number }} state
 */
export function drawTrendLineDecorations(ctx, drawing, segment, a, b, color, lineWidth, state) {
  const { x1, y1, x2, y2 } = segment;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const leftEnd = drawing.leftEnd ?? "normal";
  const rightEnd = drawing.rightEnd ?? "normal";

  if (leftEnd === "arrow") {
    drawArrowHead(ctx, x1, y1, angle + Math.PI, color, lineWidth);
  }
  if (rightEnd === "arrow") {
    drawArrowHead(ctx, x2, y2, angle, color, lineWidth);
  }

  if (drawing.showMiddlePoint) {
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(midX, midY, Math.max(2.5, lineWidth * 0.9), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const points = drawing.points;
  const p0 = points[0];
  let p1 = points[1];
  if (!p1 && drawing.type === "trend-angle") {
    p1 = trendAngleSecondPoint(drawing);
  }
  if (!p0 || !p1) return;

  const precision = state.precision ?? 2;

  if (!shouldShowTrendLineStats(drawing, state.isSelected)) return;
  if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return;

  const barSec = state.barSec ?? 60;
  const fields = resolveStatsFields(drawing);
  const values = computeTrendLineStatValues(p0, p1, a, b, barSec, precision);
  const badges = buildTrendLineStatBadges(fields, values);
  drawTrendLineStatBadges(ctx, a, b, badges, drawing);
}
