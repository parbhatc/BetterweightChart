import { resolveStudyLabelPositions } from "../../indicators/primitives/scaleLabels.js";

export const ORDER_LINE_FONT =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
export const ORDER_LINE_ROW_H = 18;
export const ORDER_LINE_WIDTH = 1;

/** @param {number} y — series media Y for the order price */
export function orderLineCenterY(y) {
  if (!Number.isFinite(y)) return 0;
  return Math.round(y) + (ORDER_LINE_WIDTH % 2 ? 0.5 : 0);
}
export const ORDER_LINE_CANCEL_W = 18;
export const ORDER_LINE_GAP = 0;
export const ORDER_LINE_PAD_X = 6;
export const ORDER_LINE_FONT_SIZE = 11;
export const ORDER_LINE_MIN_BODY_W = 36;
export const ORDER_LINE_MIN_QTY_W = 22;
export const ORDER_LINE_PILL_INSET = 4;

/**
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} ctx
 * @param {string} text
 */
function measureTextWidth(ctx, text) {
  if (!ctx) return text.length * 7;
  ctx.font = `600 ${ORDER_LINE_FONT_SIZE}px ${ORDER_LINE_FONT}`;
  return ctx.measureText(text).width;
}

/**
 * @param {import("./types.js").OrderLineState} state
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} [ctx]
 */
export function measureOrderLineRow(state, ctx = null) {
  const paintCtx =
    ctx ??
    (typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null);

  const bodyText = state.text?.trim() || " ";
  const qtyText = state.quantity?.trim() || "";

  const bodyInner = measureTextWidth(paintCtx, bodyText);
  const qtyInner = qtyText ? measureTextWidth(paintCtx, qtyText) : 0;

  const bodyW = Math.max(ORDER_LINE_MIN_BODY_W, Math.ceil(bodyInner + ORDER_LINE_PAD_X * 2));
  const qtyW = qtyText
    ? Math.max(ORDER_LINE_MIN_QTY_W, Math.ceil(qtyInner + ORDER_LINE_PAD_X * 2))
    : 0;
  const totalW = bodyW + (qtyW ? ORDER_LINE_GAP + qtyW : 0) + ORDER_LINE_GAP + ORDER_LINE_CANCEL_W;

  return { bodyText, qtyText, bodyW, qtyW, totalW };
}

/**
 * @param {import("./types.js").OrderLineState} state
 * @param {number} paneW
 * @param {number} scaleW
 */
export function layoutOrderLineGeometry(state, paneW, _scaleW) {
  const { totalW } = measureOrderLineRow(state);
  const plotRight = paneW;
  const offset = Math.max(0, Number(state.pillOffset) || 0);
  const rowLeft =
    state.pillSide === "left"
      ? ORDER_LINE_PILL_INSET + offset
      : Math.max(0, plotRight - totalW - offset);
  return {
    totalW,
    plotEdge: plotRight,
    rowLeft,
  };
}

/** @param {number} price */
export function formatOrderLinePrice(price) {
  if (!Number.isFinite(price)) return "";
  const abs = Math.abs(price);
  const dec = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return price.toFixed(dec);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} rtl
 * @param {number} rtr
 * @param {number} rbr
 * @param {number} rbl
 */
function roundRect(ctx, x, y, w, h, rtl, rtr, rbr, rbl) {
  const maxR = Math.min(w / 2, h / 2);
  const tl = Math.min(rtl, maxR);
  const tr = Math.min(rtr, maxR);
  const br = Math.min(rbr, maxR);
  const bl = Math.min(rbl, maxR);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.quadraticCurveTo(x, y, x + tl, y);
  else ctx.lineTo(x, y);
  ctx.closePath();
}

/**
 * Stack order-line price-axis badges (entry / SL / TP) when noOverlappingLabels is on.
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {import("./types.js").OrderLineLayout[]} layouts
 * @param {{ price: number, labelHeight?: number }[]} [reserved]
 * @returns {Map<string, number>} order line id → badge centerY (media coords)
 */
export function resolveOrderLineAxisBadgePositions(series, layouts, reserved = []) {
  if (!series || !layouts.length) return new Map();

  const labels = layouts.map((layout) => ({
    id: layout.state.id,
    price: layout.state.price,
    color: layout.state.lineColor || layout.state.bodyBackgroundColor,
    text: formatOrderLinePrice(layout.state.price),
  }));

  const resolved = resolveStudyLabelPositions(
    series,
    labels,
    reserved.map((anchor) => ({ ...anchor, labelHeight: anchor.labelHeight ?? ORDER_LINE_ROW_H })),
  );

  /** @type {Map<string, number>} */
  const out = new Map();
  for (const row of resolved) {
    if (row.id != null) out.set(String(row.id), row.centerY);
  }
  return out;
}

/**
 * Price-axis badge — matches symbol price line (PriceLineLabelPrimitive).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./types.js").OrderLineState} state
 * @param {number} y
 * @param {number} scaleW
 * @param {number} [centerYOverride]
 */
export function drawOrderLineAxisPriceBadge(ctx, state, y, scaleW, centerYOverride) {
  const priceText = formatOrderLinePrice(state.price);
  if (!priceText) return;

  const centerY =
    centerYOverride != null && Number.isFinite(centerYOverride)
      ? centerYOverride
      : orderLineCenterY(y);
  const rowH = ORDER_LINE_ROW_H;
  const top = Math.round(centerY - rowH / 2);
  const color = state.lineColor || state.bodyBackgroundColor;

  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, 0, top, scaleW, rowH, 2, 0, 0, 2);
  ctx.fill();
  const fill = color?.toLowerCase?.() ?? "";
  const axisText =
    fill === "#00ff00"
      ? "#000000"
      : fill === "#ff0000"
        ? "#ffffff"
        : state.bodyTextColor || "#ffffff";
  ctx.fillStyle = axisText;
  ctx.font = `600 12px ${ORDER_LINE_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(priceText, scaleW / 2, top + rowH / 2);
  ctx.restore();
}

/**
 * Order control pill on the chart pane — vertically centered on the line.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./types.js").OrderLineState} state
 * @param {number} left
 * @param {number} y
 */
export function drawOrderLineRow(ctx, state, left, y) {
  const { bodyText, qtyText, bodyW, qtyW, totalW } = measureOrderLineRow(state, ctx);
  const top = Math.round(y - ORDER_LINE_ROW_H / 2);
  const x = Math.round(left);
  const accent = state.lineColor || state.bodyBackgroundColor;
  const bodyBg = state.bodyBackgroundColor || accent;
  const qtyBg = state.quantityBackgroundColor || accent;
  const cancelLeft = x + totalW - ORDER_LINE_CANCEL_W;
  const mainW = totalW - ORDER_LINE_CANCEL_W;

  ctx.save();
  ctx.font = `600 ${ORDER_LINE_FONT_SIZE}px ${ORDER_LINE_FONT}`;

  roundRect(ctx, x, top, totalW, ORDER_LINE_ROW_H, 2, 2, 2, 2);
  ctx.fillStyle = bodyBg;
  ctx.fill();

  if (qtyW) {
    ctx.fillStyle = qtyBg;
    ctx.fillRect(x + bodyW, top, qtyW, ORDER_LINE_ROW_H);
  }

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fillRect(cancelLeft, top, ORDER_LINE_CANCEL_W, ORDER_LINE_ROW_H);

  roundRect(ctx, x, top, totalW, ORDER_LINE_ROW_H, 2, 2, 2, 2);
  ctx.clip();

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  if (qtyW) {
    ctx.beginPath();
    ctx.moveTo(x + bodyW + 0.5, top);
    ctx.lineTo(x + bodyW + 0.5, top + ORDER_LINE_ROW_H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cancelLeft + 0.5, top);
  ctx.lineTo(cancelLeft + 0.5, top + ORDER_LINE_ROW_H);
  ctx.stroke();

  ctx.fillStyle = state.bodyTextColor || "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bodyText, x + bodyW / 2, top + ORDER_LINE_ROW_H / 2);

  if (qtyW) {
    ctx.fillStyle = state.quantityTextColor || "#ffffff";
    ctx.fillText(qtyText, x + bodyW + qtyW / 2, top + ORDER_LINE_ROW_H / 2);
  }

  ctx.strokeStyle = state.cancelButtonIconColor || "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.25;
  const cx = cancelLeft + ORDER_LINE_CANCEL_W / 2;
  const cy = top + ORDER_LINE_ROW_H / 2;
  const s = 3.5;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s);
  ctx.lineTo(cx + s, cy + s);
  ctx.moveTo(cx + s, cy - s);
  ctx.lineTo(cx - s, cy + s);
  ctx.stroke();

  ctx.restore();

  return { left: x, top, width: totalW, height: ORDER_LINE_ROW_H, cancelLeft, mainW };
}
