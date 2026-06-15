export const PILL_FONT_SIZE = 12;
export const PILL_PAD_X = 10;
export const PILL_PAD_Y = 5;
export const PILL_RADIUS = 4;

/** @type {CanvasRenderingContext2D | null} */
let measureCtx = null;

function getMeasureCtx() {
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  return measureCtx;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} cx
 * @param {number} cy
 * @param {string} bg
 * @param {{ fontSize?: number, stroke?: string, textColor?: string }} [opts]
 */
export function drawCenteredPill(ctx, text, cx, cy, bg, opts = {}) {
  const fontSize = opts.fontSize ?? PILL_FONT_SIZE;
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + PILL_PAD_X * 2;
  const h = fontSize + PILL_PAD_Y * 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = bg;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, PILL_RADIUS);
    ctx.fill();
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else {
    ctx.fillRect(x, y, w, h);
    if (opts.stroke) ctx.strokeRect(x, y, w, h);
  }
  ctx.fillStyle = opts.textColor ?? "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
  return { x, y, width: w, height: h };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} cx
 * @param {number} edgeY
 * @param {string} bg
 * @param {"top" | "bottom"} anchor
 * @param {number} [fontSize]
 */
export function drawEdgePill(ctx, text, cx, edgeY, bg, anchor, fontSize = PILL_FONT_SIZE) {
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + PILL_PAD_X * 2;
  const h = fontSize + PILL_PAD_Y * 2;
  const x = cx - w / 2;
  const y = anchor === "top" ? edgeY : edgeY - h;
  ctx.fillStyle = bg;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, PILL_RADIUS);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2);
}

/**
 * @param {string[]} lines
 * @param {number} fontSize
 */
export function measurePillBlock(lines, fontSize = PILL_FONT_SIZE) {
  const ctx = getMeasureCtx();
  if (!ctx || !lines.length) return null;
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  const rowH = fontSize + PILL_PAD_Y * 2;
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, ctx.measureText(line).width + PILL_PAD_X * 2);
  }
  const height = lines.length * rowH + Math.max(0, lines.length - 1) * 3;
  return { width, height, rowH };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, width: number, height: number, lines: string[], rowH: number, cx: number }} layout
 * @param {string} bg
 * @param {number} fontSize
 */
export function drawPillBlock(ctx, layout, bg, fontSize = PILL_FONT_SIZE) {
  ctx.fillStyle = bg;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(layout.x, layout.y, layout.width, layout.height, PILL_RADIUS);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
    ctx.strokeRect(layout.x, layout.y, layout.width, layout.height);
  }
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let rowY = layout.y + layout.rowH / 2;
  for (let i = 0; i < layout.lines.length; i += 1) {
    ctx.fillText(layout.lines[i], layout.cx, rowY);
    rowY += layout.rowH + 3;
  }
}
