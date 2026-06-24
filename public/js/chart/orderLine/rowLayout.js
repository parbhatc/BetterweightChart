import { resolveStudyLabelPositions } from "../../indicators/primitives/scaleLabels.js";
import { hasShellBorder } from "./pillLayout.js";

export const ORDER_LINE_FONT = "'Trebuchet MS', Roboto, Ubuntu, sans-serif";
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
export const ORDER_LINE_FONT_SIZE = 12;
export const ORDER_LINE_MIN_BODY_W = 36;
export const ORDER_LINE_MIN_QTY_W = 22;
export const ORDER_LINE_PILL_INSET = 4;
export const DEFAULT_ORDER_LINE_FONT_WEIGHT = 900;
export const DEFAULT_ORDER_LINE_FONT_SIZE = 12;
export const DEFAULT_ORDER_LINE_FONT_FAMILY = ORDER_LINE_FONT;

/** @param {string | undefined} family */
export function resolveOrderLineFontFamily(family) {
  const s = String(family ?? "").trim();
  return s || DEFAULT_ORDER_LINE_FONT_FAMILY;
}

/** @param {number | undefined} size */
export function resolveOrderLineFontSize(size) {
  const n = Number(size);
  if (!Number.isFinite(n)) return DEFAULT_ORDER_LINE_FONT_SIZE;
  return Math.min(16, Math.max(9, Math.round(n)));
}

/** @param {number | undefined} weight */
export function resolveOrderLineFontWeight(weight) {
  const n = Number(weight);
  if (!Number.isFinite(n)) return DEFAULT_ORDER_LINE_FONT_WEIGHT;
  return Math.min(900, Math.max(100, Math.round(n)));
}

/**
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} ctx
 * @param {string} text
 * @param {number} [fontWeight]
 * @param {number} [fontSize]
 * @param {string} [fontFamily]
 */
function measureTextWidth(
  ctx,
  text,
  fontWeight = DEFAULT_ORDER_LINE_FONT_WEIGHT,
  fontSize = DEFAULT_ORDER_LINE_FONT_SIZE,
  fontFamily = DEFAULT_ORDER_LINE_FONT_FAMILY,
) {
  if (!ctx) return text.length * 7;
  const w = resolveOrderLineFontWeight(fontWeight);
  const px = resolveOrderLineFontSize(fontSize);
  const fam = resolveOrderLineFontFamily(fontFamily);
  ctx.font = `${w} ${px}px ${fam}`;
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

  const rawBody = state.text?.trim() || "";
  const bodyText = rawBody || " ";
  const qtyText = state.quantity?.trim() || "";
  const bodyWeight = resolveOrderLineFontWeight(state.bodyFontWeight);
  const qtyWeight = resolveOrderLineFontWeight(state.quantityFontWeight);
  const bodySize = resolveOrderLineFontSize(state.bodyFontSize);
  const qtySize = resolveOrderLineFontSize(state.quantityFontSize);
  const bodyFamily = resolveOrderLineFontFamily(state.bodyFontFamily);
  const qtyFamily = resolveOrderLineFontFamily(state.quantityFontFamily);

  const bodyInner = measureTextWidth(paintCtx, bodyText, bodyWeight, bodySize, bodyFamily);
  const qtyInner = qtyText
    ? measureTextWidth(paintCtx, qtyText, qtyWeight, qtySize, qtyFamily)
    : 0;

  const bodyW = rawBody
    ? Math.max(ORDER_LINE_MIN_BODY_W, Math.ceil(bodyInner + ORDER_LINE_PAD_X * 2))
    : 0;
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

/**
 * Plot-area width (excludes the price scale). Matches chart.paneSize().width.
 * @param {import("lightweight-charts").IChartApi | object} chart
 * @param {HTMLElement | null | undefined} [el]
 */
export function plotPaneWidth(chart, el) {
  const paneW = chart?.paneSize?.()?.width;
  if (Number.isFinite(paneW) && paneW > 0) return paneW;
  const scaleW = chart?.priceScale?.("right")?.width?.() ?? 0;
  const rectW = el?.getBoundingClientRect?.().width ?? 0;
  return Math.max(0, rectW - scaleW);
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
  const axisWeight = resolveOrderLineFontWeight(state.bodyFontWeight);
  const axisFamily = resolveOrderLineFontFamily(state.bodyFontFamily);
  ctx.font = `${axisWeight} 12px ${axisFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(priceText, scaleW / 2, top + rowH / 2);
  ctx.restore();
}

/** @param {string | undefined} color */
function dividerColor(color) {
  return color && color !== "transparent" ? color : "";
}

/** @param {import("./types.js").OrderLineState} state */
function qtyDividerColor(state) {
  return dividerColor(state.quantityBorderColor) || dividerColor(state.bodyBorderColor);
}

/** @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y */
function fillBoldText(ctx, text, x, y) {
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

/**
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
  const shellBorder = hasShellBorder(state);
  const qtyDiv = qtyDividerColor(state);

  const bodyWeight = resolveOrderLineFontWeight(state.bodyFontWeight);
  const qtyWeight = resolveOrderLineFontWeight(state.quantityFontWeight);
  const bodySize = resolveOrderLineFontSize(state.bodyFontSize);
  const qtySize = resolveOrderLineFontSize(state.quantityFontSize);
  const bodyFamily = resolveOrderLineFontFamily(state.bodyFontFamily);
  const qtyFamily = resolveOrderLineFontFamily(state.quantityFontFamily);

  ctx.save();
  if (state.isMoving) ctx.globalAlpha = 0.92;
  ctx.font = `${bodyWeight} ${bodySize}px ${bodyFamily}`;

  roundRect(ctx, x, top, totalW, ORDER_LINE_ROW_H, 2, 2, 2, 2);
  ctx.fillStyle = bodyBg;
  ctx.fill();

  if (qtyW) {
    ctx.fillStyle = qtyBg;
    ctx.fillRect(x + bodyW, top, qtyW, ORDER_LINE_ROW_H);
  }

  ctx.fillStyle = state.cancelButtonBackgroundColor || "rgba(255,255,255,0.96)";
  ctx.fillRect(cancelLeft, top, ORDER_LINE_CANCEL_W, ORDER_LINE_ROW_H);

  roundRect(ctx, x, top, totalW, ORDER_LINE_ROW_H, 2, 2, 2, 2);
  ctx.clip();

  const dividerStroke = shellBorder && qtyDiv ? qtyDiv : "rgba(255,255,255,0.28)";
  ctx.strokeStyle = dividerStroke;
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
  fillBoldText(ctx, bodyText, x + bodyW / 2, top + ORDER_LINE_ROW_H / 2);

  if (qtyW) {
    ctx.font = `${qtyWeight} ${qtySize}px ${qtyFamily}`;
    ctx.fillStyle = state.quantityTextColor || "#ffffff";
    fillBoldText(ctx, qtyText, x + bodyW + qtyW / 2, top + ORDER_LINE_ROW_H / 2);
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

  if (shellBorder) {
    const border = dividerColor(state.bodyBorderColor);
    if (border) {
      ctx.save();
      if (state.isMoving) ctx.globalAlpha = 0.92;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, top + 0.5, totalW - 1, ORDER_LINE_ROW_H - 1, 2, 2, 2, 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  return { left: x, top, width: totalW, height: ORDER_LINE_ROW_H, cancelLeft, bodyW, qtyW };
}
