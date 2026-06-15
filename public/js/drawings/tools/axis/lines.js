/** @type {readonly string[]} */
export const HORIZONTAL_AXIS_LINE_TYPES = ["horizontal-line", "horizontal-ray"];

/** @type {readonly string[]} */
export const VERTICAL_AXIS_LINE_TYPES = ["vertical-line"];

/** @type {readonly string[]} */
export const CROSS_AXIS_LINE_TYPES = ["cross-line"];

/** @type {readonly string[]} */
export const AXIS_LINE_TYPES = [
  ...HORIZONTAL_AXIS_LINE_TYPES,
  ...VERTICAL_AXIS_LINE_TYPES,
  ...CROSS_AXIS_LINE_TYPES,
];

/** @param {string} drawingType */
export function isAxisLineTool(drawingType) {
  return AXIS_LINE_TYPES.includes(drawingType);
}

/** @param {string} drawingType */
export function isHorizontalAxisLineTool(drawingType) {
  return HORIZONTAL_AXIS_LINE_TYPES.includes(drawingType);
}

/** @param {string} drawingType */
export function isVerticalAxisLineTool(drawingType) {
  return VERTICAL_AXIS_LINE_TYPES.includes(drawingType);
}

/** @param {string} drawingType */
export function isCrossAxisLineTool(drawingType) {
  return CROSS_AXIS_LINE_TYPES.includes(drawingType);
}

/** @param {string} drawingType */
export function supportsAxisLineStyleSettings(drawingType) {
  return isAxisLineTool(drawingType);
}

/**
 * @param {string} drawingType
 * @returns {{ price: boolean, bar: boolean, head: string }}
 */
export function axisLineCoordFields(drawingType) {
  if (isHorizontalAxisLineTool(drawingType)) {
    return { price: true, bar: false, head: "#1 (price)" };
  }
  if (isVerticalAxisLineTool(drawingType)) {
    return { price: false, bar: true, head: "#1 (bar)" };
  }
  if (isCrossAxisLineTool(drawingType)) {
    return { price: true, bar: true, head: "#1 (price, bar)" };
  }
  return { price: true, bar: true, head: "#1" };
}

/** @param {string} drawingType */
export function axisLineShowsPriceLabelOption(drawingType) {
  return isHorizontalAxisLineTool(drawingType) || isCrossAxisLineTool(drawingType);
}

/** @param {string} drawingType */
export function axisLineShowsTimeLabelOption(drawingType) {
  return isVerticalAxisLineTool(drawingType) || isCrossAxisLineTool(drawingType);
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function drawingUsesPriceAxisLabel(drawing) {
  if (!drawing.showPriceLabels) return false;
  if (isHorizontalAxisLineTool(drawing.type) || isCrossAxisLineTool(drawing.type)) return true;
  return false;
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function drawingUsesTimeAxisLabel(drawing) {
  if (!drawing.showTimeLabel) return false;
  return isVerticalAxisLineTool(drawing.type) || isCrossAxisLineTool(drawing.type);
}

/** @type {Record<string, Record<string, unknown>>} */
export const AXIS_LINE_DEFAULTS = {
  "horizontal-line": { showPriceLabels: true, showTimeLabel: false },
  "horizontal-ray": { showPriceLabels: true, showTimeLabel: false },
  "vertical-line": { showPriceLabels: false, showTimeLabel: true },
  "cross-line": { showPriceLabels: true, showTimeLabel: true },
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} bottom
 * @param {string} text
 * @param {string} color
 */
export function drawTimeAxisLabel(ctx, x, bottom, text, color) {
  const fontSize = 11;
  const padX = 6;
  const padY = 3;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontSize + padY * 2;
  const boxX = x - w / 2;
  const boxY = bottom - h - 2;
  ctx.fillStyle = color;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, w, h, 2);
    ctx.fill();
  } else {
    ctx.fillRect(boxX, boxY, w, h);
  }
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, boxY + h / 2);
  ctx.restore();
}
