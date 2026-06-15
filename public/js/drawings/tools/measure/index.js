import { fmtDrawingPrice } from "../line/info.js";
import { tickSizeForPrecision } from "../position/barrel.js";

export const MEASURE_TOOL_TYPES = new Set(["price-range", "date-range", "date-price-range"]);

export const MEASURE_STYLE_DEFAULTS = {
  color: "#2962FF",
  colorOpacity: 100,
  lineWidth: 2,
  showMeasureBackground: true,
  measureBackgroundColor: "#2962FF",
  measureBackgroundOpacity: 15,
  showMeasureBorder: false,
  showMeasureLabelBackground: true,
  measureLabelBgColor: "rgba(46, 46, 46, 0.92)",
  textColor: "#ffffff",
  fontSize: 12,
};

export const MEASURE_STATS_FIELD_ITEMS = {
  "price-range": [
    { id: "priceRange", label: "Price range" },
    { id: "percentChange", label: "Percent change" },
    { id: "pipsChange", label: "Change in pips" },
  ],
  "date-range": [
    { id: "barsRange", label: "Bars range" },
    { id: "dateTimeRange", label: "Date/time range" },
    { id: "volume", label: "Volume" },
  ],
  "date-price-range": [
    { id: "priceRange", label: "Price range" },
    { id: "percentChange", label: "Percent change" },
    { id: "pipsChange", label: "Change in pips" },
    { id: "barsRange", label: "Bars range" },
    { id: "dateTimeRange", label: "Date/time range" },
    { id: "volume", label: "Volume" },
  ],
};

/** @param {string} type */
export function isMeasureTool(type) {
  return MEASURE_TOOL_TYPES.has(type);
}

/** @param {string} type */
export function supportsMeasureStyleSettings(type) {
  return isMeasureTool(type);
}

/** @param {string} type */
export function defaultMeasureStatsFields(type) {
  const items = MEASURE_STATS_FIELD_ITEMS[type] ?? [];
  return Object.fromEntries(items.map((item) => [item.id, true]));
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function resolveMeasureStatsFields(drawing) {
  const defaults = defaultMeasureStatsFields(drawing.type);
  if (drawing.measureStatsFields && typeof drawing.measureStatsFields === "object") {
    return { ...defaults, ...drawing.measureStatsFields };
  }
  return defaults;
}

/** @param {Record<string, boolean>} fields @param {string} type */
export function measureStatsSummaryLabel(fields, type) {
  const items = MEASURE_STATS_FIELD_ITEMS[type] ?? [];
  const enabled = items.filter((item) => fields[item.id]);
  if (!enabled.length) return "Hidden";
  if (enabled.length <= 3) return enabled.map((item) => item.label).join(", ");
  return `${enabled.length} selected`;
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function measureDraftFromDrawing(drawing) {
  return {
    ...MEASURE_STYLE_DEFAULTS,
    color: drawing.color ?? MEASURE_STYLE_DEFAULTS.color,
    colorOpacity: drawing.colorOpacity ?? MEASURE_STYLE_DEFAULTS.colorOpacity,
    lineWidth: drawing.lineWidth ?? MEASURE_STYLE_DEFAULTS.lineWidth,
    showMeasureBackground: drawing.showMeasureBackground !== false,
    measureBackgroundColor: drawing.measureBackgroundColor ?? MEASURE_STYLE_DEFAULTS.measureBackgroundColor,
    measureBackgroundOpacity: drawing.measureBackgroundOpacity ?? MEASURE_STYLE_DEFAULTS.measureBackgroundOpacity,
    showMeasureBorder: Boolean(drawing.showMeasureBorder),
    showMeasureLabelBackground: drawing.showMeasureLabelBackground !== false,
    measureLabelBgColor: drawing.measureLabelBgColor ?? MEASURE_STYLE_DEFAULTS.measureLabelBgColor,
    textColor: drawing.textColor ?? MEASURE_STYLE_DEFAULTS.textColor,
    fontSize: drawing.fontSize ?? MEASURE_STYLE_DEFAULTS.fontSize,
    measureStatsFields: resolveMeasureStatsFields(drawing),
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeMeasureDrawing(drawing) {
  return { ...measureDraftFromDrawing(drawing), ...drawing };
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

/** @param {number} sec */
function formatMeasureDuration(sec) {
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  if (days > 0 && hours > 0) return `${sign}${days}d ${hours}h`;
  if (days > 0) return `${sign}${days}d`;
  if (hours > 0 && minutes > 0) return `${sign}${hours}h ${minutes}m`;
  if (hours > 0) return `${sign}${hours}h`;
  if (minutes > 0) return `${sign}${minutes}m`;
  return `${sign}${Math.round(abs)}s`;
}

/** @param {number} v */
function formatMeasureVolume(v) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)} B`;
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)} M`;
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(2)} K`;
  return String(Math.round(abs));
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ barSec?: number, precision?: number, bars?: { time: number, volume?: number }[] }} ctx
 */
export function computeMeasureStatValues(drawing, ctx = {}) {
  const p0 = drawing.points[0];
  const p1 = drawing.points[1];
  if (!p0 || !p1) {
    return { priceLine: "", timeLine: "", volumeLine: "" };
  }

  const precision = ctx.precision ?? 2;
  const barSec = ctx.barSec ?? 60;
  const tick = tickSizeForPrecision(precision);
  const priceDiff = p1.price - p0.price;
  const absPrice = Math.abs(priceDiff);
  const pct = p0.price !== 0 ? (priceDiff / p0.price) * 100 : 0;
  const pips = tick > 0 ? Math.round(absPrice / tick) : 0;
  const priceSign = priceDiff >= 0 ? "" : "-";

  const tStart = Math.min(p0.time, p1.time);
  const tEnd = Math.max(p0.time, p1.time);
  const timeDelta = p1.time - p0.time;
  const timeSign = timeDelta < 0 ? "-" : "";

  let barCount = 0;
  const bars = ctx.bars ?? [];
  for (const bar of bars) {
    if (bar.time >= tStart && bar.time <= tEnd) barCount += 1;
  }
  if (!barCount && barSec > 0) {
    barCount = Math.max(1, Math.round(Math.abs(timeDelta) / barSec));
  }
  const signedBars = `${timeSign}${barCount} bars`;

  let volume = 0;
  for (const bar of bars) {
    if (bar.time >= tStart && bar.time <= tEnd && bar.volume != null) {
      volume += bar.volume;
    }
  }

  const priceParts = [];
  priceParts.push(`${priceSign}${fmtDrawingPrice(absPrice, precision)}`);
  priceParts.push(`(${Math.abs(pct).toFixed(2)}%)`);
  priceParts.push(Math.round(pips).toLocaleString());

  return {
    priceLine: priceParts.join(" "),
    timeLine: `${signedBars}, ${formatMeasureDuration(timeDelta)}`,
    volumeLine: `Vol ${formatMeasureVolume(volume)}`,
    priceRange: `${priceSign}${fmtDrawingPrice(absPrice, precision)}`,
    percentChange: `${Math.abs(pct).toFixed(2)}%`,
    pipsChange: String(pips),
    barsRange: signedBars,
    dateTimeRange: formatMeasureDuration(timeDelta),
    volume: formatMeasureVolume(volume),
  };
}

/**
 * @param {string} type
 * @param {Record<string, boolean>} fields
 * @param {ReturnType<typeof computeMeasureStatValues>} values
 */
export function buildMeasureStatLines(type, fields, values) {
  /** @type {string[]} */
  const lines = [];

  if (type === "price-range") {
    const chunks = [];
    if (fields.priceRange) chunks.push(values.priceRange);
    if (fields.percentChange) chunks.push(`(${values.percentChange})`);
    if (fields.pipsChange) chunks.push(values.pipsChange);
    if (chunks.length) lines.push(chunks.join(" "));
    return lines;
  }

  if (type === "date-range") {
    const timeChunks = [];
    if (fields.barsRange) timeChunks.push(values.barsRange);
    if (fields.dateTimeRange) timeChunks.push(values.dateTimeRange);
    if (timeChunks.length) lines.push(timeChunks.join(", "));
    if (fields.volume) lines.push(`Vol ${values.volume}`);
    return lines;
  }

  const line1 = [];
  if (fields.priceRange) line1.push(values.priceRange);
  if (fields.percentChange) line1.push(`(${values.percentChange})`);
  if (fields.pipsChange) line1.push(values.pipsChange);
  if (line1.length) lines.push(line1.join(" "));

  const line2 = [];
  if (fields.barsRange) line2.push(values.barsRange);
  if (fields.dateTimeRange) line2.push(values.dateTimeRange);
  if (line2.length) lines.push(line2.join(", "));

  if (fields.volume) lines.push(`Vol ${values.volume}`);
  return lines;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} headLen
 */
function strokeArrowLine(ctx, x1, y1, x2, y2, headLen = 7) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} lines
 * @param {number} cx
 * @param {number} anchorY
 * @param {ReturnType<typeof measureDraftFromDrawing>} style
 */
function drawMeasureLabel(ctx, lines, cx, anchorY, style) {
  if (!lines.length) return;
  const fontSize = style.fontSize ?? 12;
  const padX = 8;
  const padY = 4;
  const gap = 2;
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, ctx.measureText(line).width);
  }
  width += padX * 2;
  const rowH = fontSize + padY * 2;
  const height = lines.length * rowH + Math.max(0, lines.length - 1) * gap;
  const x = cx - width / 2;
  const y = anchorY - height - 6;

  if (style.showMeasureLabelBackground !== false) {
    ctx.fillStyle = style.measureLabelBgColor ?? "rgba(46, 46, 46, 0.92)";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 3);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, width, height);
    }
  }

  ctx.fillStyle = style.textColor ?? "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let rowY = y + rowH / 2;
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], cx, rowY);
    rowY += rowH + gap;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 * @param {number} bottom
 * @param {{ precision?: number, barSec?: number, bars?: { time: number, volume?: number }[] }} state
 */
export function renderMeasureDrawing(ctx, drawing, pts, right, bottom, state = {}) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return;

  const style = measureDraftFromDrawing(drawing);
  const color = style.color ?? "#2962FF";
  const lw = style.lineWidth ?? 2;
  const fields = resolveMeasureStatsFields(drawing);
  const values = computeMeasureStatValues(drawing, state);
  const lines = buildMeasureStatLines(drawing.type, fields, values);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;

  const bgColor = style.measureBackgroundColor ?? color;
  const bgAlpha = (style.measureBackgroundOpacity ?? 15) / 100;

  switch (drawing.type) {
    case "price-range":
      renderPriceRange(ctx, a, b, style, bgColor, bgAlpha, lines);
      break;
    case "date-range":
      renderDateRange(ctx, a, b, style, bgColor, bgAlpha, lines);
      break;
    case "date-price-range":
      renderDatePriceRange(ctx, a, b, style, bgColor, bgAlpha, lines);
      break;
    default:
      break;
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {ReturnType<typeof measureDraftFromDrawing>} style
 * @param {string} bgColor
 * @param {number} bgAlpha
 * @param {string[]} lines
 */
function renderPriceRange(ctx, a, b, style, bgColor, bgAlpha, lines) {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const width = Math.max(24, x2 - x1);
  const cx = (x1 + x2) / 2;
  const yTop = Math.min(a.y, b.y);
  const yBottom = Math.max(a.y, b.y);
  const left = cx - width / 2;

  if (style.showMeasureBackground !== false) {
    ctx.save();
    ctx.globalAlpha = bgAlpha;
    ctx.fillStyle = bgColor;
    ctx.fillRect(left, yTop, width, yBottom - yTop);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(left, yTop);
  ctx.lineTo(left + width, yTop);
  ctx.moveTo(left, yBottom);
  ctx.lineTo(left + width, yBottom);
  ctx.stroke();

  const up = b.y < a.y;
  const ay = up ? yBottom : yTop;
  const by = up ? yTop : yBottom;
  strokeArrowLine(ctx, cx, ay, cx, by);

  drawMeasureLabel(ctx, lines, cx, yTop, style);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {ReturnType<typeof measureDraftFromDrawing>} style
 * @param {string} bgColor
 * @param {number} bgAlpha
 * @param {string[]} lines
 */
function renderDateRange(ctx, a, b, style, bgColor, bgAlpha, lines) {
  const xLeft = Math.min(a.x, b.x);
  const xRight = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  const height = Math.max(24, y2 - y1);
  const cy = (y1 + y2) / 2;
  const top = cy - height / 2;

  if (style.showMeasureBackground !== false) {
    ctx.save();
    ctx.globalAlpha = bgAlpha;
    ctx.fillStyle = bgColor;
    ctx.fillRect(xLeft, top, xRight - xLeft, height);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(xLeft, top);
  ctx.lineTo(xLeft, top + height);
  ctx.moveTo(xRight, top);
  ctx.lineTo(xRight, top + height);
  ctx.stroke();

  const left = b.x < a.x;
  const ax = left ? xRight : xLeft;
  const bx = left ? xLeft : xRight;
  strokeArrowLine(ctx, ax, cy, bx, cy);

  drawMeasureLabel(ctx, lines, (xLeft + xRight) / 2, top, style);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {ReturnType<typeof measureDraftFromDrawing>} style
 * @param {string} bgColor
 * @param {number} bgAlpha
 * @param {string[]} lines
 */
function renderDatePriceRange(ctx, a, b, style, bgColor, bgAlpha, lines) {
  const xLeft = Math.min(a.x, b.x);
  const xRight = Math.max(a.x, b.x);
  const yTop = Math.min(a.y, b.y);
  const yBottom = Math.max(a.y, b.y);
  const w = xRight - xLeft;
  const h = yBottom - yTop;
  const cx = (xLeft + xRight) / 2;
  const cy = (yTop + yBottom) / 2;

  if (style.showMeasureBackground !== false) {
    ctx.save();
    ctx.globalAlpha = bgAlpha;
    ctx.fillStyle = bgColor;
    ctx.fillRect(xLeft, yTop, w, h);
    ctx.restore();
  }

  if (style.showMeasureBorder) {
    ctx.strokeRect(xLeft, yTop, w, h);
  }

  const up = b.y < a.y;
  strokeArrowLine(ctx, cx, up ? yBottom : yTop, cx, up ? yTop : yBottom);
  const left = b.x < a.x;
  strokeArrowLine(ctx, left ? xRight : xLeft, cy, left ? xLeft : xRight, cy);

  drawMeasureLabel(ctx, lines, cx, yTop, style);
}

/** @param {string} type */
export function isMeasureDrawingType(type) {
  return isMeasureTool(type);
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 */
export function hitMeasureDrawing(type, pts, px, py, threshold) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return false;

  if (type === "price-range") {
    const cx = (a.x + b.x) / 2;
    const width = Math.max(24, Math.abs(b.x - a.x));
    const x1 = cx - width / 2 - threshold;
    const x2 = cx + width / 2 + threshold;
    const y1 = Math.min(a.y, b.y) - threshold;
    const y2 = Math.max(a.y, b.y) + threshold;
    return px >= x1 && px <= x2 && py >= y1 && py <= y2;
  }

  if (type === "date-range") {
    const x1 = Math.min(a.x, b.x) - threshold;
    const x2 = Math.max(a.x, b.x) + threshold;
    const cy = (a.y + b.y) / 2;
    const height = Math.max(24, Math.abs(b.y - a.y));
    const y1 = cy - height / 2 - threshold;
    const y2 = cy + height / 2 + threshold;
    return px >= x1 && px <= x2 && py >= y1 && py <= y2;
  }

  const x1 = Math.min(a.x, b.x) - threshold;
  const x2 = Math.max(a.x, b.x) + threshold;
  const y1 = Math.min(a.y, b.y) - threshold;
  const y2 = Math.max(a.y, b.y) + threshold;
  const inBox = px >= x1 && px <= x2 && py >= y1 && py <= y2;
  if (inBox) return true;
  return (
    distToSegment(px, py, x1, y1, x2, y1) <= threshold ||
    distToSegment(px, py, x2, y1, x2, y2) <= threshold ||
    distToSegment(px, py, x2, y2, x1, y2) <= threshold ||
    distToSegment(px, py, x1, y2, x1, y1) <= threshold
  );
}
