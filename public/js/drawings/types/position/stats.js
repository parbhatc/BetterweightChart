import { fmtDrawingPrice } from "../../tools/line/info.js";
import { POSITION_STATS_FIELD_ITEMS, isPositionTool } from "./constants.js";
import { positionGeometry } from "./geometry.js";
import { tickSizeForPrecision } from "./placement.js";
import { computePositionQty, formatPositionQty } from "./quantity.js";

/** Default stats visibility for long/short position. */
export function defaultPositionStatsFields() {
  return {
    tpPriceOffset: true,
    tpPercentOffset: true,
    tpTickOffset: true,
    tpAmount: true,
    tpPL: false,
    openClosedPL: true,
    qty: true,
    riskRewardRatio: true,
    slPriceOffset: true,
    slPercentOffset: true,
    slTickOffset: true,
    slAmount: true,
    slPL: false,
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function resolvePositionStatsFields(drawing) {
  if (drawing.statsFields && typeof drawing.statsFields === "object") {
    return { ...defaultPositionStatsFields(), ...drawing.statsFields };
  }
  return defaultPositionStatsFields();
}

/** @param {Record<string, boolean>} statsFields */
export function positionStatsSummaryLabel(statsFields) {
  const enabled = POSITION_STATS_FIELD_ITEMS.filter((item) => statsFields[item.id]);
  if (!enabled.length) return "Hidden";
  if (enabled.length <= 3) return enabled.map((item) => item.label).join(", ");
  return `${enabled.length} selected`;
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} precision
 * @param {{ close?: number }[]} [bars]
 */
export function computePositionStatValues(drawing, precision, bars = []) {
  const geom = positionGeometry(drawing);
  if (!geom) {
    return {
      tpPriceOffset: "0",
      tpPercentOffset: "0",
      tpTickOffset: "0",
      tpAmount: "0",
      openClosedPL: "0",
      openClosedPLRaw: 0,
      qty: "0",
      riskRewardRatio: "0",
      slPriceOffset: "0",
      slPercentOffset: "0",
      slTickOffset: "0",
      slAmount: "0",
    };
  }

  const qty = computePositionQty(drawing);
  const qtyPrecision = String(drawing.positionQtyPrecision ?? "default");
  const tick = tickSizeForPrecision(precision);
  const entry = geom.entryPrice;
  const tpOffset = Math.abs(geom.targetPrice - entry);
  const slOffset = Math.abs(entry - geom.stopPrice);
  const tpPct = entry !== 0 ? (tpOffset / entry) * 100 : 0;
  const slPct = entry !== 0 ? (slOffset / entry) * 100 : 0;
  const tpTicks = tick > 0 ? Math.round(tpOffset / tick) : 0;
  const slTicks = tick > 0 ? Math.round(slOffset / tick) : 0;
  const tpAmount = Math.round(tpOffset * qty);
  const slAmount = Math.round(slOffset * qty);

  let openClosedPL = 0;
  const lastBar = bars[bars.length - 1];
  if (lastBar?.close != null) {
    openClosedPL = (lastBar.close - entry) * qty * (geom.isLong ? 1 : -1);
  }
  const plSign = openClosedPL >= 0 ? "" : "-";

  return {
    tpPriceOffset: fmtDrawingPrice(tpOffset, precision),
    tpPercentOffset: tpPct.toFixed(3),
    tpTickOffset: String(tpTicks),
    tpAmount: String(tpAmount),
    openClosedPL: `${plSign}${fmtDrawingPrice(Math.abs(openClosedPL), precision)}`,
    openClosedPLRaw: openClosedPL,
    qty: formatPositionQty(qty, qtyPrecision),
    riskRewardRatio: geom.rr.toFixed(2).replace(/\.00$/, ""),
    slPriceOffset: fmtDrawingPrice(slOffset, precision),
    slPercentOffset: slPct.toFixed(3),
    slTickOffset: String(slTicks),
    slAmount: String(slAmount),
  };
}

/** @param {Record<string, boolean>} fields @param {ReturnType<typeof computePositionStatValues>} values */
export function buildPositionCenterStatLines(fields, values) {
  /** @type {string[]} */
  const lines = [];
  const row1 = [];
  if (fields.openClosedPL) row1.push(`Closed P&L: ${values.openClosedPL}`);
  if (fields.qty) row1.push(`Qty: ${values.qty}`);
  if (row1.length) lines.push(row1.join(", "));
  if (fields.riskRewardRatio) lines.push(`Risk/Reward Ratio: ${values.riskRewardRatio}`);
  return lines;
}

/** @param {Record<string, boolean>} fields @param {ReturnType<typeof computePositionStatValues>} values @param {"target" | "stop"} zone */
export function buildPositionZoneLabel(fields, values, zone) {
  const chunks = [];
  if (zone === "target") {
    if (fields.tpPriceOffset) chunks.push(values.tpPriceOffset);
    if (fields.tpPercentOffset) chunks.push(`(${values.tpPercentOffset}%)`);
    if (fields.tpTickOffset) chunks.push(values.tpTickOffset);
    const prefix = "Target";
    let text = chunks.join(" ");
    if (fields.tpAmount) text = text ? `${prefix}: ${text}, Amount: ${values.tpAmount}` : `${prefix}: Amount: ${values.tpAmount}`;
    else if (text) text = `${prefix}: ${text}`;
    return text;
  }
  if (fields.slPriceOffset) chunks.push(values.slPriceOffset);
  if (fields.slPercentOffset) chunks.push(`(${values.slPercentOffset}%)`);
  if (fields.slTickOffset) chunks.push(values.slTickOffset);
  const prefix = "Stop";
  let text = chunks.join(" ");
  if (fields.slAmount) text = text ? `${prefix}: ${text}, Amount: ${values.slAmount}` : `${prefix}: Amount: ${values.slAmount}`;
  else if (text) text = `${prefix}: ${text}`;
  return text;
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ isSelected?: boolean, isHovered?: boolean, hoveredDrawingId?: string | null }} [state]
 */
export function shouldShowPositionStats(drawing, state = {}) {
  if (!isPositionTool(drawing.type)) return false;
  if (drawing.alwaysShowStats) return true;
  if (state.isHovered) return true;
  if (state.hoveredDrawingId && state.hoveredDrawingId !== drawing.id) return false;
  return Boolean(state.isSelected);
}
