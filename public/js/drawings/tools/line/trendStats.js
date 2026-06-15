import { fmtDrawingPrice } from "./info.js";
import { trendAngleSecondPoint } from "./trendAngle.js";

export const STATS_FIELD_ITEMS = [
  { id: "priceRange", label: "Price range" },
  { id: "percentChange", label: "Percent change" },
  { id: "pipsChange", label: "Change in pips" },
  { id: "barsRange", label: "Bars range" },
  { id: "dateTimeRange", label: "Date/time range" },
  { id: "distance", label: "Distance" },
  { id: "angle", label: "Angle" },
];

export const STATS_POSITION_ITEMS = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
  { id: "auto", label: "Auto" },
];

const FONT_SIZE = 12;
const BOX_PAD_X = 8;
const BOX_PAD_Y = 6;
const ICON_W = 14;
const TEXT_GAP = 5;
const ROW_GAP = 2;
const ANCHOR_OFFSET = 10;

/** @type {CanvasRenderingContext2D | null} */
let measureCtx = null;

function getMeasureCtx() {
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  return measureCtx;
}

/** @param {number} sec */
export function formatDurationTv(sec) {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  const mins = Math.round((sec % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** @type {readonly string[]} */
export const TREND_LINE_FAMILY_TYPES = ["trend-line", "ray", "info-line", "extended-line", "trend-angle"];

/** @param {string} drawingType */
export function isTrendLineFamilyType(drawingType) {
  return TREND_LINE_FAMILY_TYPES.includes(drawingType);
}

/** @returns {Record<string, boolean>} */
export function defaultStatsFields() {
  return Object.fromEntries(STATS_FIELD_ITEMS.map((item) => [item.id, false]));
}

/** @returns {Record<string, boolean>} */
export function allStatsFieldsEnabled() {
  return Object.fromEntries(STATS_FIELD_ITEMS.map((item) => [item.id, true]));
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function resolveStatsFields(drawing) {
  if (drawing.statsFields && typeof drawing.statsFields === "object") {
    return { ...defaultStatsFields(), ...drawing.statsFields };
  }
  if (drawing.type === "info-line") {
    return allStatsFieldsEnabled();
  }
  if (drawing.statsMode === "always" || drawing.statsMode === "on-select") {
    return {
      priceRange: true,
      percentChange: true,
      pipsChange: true,
      barsRange: true,
      dateTimeRange: true,
      distance: true,
      angle: true,
    };
  }
  return defaultStatsFields();
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function hasEnabledStats(drawing) {
  const fields = resolveStatsFields(drawing);
  return STATS_FIELD_ITEMS.some((item) => fields[item.id]);
}

/** @param {import("../../types.js").UserDrawing} drawing @param {boolean} isSelected */
export function shouldShowTrendLineStats(drawing, isSelected) {
  if (!isTrendLineFamilyType(drawing.type)) return false;
  if (!hasEnabledStats(drawing)) return false;
  if (drawing.alwaysShowStats) return true;
  return Boolean(isSelected);
}

/** @param {Record<string, boolean>} statsFields */
export function statsSummaryLabel(statsFields) {
  const enabled = STATS_FIELD_ITEMS.filter((item) => statsFields[item.id]);
  if (!enabled.length) return "Hidden";
  if (enabled.length === 1) return enabled[0].label;
  return `${enabled.length} selected`;
}

/** @param {number} precision */
function pipSizeForPrecision(precision) {
  if (precision >= 4) return 10 ** -(precision - 1);
  return 10 ** -Math.max(0, precision);
}

/**
 * @param {{ price: number, time: number }} p0
 * @param {{ price: number, time: number }} p1
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} barSec
 * @param {number} precision
 */
export function computeTrendLineStatValues(p0, p1, a, b, barSec, precision) {
  const priceDiff = p1.price - p0.price;
  const pct = p0.price !== 0 ? (priceDiff / p0.price) * 100 : 0;
  const pxDist = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(a.y - b.y, b.x - a.x) * (180 / Math.PI);
  const sec = barSec > 0 ? barSec : 60;
  const timeSec = Math.abs(p1.time - p0.time);
  const barCount = Math.max(0, Math.round(timeSec / sec));
  const pipSize = pipSizeForPrecision(precision);
  const pips = pipSize !== 0 ? priceDiff / pipSize : 0;

  return {
    priceRange: fmtDrawingPrice(Math.abs(priceDiff), precision),
    percentChange: Math.abs(pct).toFixed(2),
    pipsChange: String(Math.round(Math.abs(pips))),
    barsRange: String(barCount),
    dateTimeRange: formatDurationTv(timeSec),
    distance: String(Math.round(pxDist)),
    angle: angle.toFixed(2),
  };
}

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
export function resolveStatsBoxBelow(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return true;
  return dy > 0;
}

/** @param {Record<string, boolean>} fields @param {ReturnType<typeof computeTrendLineStatValues>} values */
export function buildTrendLineStatBadges(fields, values) {
  /** @type {{ id: string, text: string }[]} */
  const badges = [];

  const hasRow1 = fields.priceRange || fields.percentChange || fields.pipsChange;
  if (hasRow1) {
    const chunks = [];
    if (fields.priceRange) chunks.push(values.priceRange);
    if (fields.percentChange) chunks.push(`(${values.percentChange}%)`);
    let combo = chunks.join(" ");
    if (fields.pipsChange) combo = combo ? `${combo}, ${values.pipsChange}` : values.pipsChange;
    badges.push({ id: "priceRange", text: combo });
  }

  const hasRow2 = fields.barsRange || fields.dateTimeRange || fields.distance;
  if (hasRow2) {
    let text = "";
    if (fields.barsRange) {
      text = `${values.barsRange} bars`;
      if (fields.dateTimeRange) text += ` (${values.dateTimeRange})`;
    } else if (fields.dateTimeRange) {
      text = values.dateTimeRange;
    }
    if (fields.distance) {
      const dist = `distance: ${values.distance} px`;
      text = text ? `${text}, ${dist}` : dist;
    }
    badges.push({ id: "barsRange", text });
  }

  if (fields.angle) badges.push({ id: "angle", text: `${values.angle}°` });

  return badges;
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function resolveStatsAnchor(drawing, a, b) {
  const position = drawing.statsPosition ?? "auto";
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (position === "left") return { x: a.x, y: a.y, align: "left" };
  if (position === "center") return { x: mid.x, y: mid.y, align: "center" };
  if (position === "right") return { x: b.x, y: b.y, align: "right" };
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (p0 && p1 && p1.time < p0.time) {
    return { x: a.x, y: a.y, align: "left" };
  }
  return { x: b.x, y: b.y, align: "right" };
}

/**
 * @param {{ id: string, text: string }[]} badges
 * @param {CanvasRenderingContext2D} [ctx]
 */
function measureStatRows(badges, ctx = getMeasureCtx()) {
  if (!ctx) return [];
  ctx.font = `600 ${FONT_SIZE}px system-ui, sans-serif`;
  const rowH = FONT_SIZE + 4;
  return badges.map((badge) => {
    const textW = ctx.measureText(badge.text).width;
    const rowW = BOX_PAD_X + ICON_W + TEXT_GAP + textW + BOX_PAD_X;
    return { ...badge, textW, rowW, rowH };
  });
}

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b @param {boolean} below */
function lineSideNormal(a, b, below) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (below) {
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
  } else if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ id: string, text: string }[]} badges
 */
export function layoutTrendLineStatsBox(drawing, a, b, badges) {
  if (!badges.length) return null;

  const rows = measureStatRows(badges);
  const width = Math.max(...rows.map((row) => row.rowW));
  const height =
    BOX_PAD_Y * 2 + rows.reduce((sum, row) => sum + row.rowH, 0) + ROW_GAP * Math.max(0, rows.length - 1);

  const anchor = resolveStatsAnchor(drawing, a, b);
  const boxBelow = resolveStatsBoxBelow(a, b);
  const { nx, ny } = lineSideNormal(a, b, boxBelow);
  const ox = drawing.statsOffsetX ?? 0;
  const oy = drawing.statsOffsetY ?? 0;
  let x;
  if (anchor.align === "left") x = anchor.x + ox;
  else if (anchor.align === "right") x = anchor.x - width + ox;
  else x = anchor.x - width / 2 + ox;

  x += nx * ANCHOR_OFFSET;
  const y = boxBelow
    ? anchor.y + ny * ANCHOR_OFFSET + oy
    : anchor.y + ny * ANCHOR_OFFSET - height + oy;

  return { x, y, width, height, rows, anchor, boxBelow };
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {string} color */
function drawPriceRangeIcon(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.15;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.moveTo(x - 2.5, y - 2.5);
  ctx.lineTo(x, y - 5);
  ctx.lineTo(x + 2.5, y - 2.5);
  ctx.moveTo(x - 2.5, y + 2.5);
  ctx.lineTo(x, y + 5);
  ctx.lineTo(x + 2.5, y + 2.5);
  ctx.moveTo(x - 5, y - 2);
  ctx.lineTo(x + 5, y - 2);
  ctx.moveTo(x - 5, y + 2);
  ctx.lineTo(x + 5, y + 2);
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {string} color */
function drawBarsRangeIcon(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.moveTo(x - 3, y - 2.5);
  ctx.lineTo(x - 5, y);
  ctx.lineTo(x - 3, y + 2.5);
  ctx.moveTo(x + 3, y - 2.5);
  ctx.lineTo(x + 5, y);
  ctx.lineTo(x + 3, y + 2.5);
  ctx.moveTo(x - 5, y - 4);
  ctx.lineTo(x - 5, y + 4);
  ctx.moveTo(x + 5, y - 4);
  ctx.lineTo(x + 5, y + 4);
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {string} color */
function drawAngleIcon(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 3);
  ctx.lineTo(x + 4, y + 3);
  ctx.lineTo(x + 4, y - 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 4, y + 3, 3.5, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {string} id @param {number} x @param {number} y @param {string} color */
function drawStatIcon(ctx, id, x, y, color) {
  if (id === "priceRange") drawPriceRangeIcon(ctx, x, y, color);
  else if (id === "barsRange") drawBarsRangeIcon(ctx, x, y, color);
  else if (id === "angle") drawAngleIcon(ctx, x, y, color);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ id: string, text: string }[]} badges
 * @param {import("../../types.js").UserDrawing} drawing
 */
export function drawTrendLineStatBadges(ctx, a, b, badges, drawing) {
  const layout = layoutTrendLineStatsBox(drawing, a, b, badges);
  if (!layout) return;

  const { x, y, width, height, rows } = layout;
  const labelColor = "#E0E3EB";

  ctx.save();
  ctx.fillStyle = "rgba(28, 30, 38, 0.96)";
  ctx.strokeStyle = "rgba(120, 123, 134, 0.55)";
  ctx.lineWidth = 1;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  }

  ctx.font = `600 ${FONT_SIZE}px system-ui, sans-serif`;
  let rowY = y + BOX_PAD_Y;
  rows.forEach((row, index) => {
    if (index > 0) rowY += ROW_GAP;
    const iconX = x + BOX_PAD_X + ICON_W / 2;
    const textX = x + BOX_PAD_X + ICON_W + TEXT_GAP;
    drawStatIcon(ctx, row.id, iconX, rowY + row.rowH / 2, labelColor);
    ctx.fillStyle = labelColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(row.text, textX, rowY + row.rowH / 2);
    rowY += row.rowH;
  });
  ctx.restore();
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ barSec?: number, precision?: number, isSelected?: boolean }} state
 */
export function hitTrendLineStatsBox(drawing, px, py, a, b, state) {
  if (!shouldShowTrendLineStats(drawing, state.isSelected)) return false;
  if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return false;

  const barSec = state.barSec ?? 60;
  const precision = state.precision ?? 2;
  const p0 = drawing.points[0];
  let p1 = drawing.points[1];
  if (!p1 && drawing.type === "trend-angle") {
    p1 = trendAngleSecondPoint(drawing);
  }
  if (!p0 || !p1) return false;

  const fields = resolveStatsFields(drawing);
  const values = computeTrendLineStatValues(p0, p1, a, b, barSec, precision);
  const badges = buildTrendLineStatBadges(fields, values);
  const layout = layoutTrendLineStatsBox(drawing, a, b, badges);
  if (!layout) return false;

  return px >= layout.x && px <= layout.x + layout.width && py >= layout.y && py <= layout.y + layout.height;
}
