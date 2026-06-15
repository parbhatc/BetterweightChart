import { fmtDrawingPrice } from "../line/info.js";

export const FORECAST_TOOL_TYPE = "position-forecast";

/** TradingView-style Forecast defaults. */
export const FORECAST_STYLE_DEFAULTS = {
  color: "#2962FF",
  colorOpacity: 100,
  lineWidth: 2,
  forecastSourceTextColor: "#ffffff",
  forecastSourceBgColor: "rgba(41, 98, 255, 0.9)",
  forecastSourceBorderColor: "#2962FF",
  forecastTargetTextColor: "#ffffff",
  forecastTargetBgColor: "#2962FF",
  forecastTargetBorderColor: "#2962FF",
  forecastSuccessTextColor: "#ffffff",
  forecastSuccessBgColor: "#4CAF50",
  forecastFailureTextColor: "#ffffff",
  forecastFailureBgColor: "#F23645",
};

/** @param {string} type */
export function isForecastTool(type) {
  return type === FORECAST_TOOL_TYPE;
}

/** @param {string} type */
export function supportsForecastStyleSettings(type) {
  return isForecastTool(type);
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function forecastDraftFromDrawing(drawing) {
  return {
    ...FORECAST_STYLE_DEFAULTS,
    color: drawing.color ?? FORECAST_STYLE_DEFAULTS.color,
    colorOpacity: drawing.colorOpacity ?? FORECAST_STYLE_DEFAULTS.colorOpacity,
    lineWidth: drawing.lineWidth ?? FORECAST_STYLE_DEFAULTS.lineWidth,
    forecastSourceTextColor: drawing.forecastSourceTextColor ?? FORECAST_STYLE_DEFAULTS.forecastSourceTextColor,
    forecastSourceBgColor: drawing.forecastSourceBgColor ?? FORECAST_STYLE_DEFAULTS.forecastSourceBgColor,
    forecastSourceBorderColor: drawing.forecastSourceBorderColor ?? FORECAST_STYLE_DEFAULTS.forecastSourceBorderColor,
    forecastTargetTextColor: drawing.forecastTargetTextColor ?? FORECAST_STYLE_DEFAULTS.forecastTargetTextColor,
    forecastTargetBgColor: drawing.forecastTargetBgColor ?? FORECAST_STYLE_DEFAULTS.forecastTargetBgColor,
    forecastTargetBorderColor: drawing.forecastTargetBorderColor ?? FORECAST_STYLE_DEFAULTS.forecastTargetBorderColor,
    forecastSuccessTextColor: drawing.forecastSuccessTextColor ?? FORECAST_STYLE_DEFAULTS.forecastSuccessTextColor,
    forecastSuccessBgColor: drawing.forecastSuccessBgColor ?? FORECAST_STYLE_DEFAULTS.forecastSuccessBgColor,
    forecastFailureTextColor: drawing.forecastFailureTextColor ?? FORECAST_STYLE_DEFAULTS.forecastFailureTextColor,
    forecastFailureBgColor: drawing.forecastFailureBgColor ?? FORECAST_STYLE_DEFAULTS.forecastFailureBgColor,
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeForecastDrawing(drawing) {
  return { ...forecastDraftFromDrawing(drawing), ...drawing };
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

/** @param {number} unixSec */
function formatForecastDateTime(unixSec) {
  const d = new Date(unixSec * 1000);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi}`;
}

/** @param {number} sec */
function formatForecastDuration(sec) {
  const abs = Math.abs(sec);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.round(abs)}s`;
}

/**
 * @param {{ price: number, time: number }} p0
 * @param {{ price: number, time: number }} p1
 * @param {{ time: number, high?: number, low?: number, close?: number }[]} [bars]
 * @returns {"success" | "failure" | null}
 */
export function evaluateForecastOutcome(p0, p1, bars = []) {
  if (!bars.length) return null;
  const bullish = p1.price > p0.price;
  const tStart = Math.min(p0.time, p1.time);
  const tEnd = Math.max(p0.time, p1.time);
  const lastBar = bars[bars.length - 1];
  if (!lastBar || lastBar.time < tEnd) return null;

  for (const bar of bars) {
    if (bar.time < tStart || bar.time > tEnd) continue;
    if (bullish && bar.high != null && bar.high >= p1.price) return "success";
    if (!bullish && bar.low != null && bar.low <= p1.price) return "success";
  }
  return "failure";
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 */
function drawForecastCurve(ctx, ax, ay, bx, by) {
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = len * 0.18;
  const nx = -dy / len;
  const ny = dx / len;
  const sign = by < ay ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(midX + nx * bulge * sign, midY + ny * bulge * sign, bx, by);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} lines
 * @param {number} cx
 * @param {number} cy
 * @param {string} bg
 * @param {string} border
 * @param {string} textColor
 * @param {{ anchor?: "above" | "below", fontSize?: number }} [opts]
 */
function drawForecastLabelBox(ctx, lines, cx, cy, bg, border, textColor, opts = {}) {
  const fontSize = opts.fontSize ?? 12;
  const padX = 8;
  const padY = 5;
  const lineGap = 2;
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, ctx.measureText(line).width);
  }
  width += padX * 2;
  const rowH = fontSize + padY;
  const height = lines.length * rowH + Math.max(0, lines.length - 1) * lineGap;
  const x = cx - width / 2;
  const y = opts.anchor === "below" ? cy + 8 : cy - height - 8;

  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 3);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  }

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let rowY = y + rowH / 2;
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], cx, rowY);
    rowY += rowH + lineGap;
  }
  return { x, y, width, height };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {"success" | "failure"} outcome
 * @param {number} cx
 * @param {number} boxTop
 * @param {object} style
 */
function drawForecastOutcomeBanner(ctx, outcome, cx, boxTop, style) {
  const isSuccess = outcome === "success";
  const bg = isSuccess ? style.forecastSuccessBgColor : style.forecastFailureBgColor;
  const textColor = isSuccess ? style.forecastSuccessTextColor : style.forecastFailureTextColor;
  const label = isSuccess ? "SUCCESS" : "FAILURE";
  const icon = isSuccess ? ":)" : ":(";
  const fontSize = 12;
  const text = `${icon}  ${label}`;
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const padX = 10;
  const padY = 4;
  const w = tw + padX * 2;
  const h = fontSize + padY * 2;
  const x = cx - w / 2;
  const y = boxTop - h - 4;

  ctx.fillStyle = bg;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 * @param {number} bottom
 * @param {{ precision?: number, bars?: { time: number, high?: number, low?: number, close?: number }[], barSec?: number }} [state]
 */
export function renderForecastDrawing(ctx, drawing, pts, right, bottom, state = {}) {
  const a = pts[0];
  const b = pts[1];
  if (!a) return;

  switch (drawing.type) {
    case FORECAST_TOOL_TYPE:
      if (!b) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      renderPositionForecast(ctx, drawing, a, b, state);
      break;
    case "sector":
      if (b) {
        const x1 = Math.min(a.x, b.x);
        const y1 = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.save();
        ctx.globalAlpha *= 0.12;
        ctx.fillRect(x1, y1, w, h);
        ctx.globalAlpha /= 0.12;
        ctx.strokeRect(x1, y1, w, h);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
      break;
    case "anchored-volume-profile":
      if (b) {
        const x1 = Math.min(a.x, b.x);
        const y1 = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.strokeRect(x1, y1, w, h);
        const rows = 6;
        for (let i = 0; i < rows; i += 1) {
          const barW = (w * (0.3 + (i % 3) * 0.2)) / 2;
          const y = y1 + (h * i) / rows + h / rows / 4;
          ctx.fillRect(x1, y, barW, h / rows / 2);
          ctx.fillRect(x1 + w - barW, y, barW, h / rows / 2);
        }
      }
      break;
    default:
      if (b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ precision?: number, bars?: { time: number, high?: number, low?: number, close?: number }[] }} state
 */
function renderPositionForecast(ctx, drawing, a, b, state) {
  const style = forecastDraftFromDrawing(/** @type {import("../../types.js").UserDrawing} */ (drawing));
  const p0 = drawing.points[0];
  const p1 = drawing.points[1];
  if (!p0 || !p1) return;

  const precision = state.precision ?? 2;
  const bars = state.bars ?? [];

  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.lineWidth ?? 2;
  drawForecastCurve(ctx, a.x, a.y, b.x, b.y);

  ctx.beginPath();
  ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
  ctx.stroke();

  const sourceLines = [
    fmtDrawingPrice(p0.price, precision),
    formatForecastDateTime(p0.time),
  ];
  drawForecastLabelBox(
    ctx,
    sourceLines,
    a.x,
    a.y,
    style.forecastSourceBgColor,
    style.forecastSourceBorderColor,
    style.forecastSourceTextColor,
    { anchor: a.y > b.y ? "above" : "below" },
  );

  const priceDiff = p1.price - p0.price;
  const pct = p0.price !== 0 ? (priceDiff / p0.price) * 100 : 0;
  const sign = priceDiff >= 0 ? "" : "-";
  const duration = formatForecastDuration(Math.abs(p1.time - p0.time));
  const targetLines = [
    `${sign}${fmtDrawingPrice(Math.abs(priceDiff), precision)} (${Math.abs(pct).toFixed(2)}%) in ${duration}`,
    `${fmtDrawingPrice(p1.price, precision)}  ${formatForecastDateTime(p1.time)}`,
  ];
  const box = drawForecastLabelBox(
    ctx,
    targetLines,
    b.x,
    b.y,
    style.forecastTargetBgColor,
    style.forecastTargetBorderColor,
    style.forecastTargetTextColor,
    { anchor: b.y < a.y ? "above" : "below" },
  );

  const outcome = evaluateForecastOutcome(p0, p1, bars);
  if (outcome && box) {
    drawForecastOutcomeBanner(ctx, outcome, b.x, box.y, style);
  }
}

/** @param {string} type */
export function isForecastDrawingType(type) {
  return type === FORECAST_TOOL_TYPE || type === "sector" || type === "anchored-volume-profile";
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 */
export function hitForecastDrawing(type, pts, px, py, threshold) {
  const a = pts[0];
  const b = pts[1];
  if (!a) return false;

  if (type === "sector" || type === "anchored-volume-profile") {
    if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
    const x1 = Math.min(a.x, b.x) - threshold;
    const x2 = Math.max(a.x, b.x) + threshold;
    const y1 = Math.min(a.y, b.y) - threshold;
    const y2 = Math.max(a.y, b.y) + threshold;
    return (
      distToSegment(px, py, x1, y1, x2, y1) <= threshold ||
      distToSegment(px, py, x2, y1, x2, y2) <= threshold ||
      distToSegment(px, py, x2, y2, x1, y2) <= threshold ||
      distToSegment(px, py, x1, y2, x1, y1) <= threshold
    );
  }

  if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
  return distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold;
}
