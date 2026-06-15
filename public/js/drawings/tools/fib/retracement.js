import { applyColorOpacity } from "../../../ui/color/picker.js";
import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { newDrawingDefaults } from "../../toolbars/defaults/store.js";
import { extendedSegmentEndpoints } from "../line/extend.js";
import { clipLineThroughPoints, strokeSegment } from "../line/math.js";
import { LINE_STYLE_DASH } from "../../registry/tools.js";
import {
  hitFibCirclesDrawing,
  hitFibSpiralDrawing,
  hitFibWedgeDrawing,
  hitTrendBasedFibTimeDrawing,
  renderFibCirclesDrawing,
  renderFibSpiralDrawing,
  renderFibWedgeDrawing,
  renderTrendBasedFibTimeDrawing,
} from "./advanced.js";

/** @typedef {{ offset: number, enabled: boolean, color?: string, colorOpacity?: number }} FibRetracementLevel */

/** @returns {FibRetracementLevel[]} */
export function defaultFibExtensionLevels() {
  return [
    { offset: 0, enabled: true, color: "#808080", colorOpacity: 100 },
    { offset: 0.618, enabled: true, color: "#f23645", colorOpacity: 100 },
    { offset: 1, enabled: true, color: "#ff9800", colorOpacity: 100 },
    { offset: 1.618, enabled: true, color: "#4caf50", colorOpacity: 100 },
    { offset: 2.618, enabled: true, color: "#089981", colorOpacity: 100 },
    { offset: 4.236, enabled: true, color: "#2962FF", colorOpacity: 100 },
  ];
}

/** @returns {FibRetracementLevel[]} */
export function defaultFibTimeZoneLevels() {
  const offsets = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  return offsets.map((offset, i) => ({
    offset,
    enabled: true,
    color: i === 0 ? "#808080" : "#2962FF",
    colorOpacity: 100,
  }));
}

/** @returns {FibRetracementLevel[]} */
export function defaultFibTrendBasedTimeLevels() {
  const offsets = [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3];
  const colors = [
    "#808080",
    "#f23645",
    "#81c784",
    "#4caf50",
    "#089981",
    "#00bcd4",
    "#808080",
    "#2962FF",
    "#e91e63",
    "#9c27b0",
    "#673ab7",
  ];
  return offsets.map((offset, i) => ({
    offset,
    enabled: offset !== 0.5,
    color: colors[i] ?? "#2962FF",
    colorOpacity: 100,
  }));
}

/** @returns {FibRetracementLevel[]} */
export function defaultFibCirclesLevels() {
  const offsets = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236, 4.618];
  const colors = [
    "#f23645",
    "#ff9800",
    "#089981",
    "#4caf50",
    "#00bcd4",
    "#808080",
    "#2962FF",
    "#e91e63",
    "#2962FF",
    "#e91e63",
    "#f23645",
  ];
  return offsets.map((offset, i) => ({
    offset,
    enabled: true,
    color: colors[i] ?? "#2962FF",
    colorOpacity: 100,
  }));
}

/** @returns {FibRetracementLevel[]} */
export function defaultFibWedgeLevels() {
  return [
    { offset: 0.236, enabled: true, color: "#f23645", colorOpacity: 100 },
    { offset: 0.382, enabled: true, color: "#ff9800", colorOpacity: 100 },
    { offset: 0.5, enabled: true, color: "#4caf50", colorOpacity: 100 },
    { offset: 0.618, enabled: true, color: "#089981", colorOpacity: 100 },
    { offset: 0.786, enabled: true, color: "#00bcd4", colorOpacity: 100 },
    { offset: 1, enabled: true, color: "#808080", colorOpacity: 100 },
  ];
}

/** @param {string} drawingType */
export function defaultFibLevelsForType(drawingType) {
  if (drawingType === "fib-extension") return defaultFibExtensionLevels();
  if (drawingType === "fib-time-zone") return defaultFibTimeZoneLevels();
  if (drawingType === "trend-based-fib-time") return defaultFibTrendBasedTimeLevels();
  if (drawingType === "fib-circles" || drawingType === "fib-spiral") return defaultFibCirclesLevels();
  if (drawingType === "fib-wedge") return defaultFibWedgeLevels();
  return defaultFibRetracementLevels();
}

/** @returns {FibRetracementLevel[]} */
export function defaultFibRetracementLevels() {
  return [
    { offset: 0, enabled: true, color: "#808080", colorOpacity: 100 },
    { offset: 0.236, enabled: true, color: "#f23645", colorOpacity: 100 },
    { offset: 0.382, enabled: true, color: "#ff9800", colorOpacity: 100 },
    { offset: 0.5, enabled: true, color: "#4caf50", colorOpacity: 100 },
    { offset: 0.618, enabled: true, color: "#089981", colorOpacity: 100 },
    { offset: 0.786, enabled: true, color: "#00bcd4", colorOpacity: 100 },
    { offset: 1, enabled: true, color: "#808080", colorOpacity: 100 },
    { offset: 1.618, enabled: true, color: "#2962FF", colorOpacity: 100 },
    { offset: 2.618, enabled: true, color: "#f23645", colorOpacity: 100 },
    { offset: 3.618, enabled: true, color: "#9c27b0", colorOpacity: 100 },
    { offset: 4.236, enabled: true, color: "#e91e63", colorOpacity: 100 },
    { offset: 1.272, enabled: false, color: "#ff9800", colorOpacity: 100 },
    { offset: 1.414, enabled: false, color: "#f23645", colorOpacity: 100 },
    { offset: 2, enabled: false, color: "#089981", colorOpacity: 100 },
    { offset: 2.272, enabled: false, color: "#ff9800", colorOpacity: 100 },
    { offset: 2.414, enabled: false, color: "#4caf50", colorOpacity: 100 },
    { offset: 3, enabled: false, color: "#00bcd4", colorOpacity: 100 },
    { offset: 3.272, enabled: false, color: "#808080", colorOpacity: 100 },
    { offset: 3.414, enabled: false, color: "#2962FF", colorOpacity: 100 },
    { offset: 4, enabled: false, color: "#f23645", colorOpacity: 100 },
    { offset: 4.272, enabled: false, color: "#9c27b0", colorOpacity: 100 },
    { offset: 4.414, enabled: false, color: "#e91e63", colorOpacity: 100 },
    { offset: 4.618, enabled: false, color: "#ff9800", colorOpacity: 100 },
    { offset: 4.764, enabled: false, color: "#089981", colorOpacity: 100 },
  ];
}

export const FIB_RETRACEMENT_DEFAULTS = {
  showFibTrendLine: true,
  fibTrendLineColor: "#808080",
  fibTrendLineWidth: 2,
  fibTrendLineStyle: 1,
  fibTrendLineOpacity: 100,
  fibLevels: defaultFibRetracementLevels(),
  fibLevelsLineWidth: 2,
  fibLevelsLineStyle: 0,
  fibUseOneColor: false,
  showFibBackground: true,
  fibBackgroundOpacity: 20,
  fibReverse: false,
  showFibPrices: true,
  showFibLevelLabels: true,
  fibLabelAlignH: "left",
  fibLabelAlignV: "middle",
  fibLevelsDisplayMode: "values",
  extendLeft: false,
  extendRight: false,
  fontSize: 12,
};

/** @param {string} drawingType */
export function supportsFibStyleSettings(drawingType) {
  return (
    drawingType === "fib-retracement" ||
    drawingType === "fib-extension" ||
    drawingType === "fib-channel" ||
    drawingType === "fib-time-zone" ||
    drawingType === "trend-based-fib-time" ||
    drawingType === "fib-circles" ||
    drawingType === "fib-spiral" ||
    drawingType === "fib-wedge"
  );
}

/** @param {string} drawingType */
export function isFibRetracementTool(drawingType) {
  return supportsFibStyleSettings(drawingType);
}

/** @param {FibRetracementLevel[] | undefined} levels @param {string} [drawingType] */
export function normalizeFibLevels(levels, drawingType = "fib-retracement") {
  const defaults = defaultFibLevelsForType(drawingType);
  if (!Array.isArray(levels) || !levels.length) return defaults;
  return defaults.map((def) => {
    const src = levels.find((l) => l.offset === def.offset) ?? def;
    return {
      offset: Number.isFinite(Number(src.offset)) ? Number(src.offset) : def.offset,
      enabled: Boolean(src.enabled),
      color: src.color ?? def.color,
      colorOpacity: src.colorOpacity ?? def.colorOpacity ?? 100,
    };
  });
}

/** @param {FibRetracementLevel[] | undefined} levels */
export function normalizeFibRetracementLevels(levels) {
  return normalizeFibLevels(levels, "fib-retracement");
}

/**
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {boolean} reverse
 */
export function fibRetracementPriceAtLevel(p0, p1, level, reverse = false) {
  const down = reverse ? p0.price < p1.price : p0.price >= p1.price;
  if (down) {
    return p1.price + (p0.price - p1.price) * level;
  }
  return p0.price + (p1.price - p0.price) * level;
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeFibRetracementDrawing(drawing) {
  if (!supportsFibStyleSettings(drawing.type)) return drawing;
  const typeDefaults =
    drawing.type === "fib-time-zone" || drawing.type === "trend-based-fib-time"
      ? { showFibTrendLine: drawing.type === "trend-based-fib-time", showFibPrices: false, fibReverse: false }
      : drawing.type === "fib-circles" || drawing.type === "fib-spiral" || drawing.type === "fib-wedge"
        ? { showFibPrices: false, fibReverse: false, fibLabelAlignH: "right", fibLabelAlignV: "bottom" }
        : {};
  return {
    ...FIB_RETRACEMENT_DEFAULTS,
    ...typeDefaults,
    ...drawing,
    fibLevels: normalizeFibLevels(drawing.fibLevels, drawing.type),
    fibTrendLineColor: drawing.fibTrendLineColor ?? FIB_RETRACEMENT_DEFAULTS.fibTrendLineColor,
    fibBackgroundColor: drawing.fibBackgroundColor ?? drawing.color ?? "#2962FF",
  };
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
function fibRetracementGeometry(drawing, timeToX, priceToY) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return null;

  const ax = timeToX(p0.time);
  const ay = priceToY(p0.price);
  const bx = timeToX(p1.time);
  const by = priceToY(p1.price);
  if ([ax, ay, bx, by].some((v) => v == null)) return null;

  const reverse = Boolean(normalized.fibReverse);
  const levels = normalizeFibLevels(normalized.fibLevels, normalized.type)
    .filter((l) => l.enabled)
    .map((level) => ({
      level,
      price: fibRetracementPriceAtLevel(p0, p1, level.offset, reverse),
      y: priceToY(fibRetracementPriceAtLevel(p0, p1, level.offset, reverse)),
    }))
    .filter((item) => item.y != null)
    .sort((a, b) => a.y - b.y);

  const extend = {
    extendLeft: Boolean(normalized.extendLeft),
    extendRight: Boolean(normalized.extendRight),
  };
  const xStart = Math.min(ax, bx);
  const xEnd = Math.max(ax, bx);
  const lineSpan = extendedSegmentEndpoints(
    { x: xStart, y: ay },
    { x: xEnd, y: by },
    extend,
    0,
    1e9,
    1e9,
  );

  return { normalized, p0, p1, ax, ay, bx, by, levels, lineSpan, reverse };
}

/** @param {number} offset @param {"values" | "percents"} [mode] */
export function formatFibLevelOffset(offset, mode = "values") {
  if (mode === "percents") {
    const pct = offset * 100;
    const text = pct.toFixed(4).replace(/\.?0+$/, "");
    return `${text}%`;
  }
  return String(offset);
}

/** @param {string} raw @param {"values" | "percents"} [mode] */
export function parseFibLevelOffsetInput(raw, mode = "values") {
  const cleaned = String(raw).trim().replace(/%$/, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return mode === "percents" ? n / 100 : n;
}

/** @param {string} alignH @param {string} alignV @param {number} levelX1 @param {number} levelX2 @param {number} y @param {number} fontSize */
export function fibLevelLabelLayout(alignH, alignV, levelX1, levelX2, y, fontSize) {
  const gap = Math.max(5, Math.round(fontSize * 0.4));
  const onLine = alignH === "center";
  let x;
  /** @type {CanvasTextAlign} */
  let textAlign;
  if (alignH === "right") {
    textAlign = "left";
    x = levelX2 + gap;
  } else if (alignH === "center") {
    textAlign = "center";
    x = (levelX1 + levelX2) / 2;
  } else {
    textAlign = "right";
    x = levelX1 - gap;
  }

  /** @type {CanvasTextBaseline} */
  let textBaseline = "middle";
  let labelY = y;
  if (alignV === "top") {
    textBaseline = "bottom";
    labelY = y - (onLine ? 2 : 4);
  } else if (alignV === "bottom") {
    textBaseline = "top";
    labelY = y + (onLine ? 2 : 4);
  }

  return { x, y: labelY, textAlign, textBaseline, onLine };
}

/** @param {string} alignH @param {string} alignV @param {number} x @param {number} topY @param {number} bottomY @param {number} fontSize */
export function fibTimeZoneLabelLayout(alignH, alignV, x, topY, bottomY, fontSize) {
  const gap = Math.max(5, Math.round(fontSize * 0.4));
  let labelX = x;
  /** @type {CanvasTextAlign} */
  let textAlign = "center";
  if (alignH === "left") {
    textAlign = "right";
    labelX = x - gap;
  } else if (alignH === "right") {
    textAlign = "left";
    labelX = x + gap;
  }

  /** @type {CanvasTextBaseline} */
  let textBaseline = "middle";
  let labelY = (topY + bottomY) / 2;
  if (alignV === "top") {
    textBaseline = "top";
    labelY = topY + gap;
  } else if (alignV === "bottom") {
    textBaseline = "bottom";
    labelY = bottomY - gap;
  }

  return { x: labelX, y: labelY, textAlign, textBaseline };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} normalized
 * @param {{ level: FibRetracementLevel, price: number, y: number }[]} levels
 * @param {number} levelX1
 * @param {number} levelX2
 * @param {{ precision?: number }} state
 */
function paintFibHorizontalLevels(ctx, normalized, levels, levelX1, levelX2, state = {}) {
  const precision = state.precision ?? 2;
  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  const useOne = Boolean(normalized.fibUseOneColor);
  const displayMode = normalized.fibLevelsDisplayMode === "percents" ? "percents" : "values";

  if (normalized.showFibBackground !== false && levels.length >= 2) {
    for (let i = 0; i < levels.length - 1; i += 1) {
      const top = levels[i];
      const bot = levels[i + 1];
      const fillColor = applyColorOpacity(
        useOne ? baseColor : top.level.color ?? baseColor,
        normalized.fibBackgroundOpacity ?? 20,
      );
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.rect(levelX1, top.y, levelX2 - levelX1, bot.y - top.y);
      ctx.fill();
      ctx.restore();
    }
  }

  const lw = normalized.fibLevelsLineWidth ?? 2;
  const dash = LINE_STYLE_DASH[normalized.fibLevelsLineStyle ?? 0] ?? [];
  for (const item of levels) {
    const color = applyColorOpacity(
      useOne ? baseColor : item.level.color ?? baseColor,
      useOne ? baseOpacity : item.level.colorOpacity ?? baseOpacity,
    );
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    if (dash.length) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(levelX1, item.y);
    ctx.lineTo(levelX2, item.y);
    ctx.stroke();
    ctx.restore();

    if (normalized.showFibLevelLabels !== false || normalized.showFibPrices) {
      const parts = [];
      if (normalized.showFibLevelLabels !== false) {
        parts.push(formatFibLevelOffset(item.level.offset, displayMode));
      }
      if (normalized.showFibPrices) {
        parts.push(`(${Number(item.price).toFixed(precision)})`);
      }
      const label = parts.join(" ");
      const labelColor = applyColorOpacity(
        useOne ? baseColor : item.level.color ?? baseColor,
        useOne ? baseOpacity : item.level.colorOpacity ?? baseOpacity,
      );
      const fontSize = normalized.fontSize ?? 12;
      const layout = fibLevelLabelLayout(
        normalized.fibLabelAlignH ?? "left",
        normalized.fibLabelAlignV ?? "middle",
        levelX1,
        levelX2,
        item.y,
        fontSize,
      );
      ctx.save();
      ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = layout.textAlign;
      ctx.textBaseline = layout.textBaseline;
      ctx.fillText(label, layout.x, layout.y);
      ctx.restore();
    }
  }
}

function paintFibTrendLine(ctx, normalized, ax, ay, bx, by) {
  if (normalized.showFibTrendLine === false) return;
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
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {import("../../types.js").DrawPoint} p2
 * @param {number} level
 */
function fibExtensionPriceAtLevel(p0, p1, p2, level) {
  return p2.price + (p1.price - p0.price) * level;
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
export function renderFibRetracementDrawing(
  ctx,
  drawing,
  timeToX,
  priceToY,
  leftX,
  rightX,
  bottomY,
  state = {},
) {
  const geom = fibRetracementGeometry(drawing, timeToX, priceToY);
  if (!geom) return;
  const { normalized, ax, ay, bx, by, levels } = geom;

  const extend = {
    extendLeft: Boolean(normalized.extendLeft),
    extendRight: Boolean(normalized.extendRight),
  };
  const anchorX1 = Math.min(ax, bx);
  const anchorX2 = Math.max(ax, bx);
  const levelX1 = extend.extendLeft ? leftX : anchorX1;
  const levelX2 = extend.extendRight ? rightX : anchorX2;

  paintFibHorizontalLevels(ctx, normalized, levels, levelX1, levelX2, state);
  paintFibTrendLine(ctx, normalized, ax, ay, bx, by);
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
function fibExtensionGeometry(drawing, timeToX, priceToY) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  const p2 = normalized.points?.[2];
  if (!p0 || !p1 || !p2) return null;

  const ax = timeToX(p0.time);
  const ay = priceToY(p0.price);
  const bx = timeToX(p1.time);
  const by = priceToY(p1.price);
  const cx = timeToX(p2.time);
  const cy = priceToY(p2.price);
  if ([ax, ay, bx, by, cx, cy].some((v) => v == null)) return null;

  const levels = normalizeFibLevels(normalized.fibLevels, normalized.type)
    .filter((l) => l.enabled)
    .map((level) => {
      const price = fibExtensionPriceAtLevel(p0, p1, p2, level.offset);
      return { level, price, y: priceToY(price) };
    })
    .filter((item) => item.y != null)
    .sort((a, b) => a.y - b.y);

  return { normalized, p0, p1, p2, ax, ay, bx, by, cx, cy, levels };
}

export function renderFibExtensionDrawing(
  ctx,
  drawing,
  timeToX,
  priceToY,
  leftX,
  rightX,
  bottomY,
  state = {},
) {
  const geom = fibExtensionGeometry(drawing, timeToX, priceToY);
  if (!geom) return;
  const { normalized, ax, ay, bx, by, cx, cy, levels } = geom;
  const extend = {
    extendLeft: Boolean(normalized.extendLeft),
    extendRight: Boolean(normalized.extendRight),
  };
  const anchorX1 = Math.min(ax, bx, cx);
  const anchorX2 = Math.max(ax, bx, cx);
  const levelX1 = extend.extendLeft ? leftX : anchorX1;
  const levelX2 = extend.extendRight ? rightX : anchorX2;

  paintFibHorizontalLevels(ctx, normalized, levels, levelX1, levelX2, state);
  paintFibTrendLine(ctx, normalized, ax, ay, bx, by);
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
    ctx.moveTo(bx, by);
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
function fibChannelGeometry(drawing, timeToX, priceToY) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  const p2 = normalized.points?.[2];
  if (!p0 || !p1 || !p2) return null;

  const a = { x: timeToX(p0.time), y: priceToY(p0.price) };
  const b = { x: timeToX(p1.time), y: priceToY(p1.price) };
  const c = { x: timeToX(p2.time), y: priceToY(p2.price) };
  if ([a.x, a.y, b.x, b.y, c.x, c.y].some((v) => v == null)) return null;

  const levels = normalizeFibLevels(normalized.fibLevels, normalized.type).filter((l) => l.enabled);
  return { normalized, a, b, c, levels };
}

export function renderFibChannelDrawing(
  ctx,
  drawing,
  timeToX,
  priceToY,
  leftX,
  rightX,
  bottomY,
  state = {},
) {
  const geom = fibChannelGeometry(drawing, timeToX, priceToY);
  if (!geom) return;
  const { normalized, a, b, c, levels } = geom;
  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  const useOne = Boolean(normalized.fibUseOneColor);
  const lw = normalized.fibLevelsLineWidth ?? 2;
  const dash = LINE_STYLE_DASH[normalized.fibLevelsLineStyle ?? 0] ?? [];
  const displayMode = normalized.fibLevelsDisplayMode === "percents" ? "percents" : "values";
  const fontSize = normalized.fontSize ?? 12;

  const levelSegments = levels.map((level) => {
    const r = level.offset;
    const ox = a.x + (c.x - a.x) * r;
    const oy = a.y + (c.y - a.y) * r;
    const seg = clipLineThroughPoints(
      { x: ox, y: oy },
      { x: ox + (b.x - a.x), y: oy + (b.y - a.y) },
      leftX,
      rightX,
      0,
      bottomY,
    );
    return { level, seg };
  });

  if (normalized.showFibBackground !== false && levelSegments.length >= 2) {
    for (let i = 0; i < levelSegments.length - 1; i += 1) {
      const top = levelSegments[i];
      const bot = levelSegments[i + 1];
      const fillColor = applyColorOpacity(
        useOne ? baseColor : top.level.color ?? baseColor,
        normalized.fibBackgroundOpacity ?? 20,
      );
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(top.seg.x1, top.seg.y1);
      ctx.lineTo(top.seg.x2, top.seg.y2);
      ctx.lineTo(bot.seg.x2, bot.seg.y2);
      ctx.lineTo(bot.seg.x1, bot.seg.y1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  for (const { level, seg } of levelSegments) {
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

    if (normalized.showFibLevelLabels !== false || normalized.showFibPrices) {
      const parts = [];
      if (normalized.showFibLevelLabels !== false) {
        parts.push(formatFibLevelOffset(level.offset, displayMode));
      }
      const midX = (seg.x1 + seg.x2) / 2;
      const midY = (seg.y1 + seg.y2) / 2;
      const layout = fibLevelLabelLayout(
        normalized.fibLabelAlignH ?? "left",
        normalized.fibLabelAlignV ?? "middle",
        seg.x1,
        seg.x2,
        midY,
        fontSize,
      );
      const label = parts.join(" ");
      ctx.save();
      ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = layout.textAlign;
      ctx.textBaseline = layout.textBaseline;
      ctx.fillText(label, layout.x, layout.y);
      ctx.restore();
    }
  }

  paintFibTrendLine(ctx, normalized, a.x, a.y, b.x, b.y);
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 */
function fibTimeZoneGeometry(drawing, timeToX) {
  const normalized = finalizeFibRetracementDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return null;

  const ax = timeToX(p0.time);
  const bx = timeToX(p1.time);
  if (ax == null || bx == null) return null;

  const span = bx - ax;
  const levels = normalizeFibLevels(normalized.fibLevels, normalized.type)
    .filter((l) => l.enabled)
    .map((level) => ({
      level,
      x: ax + span * level.offset,
    }))
    .sort((a, b) => a.x - b.x);

  return { normalized, p0, p1, ax, bx, span, levels };
}

export function renderFibTimeZoneDrawing(
  ctx,
  drawing,
  timeToX,
  priceToY,
  leftX,
  rightX,
  bottomY,
  state = {},
) {
  const geom = fibTimeZoneGeometry(drawing, timeToX);
  if (!geom) return;
  const { normalized, levels } = geom;
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
}

/** Unified fib style renderer for retracement family tools. */
export function renderFibStyleDrawing(
  ctx,
  drawing,
  timeToX,
  priceToY,
  leftX,
  rightX,
  bottomY,
  state = {},
) {
  switch (drawing.type) {
    case "fib-extension":
      renderFibExtensionDrawing(ctx, drawing, timeToX, priceToY, leftX, rightX, bottomY, state);
      break;
    case "fib-channel":
      renderFibChannelDrawing(ctx, drawing, timeToX, priceToY, leftX, rightX, bottomY, state);
      break;
    case "fib-time-zone":
      renderFibTimeZoneDrawing(ctx, drawing, timeToX, priceToY, leftX, rightX, bottomY, state);
      break;
    case "trend-based-fib-time":
      renderTrendBasedFibTimeDrawing(ctx, drawing, timeToX, priceToY, leftX, rightX, bottomY, state);
      break;
    case "fib-circles":
      renderFibCirclesDrawing(ctx, drawing, timeToX, priceToY);
      break;
    case "fib-spiral":
      renderFibSpiralDrawing(ctx, drawing, timeToX, priceToY);
      break;
    case "fib-wedge":
      renderFibWedgeDrawing(ctx, drawing, timeToX, priceToY, rightX, bottomY);
      break;
    default:
      renderFibRetracementDrawing(ctx, drawing, timeToX, priceToY, leftX, rightX, bottomY, state);
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
 */
export function hitFibRetracementDrawing(drawing, px, py, threshold, timeToX, priceToY, right) {
  return hitFibStyleDrawing(drawing, px, py, threshold, timeToX, priceToY, right, 0);
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
 */
export function hitFibStyleDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom = 0) {
  if (drawing.type === "fib-extension") {
    const geom = fibExtensionGeometry(drawing, timeToX, priceToY);
    if (!geom) return false;
    const { ax, ay, bx, by, levels, normalized } = geom;
    const extend = {
      extendLeft: Boolean(normalized.extendLeft),
      extendRight: Boolean(normalized.extendRight),
    };
    const anchorX1 = Math.min(ax, bx, geom.cx);
    const anchorX2 = Math.max(ax, bx, geom.cx);
    const levelX1 = extend.extendLeft ? 0 : anchorX1;
    const levelX2 = extend.extendRight ? right : anchorX2;
    for (const item of levels) {
      if (Math.abs(py - item.y) <= threshold && px >= levelX1 - threshold && px <= levelX2 + threshold) {
        return true;
      }
    }
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay) <= threshold;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= threshold;
  }

  if (drawing.type === "fib-channel") {
    const geom = fibChannelGeometry(drawing, timeToX, priceToY);
    if (!geom) return false;
    const { a, b, c, levels } = geom;
    for (const level of levels) {
      const r = level.offset;
      const ox = a.x + (c.x - a.x) * r;
      const oy = a.y + (c.y - a.y) * r;
      const seg = clipLineThroughPoints(
        { x: ox, y: oy },
        { x: ox + (b.x - a.x), y: oy + (b.y - a.y) },
        0,
        right,
        0,
        bottom || 1e9,
      );
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      let t = ((px - seg.x1) * dx + (py - seg.y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy)) <= threshold) return true;
    }
    return false;
  }

  if (drawing.type === "fib-time-zone") {
    const geom = fibTimeZoneGeometry(drawing, timeToX);
    if (!geom) return false;
    for (const item of geom.levels) {
      if (Math.abs(px - item.x) <= threshold) return true;
    }
    return false;
  }

  if (drawing.type === "trend-based-fib-time") {
    return hitTrendBasedFibTimeDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom);
  }
  if (drawing.type === "fib-circles") {
    return hitFibCirclesDrawing(drawing, px, py, threshold, timeToX, priceToY);
  }
  if (drawing.type === "fib-spiral") {
    return hitFibSpiralDrawing(drawing, px, py, threshold, timeToX, priceToY);
  }
  if (drawing.type === "fib-wedge") {
    return hitFibWedgeDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom);
  }

  const geom = fibRetracementGeometry(drawing, timeToX, priceToY);
  if (!geom) return false;
  const { ax, ay, bx, by, levels, normalized } = geom;
  const extend = {
    extendLeft: Boolean(normalized.extendLeft),
    extendRight: Boolean(normalized.extendRight),
  };
  const anchorX1 = Math.min(ax, bx);
  const anchorX2 = Math.max(ax, bx);
  const levelX1 = extend.extendLeft ? 0 : anchorX1;
  const levelX2 = extend.extendRight ? right : anchorX2;

  for (const item of levels) {
    if (Math.abs(py - item.y) <= threshold && px >= levelX1 - threshold && px <= levelX2 + threshold) {
      return true;
    }
  }

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay) <= threshold;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= threshold;
}

/** @param {string} type @param {import("../../types.js").DrawPoint[]} points */
export function fibRetracementDraft(type, points, overrides = {}) {
  return finalizeFibRetracementDrawing({
    type,
    points,
    ...newDrawingDefaults(type),
    ...overrides,
  });
}
