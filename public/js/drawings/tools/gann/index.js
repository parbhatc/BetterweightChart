import { applyColorOpacity } from "../../../ui/color/picker.js";
import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { clipLineThroughPoints, strokeSegment } from "../line/math.js";

/** @typedef {{ offset?: number, enabled: boolean, color?: string, colorOpacity?: number, label?: string, timeMul?: number, priceMul?: number }} GannLevel */

const GANN_BOX_OFFSETS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];
const GANN_BOX_COLORS = ["#808080", "#ff9800", "#00bcd4", "#4caf50", "#089981", "#2962FF", "#808080"];

const GANN_FAN_RATIOS = [
  { label: "1/8", timeMul: 8, priceMul: 1, color: "#ff9800" },
  { label: "1/4", timeMul: 4, priceMul: 1, color: "#089981" },
  { label: "1/3", timeMul: 3, priceMul: 1, color: "#4caf50" },
  { label: "1/2", timeMul: 2, priceMul: 1, color: "#089981" },
  { label: "1/1", timeMul: 1, priceMul: 1, color: "#00bcd4" },
  { label: "2/1", timeMul: 1, priceMul: 2, color: "#2962FF" },
  { label: "3/1", timeMul: 1, priceMul: 3, color: "#9c27b0" },
  { label: "4/1", timeMul: 1, priceMul: 4, color: "#e91e63" },
  { label: "8/1", timeMul: 1, priceMul: 8, color: "#f23645" },
];

const GANN_SQUARE_FAN_DEFS = [
  { label: "8x1", timeMul: 8, priceMul: 1, color: "#b39ddb", enabled: false },
  { label: "5x1", timeMul: 5, priceMul: 1, color: "#f23645", enabled: false },
  { label: "4x1", timeMul: 4, priceMul: 1, color: "#808080", enabled: false },
  { label: "3x1", timeMul: 3, priceMul: 1, color: "#ff9800", enabled: false },
  { label: "2x1", timeMul: 2, priceMul: 1, color: "#00bcd4", enabled: true },
  { label: "1x1", timeMul: 1, priceMul: 1, color: "#4caf50", enabled: true },
  { label: "1x2", timeMul: 1, priceMul: 2, color: "#089981", enabled: true },
  { label: "1x3", timeMul: 1, priceMul: 3, color: "#089981", enabled: false },
  { label: "1x4", timeMul: 1, priceMul: 4, color: "#2962FF", enabled: false },
  { label: "1x5", timeMul: 1, priceMul: 5, color: "#9575cd", enabled: false },
  { label: "1x8", timeMul: 1, priceMul: 8, color: "#b39ddb", enabled: false },
];

const GANN_SQUARE_ARC_DEFS = [
  { label: "1x0", timeMul: 1, priceMul: 0, color: "#ff9800" },
  { label: "1x1", timeMul: 1, priceMul: 1, color: "#ff9800" },
  { label: "1.5x0", timeMul: 1.5, priceMul: 0, color: "#ff9800" },
  { label: "2x0", timeMul: 2, priceMul: 0, color: "#00bcd4" },
  { label: "2x1", timeMul: 2, priceMul: 1, color: "#00bcd4" },
  { label: "3x0", timeMul: 3, priceMul: 0, color: "#4caf50" },
  { label: "3x1", timeMul: 3, priceMul: 1, color: "#4caf50" },
  { label: "4x0", timeMul: 4, priceMul: 0, color: "#089981" },
  { label: "4x1", timeMul: 4, priceMul: 1, color: "#089981" },
  { label: "5x0", timeMul: 5, priceMul: 0, color: "#2962FF" },
  { label: "5x1", timeMul: 5, priceMul: 1, color: "#2962FF" },
];

const GANN_SQUARE_LEVEL_COLORS = ["#808080", "#ff9800", "#00bcd4", "#4caf50", "#089981", "#808080"];

/** @returns {GannLevel[]} */
export function defaultGannBoxLevels() {
  return GANN_BOX_OFFSETS.map((offset, i) => ({
    offset,
    enabled: true,
    color: GANN_BOX_COLORS[i] ?? "#808080",
    colorOpacity: 100,
  }));
}

/** @returns {GannLevel[]} */
export function defaultGannFanLevels() {
  return GANN_FAN_RATIOS.map((def) => ({
    label: def.label,
    timeMul: def.timeMul,
    priceMul: def.priceMul,
    enabled: true,
    color: def.color,
    colorOpacity: 100,
  }));
}

/** @returns {GannLevel[]} */
export function defaultGannSquareLevels() {
  return [0, 1, 2, 3, 4, 5].map((offset, i) => ({
    offset,
    enabled: true,
    color: GANN_SQUARE_LEVEL_COLORS[i] ?? "#808080",
    colorOpacity: 100,
  }));
}

/** @returns {GannLevel[]} */
export function defaultGannSquareFanLevels() {
  return GANN_SQUARE_FAN_DEFS.map((def) => ({
    label: def.label,
    timeMul: def.timeMul,
    priceMul: def.priceMul,
    enabled: def.enabled,
    color: def.color,
    colorOpacity: 100,
  }));
}

/** @returns {GannLevel[]} */
export function defaultGannSquareArcLevels() {
  return GANN_SQUARE_ARC_DEFS.map((def) => ({
    label: def.label,
    timeMul: def.timeMul,
    priceMul: def.priceMul,
    enabled: true,
    color: def.color,
    colorOpacity: 100,
  }));
}

export const GANN_DEFAULTS = {
  gannPriceLevels: defaultGannBoxLevels(),
  gannTimeLevels: defaultGannBoxLevels(),
  gannLevels: defaultGannSquareLevels(),
  gannFanLevels: defaultGannSquareFanLevels(),
  gannArcLevels: defaultGannSquareArcLevels(),
  gannFanLineLevels: defaultGannFanLevels(),
  gannUseOneColor: false,
  showGannBackground: true,
  gannBackgroundColor: "#2962FF",
  gannBackgroundOpacity: 20,
  gannReverse: false,
  showGannAngles: false,
  gannAnglesColor: "#9c9c9c",
  gannAnglesOpacity: 100,
  showGannLeftLabels: true,
  showGannRightLabels: true,
  showGannTopLabels: true,
  showGannBottomLabels: true,
  showGannLabels: true,
  showGannRangesText: true,
  gannLineWidth: 1,
  scaleRatio: null,
  fontSize: 12,
};

/** @param {string} drawingType */
export function supportsGannStyleSettings(drawingType) {
  return (
    drawingType === "gann-box" ||
    drawingType === "gann-fan" ||
    drawingType === "gann-square" ||
    drawingType === "gann-square-fixed"
  );
}

/** @param {string} drawingType */
export function isGannTool(drawingType) {
  return supportsGannStyleSettings(drawingType);
}

/** @param {string} drawingType */
export function isGannDrawingType(drawingType) {
  return isGannTool(drawingType);
}

/** @param {GannLevel[] | undefined} levels @param {() => GannLevel[]} defaults */
function normalizeLevelList(levels, defaults) {
  const defs = defaults();
  if (!Array.isArray(levels) || !levels.length) return defs;
  return defs.map((def, i) => {
    const byOffset = levels.find((l) => l.offset === def.offset);
    const byLabel = def.label ? levels.find((l) => l.label === def.label) : null;
    const src = byOffset ?? byLabel ?? levels[i] ?? def;
    return {
      ...def,
      enabled: src.enabled !== undefined ? Boolean(src.enabled) : def.enabled,
      color: src.color ?? def.color,
      colorOpacity: src.colorOpacity ?? def.colorOpacity ?? 100,
      offset: src.offset ?? def.offset,
      label: src.label ?? def.label,
      timeMul: src.timeMul ?? def.timeMul,
      priceMul: src.priceMul ?? def.priceMul,
    };
  });
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeGannDrawing(drawing) {
  if (!isGannTool(drawing.type)) return drawing;
  const type = drawing.type;
  const fanLevels =
    type === "gann-fan"
      ? normalizeLevelList(drawing.gannFanLineLevels, defaultGannFanLevels)
      : normalizeLevelList(drawing.gannFanLevels, defaultGannSquareFanLevels);

  return {
    ...GANN_DEFAULTS,
    ...drawing,
    gannPriceLevels: normalizeLevelList(drawing.gannPriceLevels, defaultGannBoxLevels),
    gannTimeLevels: normalizeLevelList(drawing.gannTimeLevels, defaultGannBoxLevels),
    gannLevels: normalizeLevelList(drawing.gannLevels, defaultGannSquareLevels),
    gannFanLevels: fanLevels,
    gannFanLineLevels:
      type === "gann-fan" ? fanLevels : normalizeLevelList(drawing.gannFanLineLevels, defaultGannFanLevels),
    gannArcLevels: normalizeLevelList(drawing.gannArcLevels, defaultGannSquareArcLevels),
    gannBackgroundColor: drawing.gannBackgroundColor ?? drawing.color ?? "#2962FF",
    gannAnglesColor: drawing.gannAnglesColor ?? "#9c9c9c",
  };
}

/** @param {number} offset @param {boolean} reverse */
function applyOffset(offset, reverse) {
  return reverse ? 1 - offset : offset;
}

/** @param {number} t @param {number} a @param {number} b */
function lerp(t, a, b) {
  return a + (b - a) * t;
}

/**
 * @param {import("../../types.js").DrawPoint} p0
 * @param {import("../../types.js").DrawPoint} p1
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
function boxCorners(p0, p1, timeToX, priceToY) {
  const x0 = timeToX(p0.time);
  const y0 = priceToY(p0.price);
  const x1 = timeToX(p1.time);
  const y1 = priceToY(p1.price);
  if ([x0, y0, x1, y1].some((v) => v == null)) return null;
  return {
    left: Math.min(x0, x1),
    right: Math.max(x0, x1),
    top: Math.min(y0, y1),
    bottom: Math.max(y0, y1),
    p0: { x: x0, y: y0 },
    p1: { x: x1, y: y1 },
  };
}

/** @param {import("../../types.js").UserDrawing} normalized @param {GannLevel[]} levelDefs @param {number} minVal @param {number} maxVal @param {boolean} reverse */
function offsetPositions(levelDefs, minVal, maxVal, reverse) {
  return levelDefs
    .filter((l) => l.enabled)
    .map((level) => {
      const t = applyOffset(level.offset ?? 0, reverse);
      return { level, pos: lerp(t, minVal, maxVal) };
    })
    .sort((a, b) => a.pos - b.pos);
}

/** @param {CanvasRenderingContext2D} ctx @param {string} color @param {number} lw */
function strokeHLine(ctx, y, x1, x2, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {string} color @param {number} lw */
function strokeVLine(ctx, x, y1, y2, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
  ctx.restore();
}

/** @param {import("../../types.js").UserDrawing} normalized */
function resolveLevelColor(normalized, level) {
  const baseColor = normalized.color ?? DEFAULT_DRAWING_COLOR;
  const baseOpacity = normalized.colorOpacity ?? 100;
  if (normalized.gannUseOneColor) {
    return applyColorOpacity(baseColor, baseOpacity);
  }
  return applyColorOpacity(level.color ?? baseColor, level.colorOpacity ?? baseOpacity);
}

/** @param {CanvasRenderingContext2D} ctx @param {import("../../types.js").UserDrawing} normalized @param {{ level: GannLevel, pos: number }[]} positions @param {number} x1 @param {number} x2 */
function paintHorizontalBandFills(ctx, normalized, positions, x1, x2) {
  if (normalized.showGannBackground === false || positions.length < 2) return;
  for (let i = 0; i < positions.length - 1; i += 1) {
    const top = positions[i];
    const bot = positions[i + 1];
    const fillColor = applyColorOpacity(
      normalized.gannUseOneColor
        ? normalized.gannBackgroundColor ?? normalized.color ?? "#2962FF"
        : top.level.color ?? normalized.gannBackgroundColor ?? "#2962FF",
      normalized.gannBackgroundOpacity ?? 20,
    );
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.fillRect(x1, top.pos, x2 - x1, bot.pos - top.pos);
    ctx.restore();
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {import("../../types.js").UserDrawing} normalized @param {{ level: GannLevel, pos: number }[]} positions @param {number} y1 @param {number} y2 */
function paintVerticalBandFills(ctx, normalized, positions, y1, y2) {
  if (normalized.showGannBackground === false || positions.length < 2) return;
  for (let i = 0; i < positions.length - 1; i += 1) {
    const left = positions[i];
    const right = positions[i + 1];
    const fillColor = applyColorOpacity(
      normalized.gannUseOneColor
        ? normalized.gannBackgroundColor ?? normalized.color ?? "#2962FF"
        : left.level.color ?? normalized.gannBackgroundColor ?? "#2962FF",
      normalized.gannBackgroundOpacity ?? 20,
    );
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.fillRect(left.pos, y1, right.pos - left.pos, y2 - y1);
    ctx.restore();
  }
}

/** @param {number} offset */
function formatBoxLevel(offset) {
  const text = Number(offset).toFixed(3).replace(/\.?0+$/, "");
  return text;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 */
function renderGannBox(ctx, drawing, timeToX, priceToY) {
  const normalized = finalizeGannDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return;

  const box = boxCorners(p0, p1, timeToX, priceToY);
  if (!box) return;

  const reverse = Boolean(normalized.gannReverse);
  const lw = normalized.gannLineWidth ?? 1;
  const fontSize = normalized.fontSize ?? 12;

  const hLevels = offsetPositions(normalized.gannPriceLevels, box.top, box.bottom, reverse);
  const vLevels = offsetPositions(normalized.gannTimeLevels, box.left, box.right, reverse);

  paintHorizontalBandFills(ctx, normalized, hLevels, box.left, box.right);
  paintVerticalBandFills(ctx, normalized, vLevels, box.top, box.bottom);

  for (const item of hLevels) {
    strokeHLine(ctx, item.pos, box.left, box.right, resolveLevelColor(normalized, item.level), lw);
  }
  for (const item of vLevels) {
    strokeVLine(ctx, item.pos, box.top, box.bottom, resolveLevelColor(normalized, item.level), lw);
  }

  ctx.save();
  ctx.strokeStyle = resolveLevelColor(normalized, { color: "#808080", colorOpacity: 100 });
  ctx.lineWidth = lw;
  ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  ctx.restore();

  const labelColor = applyColorOpacity(normalized.color ?? DEFAULT_DRAWING_COLOR, normalized.colorOpacity ?? 100);
  ctx.save();
  ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
  ctx.fillStyle = labelColor;

  if (normalized.showGannLeftLabels !== false) {
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const item of hLevels) {
      ctx.fillText(formatBoxLevel(item.level.offset ?? 0), box.left - 4, item.pos);
    }
  }
  if (normalized.showGannRightLabels !== false) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const item of hLevels) {
      ctx.fillText(formatBoxLevel(item.level.offset ?? 0), box.right + 4, item.pos);
    }
  }
  if (normalized.showGannTopLabels !== false) {
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const item of vLevels) {
      const displayOffset = applyOffset(item.level.offset ?? 0, true);
      ctx.fillText(formatBoxLevel(displayOffset), item.pos, box.top - 2);
    }
  }
  if (normalized.showGannBottomLabels !== false) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const item of vLevels) {
      const displayOffset = applyOffset(item.level.offset ?? 0, true);
      ctx.fillText(formatBoxLevel(displayOffset), item.pos, box.bottom + 2);
    }
  }
  ctx.restore();

  if (normalized.showGannAngles) {
    const origin = { x: box.left, y: box.bottom };
    const color = applyColorOpacity(
      normalized.gannAnglesColor ?? "#9c9c9c",
      normalized.gannAnglesOpacity ?? 100,
    );
    const diag = clipLineThroughPoints(origin, { x: box.right, y: box.top }, 0, 1e9, 0, 1e9);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    strokeSegment(ctx, diag);
    ctx.restore();
  }
}

/** For fan from origin with 1x1 reference point (priceMul / timeMul slope). */
function gannFanEndpointFrom11(origin, ref11, timeMul, priceMul) {
  const dx = ref11.x - origin.x;
  const dy = ref11.y - origin.y;
  const signX = dx >= 0 ? 1 : -1;
  const signY = dy <= 0 ? -1 : 1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const tMul = Math.max(timeMul, 0.01);
  const pMul = Math.max(priceMul, 0.01);
  const scale = Math.max(absDx / tMul, absDy / pMul, 1);
  return {
    x: origin.x + signX * scale * tMul,
    y: origin.y + signY * scale * pMul,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} rightX
 * @param {number} bottomY
 */
function renderGannFan(ctx, drawing, timeToX, priceToY, rightX, bottomY) {
  const normalized = finalizeGannDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return;

  const ox = timeToX(p0.time);
  const oy = priceToY(p0.price);
  const rx = timeToX(p1.time);
  const ry = priceToY(p1.price);
  if ([ox, oy, rx, ry].some((v) => v == null)) return;

  const origin = { x: ox, y: oy };
  const ref11 = { x: rx, y: ry };
  const lw = normalized.gannLineWidth ?? 1;
  const fontSize = normalized.fontSize ?? 12;
  const levels = normalized.gannFanLineLevels.filter((l) => l.enabled);

  if (normalized.showGannBackground !== false && levels.length >= 2) {
    for (let i = 0; i < levels.length - 1; i += 1) {
      const a = levels[i];
      const b = levels[i + 1];
      const e1 = gannFanEndpointFrom11(origin, ref11, a.timeMul ?? 1, a.priceMul ?? 1);
      const e2 = gannFanEndpointFrom11(origin, ref11, b.timeMul ?? 1, b.priceMul ?? 1);
      const fillColor = applyColorOpacity(
        normalized.gannUseOneColor
          ? normalized.gannBackgroundColor ?? normalized.color ?? "#2962FF"
          : a.color ?? normalized.gannBackgroundColor ?? "#2962FF",
        normalized.gannBackgroundOpacity ?? 20,
      );
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(e1.x, e1.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  for (const level of levels) {
    const end = gannFanEndpointFrom11(origin, ref11, level.timeMul ?? 1, level.priceMul ?? 1);
    const seg = clipLineThroughPoints(origin, end, 0, rightX, 0, bottomY);
    const color = resolveLevelColor(normalized, level);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    strokeSegment(ctx, seg);
    ctx.restore();

    if (normalized.showGannLabels !== false && level.label) {
      const mid = { x: (origin.x + seg.x2) / 2, y: (origin.y + seg.y2) / 2 };
      ctx.save();
      ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(level.label, mid.x + 4, mid.y - 2);
      ctx.restore();
    }
  }
}

/**
 * @param {{ x: number, y: number }} origin
 * @param {{ x: number, y: number }} ref11
 * @param {number} side
 */
function squareBounds(origin, ref11, side) {
  const signX = ref11.x >= origin.x ? 1 : -1;
  const signY = ref11.y <= origin.y ? 1 : -1;
  const left = origin.x;
  const right = origin.x + signX * side;
  const bottom = origin.y;
  const top = origin.y - signY * side;
  return {
    left: Math.min(left, right),
    right: Math.max(left, right),
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
    signX,
    signY,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} rightX
 * @param {number} bottomY
 */
function renderGannSquare(ctx, drawing, timeToX, priceToY, rightX, bottomY) {
  const normalized = finalizeGannDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return;

  const ox = timeToX(p0.time);
  const oy = priceToY(p0.price);
  const rx = timeToX(p1.time);
  const ry = priceToY(p1.price);
  if ([ox, oy, rx, ry].some((v) => v == null)) return;

  const origin = { x: ox, y: oy };
  const ref = { x: rx, y: ry };
  const rawW = Math.abs(ref.x - origin.x);
  const rawH = Math.abs(ref.y - origin.y);
  let side = Math.max(rawW, rawH);

  if (drawing.type === "gann-square") {
    const priceDelta = Math.abs(p1.price - p0.price);
    const timeDelta = Math.abs(p1.time - p0.time);
    const ratio =
      normalized.scaleRatio != null && Number.isFinite(Number(normalized.scaleRatio))
        ? Number(normalized.scaleRatio)
        : timeDelta > 0
          ? priceDelta / timeDelta
          : 1;
    const timePx = rawW;
    const pricePx = rawH;
    side = Math.max(timePx, pricePx / Math.max(ratio, 1e-9), 20);
  } else {
    side = Math.max(Math.min(rawW, rawH), 20);
  }

  const bounds = squareBounds(origin, ref, side);
  const lw = normalized.gannLineWidth ?? 1;
  const maxLevel = 5;
  const levelPositions = normalized.gannLevels
    .filter((l) => l.enabled)
    .map((level) => ({
      level,
      t: (level.offset ?? 0) / maxLevel,
    }));

  if (normalized.showGannBackground !== false) {
    const arcs = normalized.gannArcLevels.filter((l) => l.enabled);
    for (let i = arcs.length - 1; i >= 0; i -= 1) {
      const arc = arcs[i];
      const radius = side * ((arc.timeMul ?? 1) / maxLevel);
      const fillColor = applyColorOpacity(
        normalized.gannUseOneColor
          ? normalized.gannBackgroundColor ?? normalized.color ?? "#2962FF"
          : arc.color ?? normalized.gannBackgroundColor ?? "#2962FF",
        normalized.gannBackgroundOpacity ?? 20,
      );
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, Math.max(radius, 1), -Math.PI / 2, 0);
      ctx.lineTo(origin.x, origin.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  for (const item of levelPositions) {
    const x = lerp(item.t, bounds.left, bounds.right);
    const y = lerp(item.t, bounds.top, bounds.bottom);
    const color = resolveLevelColor(normalized, item.level);
    strokeVLine(ctx, x, bounds.top, bounds.bottom, color, lw);
    strokeHLine(ctx, y, bounds.left, bounds.right, color, lw);
  }

  ctx.save();
  ctx.strokeStyle = resolveLevelColor(normalized, { color: "#808080", colorOpacity: 100 });
  ctx.lineWidth = lw;
  ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  ctx.restore();

  const ref11 = { x: bounds.right, y: bounds.top };
  for (const fan of normalized.gannFanLevels.filter((l) => l.enabled)) {
    const end = gannFanEndpointFrom11(origin, ref11, fan.timeMul ?? 1, fan.priceMul ?? 1);
    const seg = clipLineThroughPoints(origin, end, 0, rightX, 0, bottomY);
    const color = resolveLevelColor(normalized, fan);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    strokeSegment(ctx, seg);
    ctx.restore();
  }

  for (const arc of normalized.gannArcLevels.filter((l) => l.enabled)) {
    const radius = side * ((arc.timeMul ?? 1) / maxLevel);
    const color = resolveLevelColor(normalized, arc);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, Math.max(radius, 1), -Math.PI / 2, 0);
    ctx.stroke();
    ctx.restore();
  }

  if (drawing.type === "gann-square" && normalized.showGannRangesText !== false) {
    const priceDelta = Math.abs(p1.price - p0.price);
    const timeDelta = Math.abs(p1.time - p0.time);
    const ratio = timeDelta > 0 ? priceDelta / timeDelta : 0;
    ctx.save();
    ctx.font = `500 ${normalized.fontSize ?? 12}px system-ui,sans-serif`;
    ctx.fillStyle = applyColorOpacity(normalized.color ?? DEFAULT_DRAWING_COLOR, normalized.colorOpacity ?? 100);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${priceDelta.toFixed(2)} / ${timeDelta}`, bounds.left + 4, bounds.top + 4);
    ctx.fillText(`1:${ratio.toFixed(4)}`, bounds.left + 4, bounds.top + 18);
    ctx.restore();
  }
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
export function renderGannStyleDrawing(ctx, drawing, timeToX, priceToY, leftX, rightX, bottomY, state = {}) {
  switch (drawing.type) {
    case "gann-box":
      renderGannBox(ctx, drawing, timeToX, priceToY);
      break;
    case "gann-fan":
      renderGannFan(ctx, drawing, timeToX, priceToY, rightX, bottomY);
      break;
    case "gann-square":
    case "gann-square-fixed":
      renderGannSquare(ctx, drawing, timeToX, priceToY, rightX, bottomY);
      break;
    default:
      break;
  }
}

/** @deprecated use renderGannStyleDrawing */
export function renderGannDrawing(ctx, drawing, pts, rightX, bottomY) {
  const timeToX = (t) => pts.find((p, i) => drawing.points?.[i]?.time === t)?.x ?? pts[0]?.x ?? 0;
  const priceToY = (p) => pts.find((pt, i) => drawing.points?.[i]?.price === p)?.y ?? pts[0]?.y ?? 0;
  renderGannStyleDrawing(ctx, drawing, timeToX, priceToY, 0, rightX, bottomY);
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
export function hitGannStyleDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom) {
  const normalized = finalizeGannDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return false;

  if (drawing.type === "gann-box") {
    const box = boxCorners(p0, p1, timeToX, priceToY);
    if (!box) return false;
    const reverse = Boolean(normalized.gannReverse);
    const hLevels = offsetPositions(normalized.gannPriceLevels, box.top, box.bottom, reverse);
    const vLevels = offsetPositions(normalized.gannTimeLevels, box.left, box.right, reverse);

    const edges = [
      [box.left, box.top, box.right, box.top],
      [box.right, box.top, box.right, box.bottom],
      [box.right, box.bottom, box.left, box.bottom],
      [box.left, box.bottom, box.left, box.top],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      if (distToSegment(px, py, x1, y1, x2, y2) <= threshold) return true;
    }
    for (const item of hLevels) {
      if (distToSegment(px, py, box.left, item.pos, box.right, item.pos) <= threshold) return true;
    }
    for (const item of vLevels) {
      if (distToSegment(px, py, item.pos, box.top, item.pos, box.bottom) <= threshold) return true;
    }
    return false;
  }

  const ox = timeToX(p0.time);
  const oy = priceToY(p0.price);
  const rx = timeToX(p1.time);
  const ry = priceToY(p1.price);
  if ([ox, oy, rx, ry].some((v) => v == null)) return false;
  const origin = { x: ox, y: oy };

  if (drawing.type === "gann-fan") {
    const ref11 = { x: rx, y: ry };
    for (const level of normalized.gannFanLineLevels.filter((l) => l.enabled)) {
      const end = gannFanEndpointFrom11(origin, ref11, level.timeMul ?? 1, level.priceMul ?? 1);
      const seg = clipLineThroughPoints(origin, end, 0, right, 0, bottom);
      if (distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold) return true;
    }
    return false;
  }

  const ref = { x: rx, y: ry };
  const rawW = Math.abs(ref.x - origin.x);
  const rawH = Math.abs(ref.y - origin.y);
  const side = drawing.type === "gann-square-fixed" ? Math.max(Math.min(rawW, rawH), 20) : Math.max(rawW, rawH, 20);
  const bounds = squareBounds(origin, ref, side);

  const border = [
    [bounds.left, bounds.top, bounds.right, bounds.top],
    [bounds.right, bounds.top, bounds.right, bounds.bottom],
    [bounds.right, bounds.bottom, bounds.left, bounds.bottom],
    [bounds.left, bounds.bottom, bounds.left, bounds.top],
  ];
  for (const [x1, y1, x2, y2] of border) {
    if (distToSegment(px, py, x1, y1, x2, y2) <= threshold) return true;
  }

  const maxLevel = 5;
  for (const level of normalized.gannLevels.filter((l) => l.enabled)) {
    const t = (level.offset ?? 0) / maxLevel;
    const x = lerp(t, bounds.left, bounds.right);
    const y = lerp(t, bounds.top, bounds.bottom);
    if (distToSegment(px, py, x, bounds.top, x, bounds.bottom) <= threshold) return true;
    if (distToSegment(px, py, bounds.left, y, bounds.right, y) <= threshold) return true;
  }

  const ref11 = { x: bounds.right, y: bounds.top };
  for (const fan of normalized.gannFanLevels.filter((l) => l.enabled)) {
    const end = gannFanEndpointFrom11(origin, ref11, fan.timeMul ?? 1, fan.priceMul ?? 1);
    const seg = clipLineThroughPoints(origin, end, 0, right, 0, bottom);
    if (distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold) return true;
  }

  for (const arc of normalized.gannArcLevels.filter((l) => l.enabled)) {
    const radius = side * ((arc.timeMul ?? 1) / maxLevel);
    const d = Math.hypot(px - origin.x, py - origin.y);
    if (Math.abs(d - radius) <= threshold) return true;
  }

  return false;
}

/** @deprecated use hitGannStyleDrawing */
export function hitGannDrawing(type, pts, px, py, threshold, right, bottom) {
  const drawing = { type, points: pts.map((p, i) => ({ time: i, price: p.y, x: p.x })) };
  const timeToX = (t) => pts[t]?.x ?? null;
  const priceToY = (p) => p;
  return hitGannStyleDrawing(drawing, px, py, threshold, timeToX, priceToY, right, bottom);
}
