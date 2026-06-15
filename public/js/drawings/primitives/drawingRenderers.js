import { applyColorOpacity } from "../../ui/colorPicker.js";
import { DEFAULT_DRAWING_COLOR, ANCHOR_BORDER_COLOR, ANCHOR_FILL_COLOR, ANCHOR_RADIUS, ANCHOR_BORDER_WIDTH } from "../constants.js";
import { drawDisjointChannel, drawFlatTopBottom, drawParallelChannel, regressionInRange } from "../geometry/channels.js";
import { renderFibDrawing } from "../geometry/fibTools.js";
import { renderGannDrawing } from "../geometry/gannTools.js";
import { renderPatternDrawing, isPatternDrawingType } from "../geometry/patternTools.js";
import { renderForecastDrawing, isForecastDrawingType } from "../geometry/forecastTools.js";
import { renderMeasureDrawing, isMeasureDrawingType } from "../geometry/measureTools.js";
import { renderAnnotationDrawing, isAnnotationDrawingType } from "../geometry/annotationTools.js";
import { pitchforkLines } from "../geometry/pitchfork.js";
import { strokeSegment } from "../geometry/lineMath.js";
import { computeInfoLineStats, fmtDrawingPrice } from "../geometry/infoLine.js";
import { extendedSegmentEndpoints, resolveExtendFlags } from "../geometry/lineExtend.js";
import { isOnePointTool, LINE_STYLE_DASH } from "../registry/toolRegistry.js";

function pixelPoints(points, timeToX, priceToY) {
  /** @type {{ x: number, y: number }[]} */
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = pt(points, i, timeToX, priceToY);
    if (p) out.push(p);
  }
  return out;
}

/** @typedef {import("../types.js").UserDrawing} UserDrawing */

function pt(points, i, timeToX, priceToY) {
  const p = points[i];
  if (!p) return null;
  const x = timeToX(p.time);
  const y = priceToY(p.price);
  if (x == null || y == null) return null;
  return { x, y };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} right
 * @param {number} bottom
 * @param {{ isPreview?: boolean, isSelected?: boolean, barSec?: number, precision?: number, formatPointTime?: (t: number) => string, bars?: { time: number, close?: number }[] }} state
 */
export function renderDrawing(ctx, drawing, timeToX, priceToY, right, bottom, state = {}) {
  const isPreview = Boolean(state.isPreview);
  const showAnchors = isPreview || Boolean(state.isSelected);
  const baseColor = drawing.color ?? DEFAULT_DRAWING_COLOR;
  const color = applyColorOpacity(baseColor, drawing.colorOpacity ?? 100);
  const lw = drawing.lineWidth ?? 2;
  const dash = LINE_STYLE_DASH[drawing.lineStyle ?? 0] ?? [];

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.globalAlpha = isPreview ? 0.85 : 1;
  if (dash.length) ctx.setLineDash(dash);

  switch (drawing.type) {
    case "trend-line":
    case "extended-line":
      drawExtendedSegment(ctx, drawing, drawing.points, timeToX, priceToY, 0, right, bottom);
      break;
    case "ray":
      drawExtendedSegment(ctx, drawing, drawing.points, timeToX, priceToY, 0, right, bottom);
      break;
    case "trend-angle":
      drawTrendAngle(ctx, drawing.points, timeToX, priceToY, color);
      break;
    case "horizontal-ray":
      drawHorizontalRay(ctx, drawing.points, timeToX, priceToY, right);
      break;
    case "cross-line":
      drawCrossLine(ctx, drawing.points, timeToX, priceToY, right, bottom);
      break;
    case "horizontal-line":
      drawHorizontal(ctx, drawing.points, timeToX, priceToY, right);
      break;
    case "vertical-line":
      drawVertical(ctx, drawing.points, timeToX, priceToY, bottom);
      break;
    case "rectangle":
      if (isAnnotationDrawingType("rectangle")) {
        renderAnnotationDrawing(ctx, drawing, pixelPoints(drawing.points, timeToX, priceToY), right, bottom);
      } else {
        drawRectangle(ctx, drawing.points, timeToX, priceToY);
      }
      break;
    case "info-line":
      drawInfoLine(ctx, drawing, timeToX, priceToY, color, state);
      break;
    case "parallel-channel":
      drawParallelChannelCase(ctx, drawing.points, timeToX, priceToY, 0, right, bottom);
      break;
    case "disjoint-channel":
      drawDisjointChannelCase(ctx, drawing.points, timeToX, priceToY);
      break;
    case "flat-top-bottom":
      drawFlatTopBottomCase(ctx, drawing.points, timeToX, priceToY, 0, right);
      break;
    case "regression-trend":
      drawRegressionTrend(ctx, drawing.points, timeToX, priceToY, state.bars ?? []);
      break;
    case "pitchfork":
    case "schiff-pitchfork":
    case "modified-schiff-pitchfork":
    case "inside-pitchfork":
      drawPitchforkCase(ctx, drawing.points, drawing.type, timeToX, priceToY, 0, right, bottom);
      break;
    case "fib-retracement":
    case "fib-extension":
    case "fib-channel":
    case "fib-time-zone":
    case "fib-speed-fan":
    case "trend-based-fib-time":
    case "fib-circles":
    case "fib-spiral":
    case "fib-speed-resistance-arcs":
    case "fib-wedge":
    case "pitchfan":
      renderFibDrawing(ctx, drawing, pixelPoints(drawing.points, timeToX, priceToY), right, bottom);
      break;
    case "gann-box":
    case "gann-square":
    case "gann-square-fixed":
    case "gann-fan":
      renderGannDrawing(ctx, drawing, pixelPoints(drawing.points, timeToX, priceToY), right, bottom);
      break;
    default: {
      const pts = pixelPoints(drawing.points, timeToX, priceToY);
      if (isPatternDrawingType(drawing.type)) {
        renderPatternDrawing(ctx, drawing, pts, right, bottom);
      } else if (isForecastDrawingType(drawing.type)) {
        renderForecastDrawing(ctx, drawing, pts, right, bottom);
      } else if (isMeasureDrawingType(drawing.type)) {
        renderMeasureDrawing(ctx, drawing, pts, right, bottom, state);
      } else if (isAnnotationDrawingType(drawing.type)) {
        renderAnnotationDrawing(ctx, drawing, pts, right, bottom);
      } else {
        drawSegment(ctx, drawing.points, timeToX, priceToY);
      }
      break;
    }
  }

  if (showAnchors) {
    drawEndpointAnchors(ctx, drawing, timeToX, priceToY, color, lw, isPreview);
  }

  if (drawing.type !== "info-line") {
    drawDrawingLabel(ctx, drawing, timeToX, priceToY);
  }
  ctx.restore();
}

function drawDrawingLabel(ctx, drawing, timeToX, priceToY) {
  const raw = drawing.label;
  if (raw == null || !String(raw).trim()) return;

  const a = pt(drawing.points, 0, timeToX, priceToY);
  const b = pt(drawing.points, 1, timeToX, priceToY) ?? a;
  if (!a) return;

  const fontSize = drawing.fontSize ?? 14;
  const baseTextColor = drawing.textColor ?? drawing.color ?? DEFAULT_DRAWING_COLOR;
  const textColor = applyColorOpacity(baseTextColor, drawing.textColorOpacity ?? drawing.colorOpacity ?? 100);

  const alignH = drawing.textAlignH ?? "center";
  const alignV = drawing.textAlignV ?? "top";
  const gap = fontSize * 0.45 + 5;

  let ax = a.x;
  let ay = a.y;
  if (alignH === "right" && b) {
    ax = b.x;
    ay = b.y;
  } else if (alignH === "center" && b) {
    ax = (a.x + b.x) / 2;
    ay = (a.y + b.y) / 2;
  }

  let x = ax;
  let y = ay;
  if (alignV === "top") {
    y -= gap;
  } else if (alignV === "bottom") {
    y += gap;
  }

  const lines = String(raw).split(/\n/);
  const lineHeight = Math.round(fontSize * 1.25);

  ctx.save();
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textAlign = alignH === "left" ? "left" : alignH === "right" ? "right" : "center";
  ctx.textBaseline = "top";

  const blockHeight = lines.length * lineHeight;
  let startY = y;
  if (alignV === "middle") startY = y - blockHeight / 2 + lineHeight * 0.15;
  else if (alignV === "bottom") startY = y - blockHeight;

  lines.forEach((line, i) => {
    ctx.fillText(line, x, startY + i * lineHeight);
  });
  ctx.restore();
}

function drawEndpointAnchors(ctx, drawing, timeToX, priceToY, color, lw, isPreview = false) {
  const r = ANCHOR_RADIUS;
  let indices = isOnePointTool(drawing.type)
    ? [0]
    : drawing.points.length > 0
      ? drawing.points.map((_, i) => i)
      : [0];

  if (isPreview && indices.length > 1) {
    const a = pt(drawing.points, 0, timeToX, priceToY);
    const b = pt(drawing.points, 1, timeToX, priceToY);
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 2) indices = [0];
  }

  for (const i of indices) {
    const p = pt(drawing.points, i, timeToX, priceToY);
    if (!p) continue;
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = ANCHOR_FILL_COLOR;
    ctx.fill();
    ctx.strokeStyle = ANCHOR_BORDER_COLOR;
    ctx.lineWidth = ANCHOR_BORDER_WIDTH;
    ctx.stroke();
    ctx.restore();
  }
}

function drawSegment(ctx, points, timeToX, priceToY) {
  const a = pt(points, 0, timeToX, priceToY);
  const b = pt(points, 1, timeToX, priceToY);
  if (!a || !b) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** @param {import("../types.js").UserDrawing} drawing */
function drawExtendedSegment(ctx, drawing, points, timeToX, priceToY, leftX, rightX, bottom) {
  const a = pt(points, 0, timeToX, priceToY);
  const b = pt(points, 1, timeToX, priceToY);
  if (!a || !b) return;

  const { x1, y1, x2, y2 } = extendedSegmentEndpoints(
    a,
    b,
    resolveExtendFlags(drawing),
    leftX,
    rightX,
    bottom,
  );

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * @param {import("../types.js").UserDrawing} drawing
 * @param {{ barSec?: number, precision?: number, formatPointTime?: (t: number) => string }} state
 */
function drawInfoLine(ctx, drawing, timeToX, priceToY, color, state) {
  const points = drawing.points;
  const a = pt(points, 0, timeToX, priceToY);
  const b = pt(points, 1, timeToX, priceToY);
  if (!a || !b) return;

  drawSegment(ctx, points, timeToX, priceToY);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return;

  const precision = state.precision ?? 2;
  const barSec = state.barSec ?? 60;
  const formatPointTime = state.formatPointTime ?? ((t) => String(t));
  const p0 = points[0];
  const p1 = points[1];
  if (!p0 || !p1) return;

  drawInfoEndpointLabel(ctx, a, p0, precision, formatPointTime, color, "start");
  drawInfoEndpointLabel(ctx, b, p1, precision, formatPointTime, color, "end");

  const stats = computeInfoLineStats(p0, p1, a, b, barSec, precision);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  drawInfoStatsBox(ctx, midX, midY, stats.lines, stats.boxBelow, color);
}

function drawInfoEndpointLabel(ctx, pixel, point, precision, formatPointTime, color, role) {
  const text = `${fmtDrawingPrice(point.price, precision)} (${formatPointTime(point.time)})`;
  const fontSize = 11;
  ctx.save();
  ctx.font = `400 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  if (role === "start") {
    ctx.textAlign = "right";
    ctx.fillText(text, pixel.x - 8, pixel.y - 10);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(text, pixel.x + 8, pixel.y - 10);
  }
  ctx.restore();
}

function drawInfoStatsBox(ctx, midX, midY, lines, boxBelow, color) {
  const fontSize = 11;
  const lineHeight = 14;
  const padX = 8;
  const padY = 6;
  const gap = 10;

  ctx.save();
  ctx.font = `400 ${fontSize}px system-ui, sans-serif`;
  const maxW = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxW = maxW + padX * 2;
  const boxH = lines.length * lineHeight + padY * 2;
  const x = midX - boxW / 2;
  const y = boxBelow ? midY + gap : midY - gap - boxH;

  ctx.fillStyle = "rgba(15, 18, 28, 0.92)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeRect(x, y, boxW, boxH);
  }

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.fillText(line, midX, y + padY + i * lineHeight);
  });
  ctx.restore();
}

function drawParallelChannelCase(ctx, points, timeToX, priceToY, leftX, rightX, bottomY) {
  const p1 = pt(points, 0, timeToX, priceToY);
  const p2 = pt(points, 1, timeToX, priceToY);
  const p3 = pt(points, 2, timeToX, priceToY);
  if (!p1 || !p2 || !p3) return;
  drawParallelChannel(ctx, p1, p2, p3, leftX, rightX, bottomY);
}

function drawDisjointChannelCase(ctx, points, timeToX, priceToY) {
  const p1 = pt(points, 0, timeToX, priceToY);
  const p2 = pt(points, 1, timeToX, priceToY);
  const p3 = pt(points, 2, timeToX, priceToY);
  const p4 = pt(points, 3, timeToX, priceToY);
  if (!p1 || !p2 || !p3 || !p4) return;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.moveTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.stroke();
}

function drawFlatTopBottomCase(ctx, points, timeToX, priceToY, leftX, rightX) {
  const p1 = pt(points, 0, timeToX, priceToY);
  const p2 = pt(points, 1, timeToX, priceToY);
  const p3 = pt(points, 2, timeToX, priceToY);
  if (!p1 || !p2 || !p3) return;
  drawFlatTopBottom(ctx, p1, p2, p3, leftX, rightX);
}

function drawRegressionTrend(ctx, points, timeToX, priceToY, bars) {
  const p0 = points[0];
  const p1 = points[1];
  if (!p0 || !p1 || !bars.length) return;
  const reg = regressionInRange(bars, p0.time, p1.time);
  if (!reg) return;
  const xA = timeToX(reg.slice[0].time);
  const xB = timeToX(reg.slice[reg.slice.length - 1].time);
  if (xA == null || xB == null) return;
  const yA = priceToY(reg.intercept);
  const yB = priceToY(reg.intercept + reg.slope * (reg.slice.length - 1));
  if (yA == null || yB == null) return;
  ctx.beginPath();
  ctx.moveTo(xA, yA);
  ctx.lineTo(xB, yB);
  ctx.stroke();
  if (reg.std > 0) {
    const yUpA = priceToY(reg.intercept + reg.std);
    const yUpB = priceToY(reg.intercept + reg.slope * (reg.slice.length - 1) + reg.std);
    const yDnA = priceToY(reg.intercept - reg.std);
    const yDnB = priceToY(reg.intercept + reg.slope * (reg.slice.length - 1) - reg.std);
    if (yUpA != null && yUpB != null) {
      ctx.beginPath();
      ctx.moveTo(xA, yUpA);
      ctx.lineTo(xB, yUpB);
      ctx.stroke();
    }
    if (yDnA != null && yDnB != null) {
      ctx.beginPath();
      ctx.moveTo(xA, yDnA);
      ctx.lineTo(xB, yDnB);
      ctx.stroke();
    }
  }
}

function drawPitchforkCase(ctx, points, variant, timeToX, priceToY, leftX, rightX, bottomY) {
  const p1 = pt(points, 0, timeToX, priceToY);
  const p2 = pt(points, 1, timeToX, priceToY);
  const p3 = pt(points, 2, timeToX, priceToY);
  if (!p1 || !p2 || !p3) return;
  const { median, upper, lower } = pitchforkLines(p1, p2, p3, variant, leftX, rightX, bottomY);
  strokeSegment(ctx, median);
  strokeSegment(ctx, upper);
  strokeSegment(ctx, lower);
}

function drawHorizontalRay(ctx, points, timeToX, priceToY, rightX) {
  const a = pt(points, 0, timeToX, priceToY);
  if (!a) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(rightX, a.y);
  ctx.stroke();
}

function drawCrossLine(ctx, points, timeToX, priceToY, rightX, bottom) {
  const a = pt(points, 0, timeToX, priceToY);
  if (!a) return;
  ctx.beginPath();
  ctx.moveTo(0, a.y);
  ctx.lineTo(rightX, a.y);
  ctx.moveTo(a.x, 0);
  ctx.lineTo(a.x, bottom);
  ctx.stroke();
}

/** @param {string} color */
function drawTrendAngle(ctx, points, timeToX, priceToY, color) {
  const a = pt(points, 0, timeToX, priceToY);
  const b = pt(points, 1, timeToX, priceToY);
  if (!a || !b) return;
  drawSegment(ctx, points, timeToX, priceToY);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return;
  const angle = Math.atan2(a.y - b.y, b.x - a.x) * (180 / Math.PI);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = "400 11px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${angle.toFixed(2)}°`, midX, midY - 6);
  ctx.restore();
}

function drawHorizontal(ctx, points, timeToX, priceToY, rightX) {
  const a = pt(points, 0, timeToX, priceToY);
  if (!a) return;
  const x1 = points[1] ? timeToX(points[1].time) : a.x;
  const x2 = rightX;
  if (x1 == null) return;
  ctx.beginPath();
  ctx.moveTo(Math.min(x1, x2), a.y);
  ctx.lineTo(Math.max(x1, x2), a.y);
  ctx.stroke();
}

function drawVertical(ctx, points, timeToX, priceToY, bottom) {
  const a = pt(points, 0, timeToX, priceToY);
  if (!a) return;
  ctx.beginPath();
  ctx.moveTo(a.x, 0);
  ctx.lineTo(a.x, bottom);
  ctx.stroke();
}

function drawRectangle(ctx, points, timeToX, priceToY) {
  const a = pt(points, 0, timeToX, priceToY);
  const b = pt(points, 1, timeToX, priceToY);
  if (!a || !b) return;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  ctx.globalAlpha *= 0.12;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha /= 0.12;
  ctx.strokeRect(x, y, w, h);
}
