import { POSITION_INPUT_DEFAULTS } from "./constants.js";
import { clampPositionLevelPrice, positionGeometry } from "./geometry.js";
import { tickSizeForPrecision } from "./placement.js";

/** @param {number} qty @param {string} precisionId */
export function formatPositionQty(qty, precisionId) {
  if (precisionId === "default" || precisionId === "0") return String(Math.round(qty));
  const decimals = Number(precisionId);
  if (Number.isFinite(decimals) && decimals > 0) return qty.toFixed(decimals);
  return String(Math.round(qty));
}

/** @param {number} qty @param {string} precisionId */
function roundPositionQty(qty, precisionId) {
  if (precisionId === "default" || precisionId === "0") return Math.max(1, Math.round(qty));
  const decimals = Number(precisionId);
  if (Number.isFinite(decimals) && decimals > 0) {
    const factor = 10 ** decimals;
    return Math.max(10 ** -decimals, Math.round(qty * factor) / factor);
  }
  return Math.max(1, Math.round(qty));
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function computePositionQty(drawing) {
  const account = Number(drawing.positionAccountSize) || POSITION_INPUT_DEFAULTS.positionAccountSize;
  const risk = Number(drawing.positionRisk) || POSITION_INPUT_DEFAULTS.positionRisk;
  const lotSize = Number(drawing.positionLotSize) || POSITION_INPUT_DEFAULTS.positionLotSize;
  const geom = positionGeometry(drawing);
  if (!geom || geom.risk <= 0) return 1;

  const riskAmount =
    drawing.positionRiskUnit === "currency" ? risk : account * (risk / 100);
  const rawQty = riskAmount / (geom.risk * lotSize);
  return roundPositionQty(rawQty, String(drawing.positionQtyPrecision ?? "default"));
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} [precision]
 */
export function positionInputsDraftFromDrawing(drawing, precision = 2) {
  const geom = positionGeometry(drawing);
  const tick = tickSizeForPrecision(precision);
  const qtyPrecision = String(drawing.positionQtyPrecision ?? "default");
  const qty = computePositionQty(drawing);
  return {
    ...POSITION_INPUT_DEFAULTS,
    positionAccountSize: Number(drawing.positionAccountSize) || POSITION_INPUT_DEFAULTS.positionAccountSize,
    positionLotSize: Number(drawing.positionLotSize) || POSITION_INPUT_DEFAULTS.positionLotSize,
    positionRisk: Number(drawing.positionRisk) || POSITION_INPUT_DEFAULTS.positionRisk,
    positionRiskUnit: drawing.positionRiskUnit ?? POSITION_INPUT_DEFAULTS.positionRiskUnit,
    positionLeverage: Number(drawing.positionLeverage) || POSITION_INPUT_DEFAULTS.positionLeverage,
    positionQtyPrecision: qtyPrecision,
    positionQty: qty,
    positionEntryPrice: geom?.entryPrice ?? 0,
    positionProfitTicks: geom && tick > 0 ? Math.round(geom.reward / tick) : 0,
    positionProfitPrice: geom?.targetPrice ?? 0,
    positionStopTicks: geom && tick > 0 ? Math.round(geom.risk / tick) : 0,
    positionStopPrice: geom?.stopPrice ?? 0,
  };
}

/**
 * Rebuild corner points from input values.
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {Record<string, unknown>} inputs
 * @param {number} precision
 */
export function pointsFromPositionInputs(drawing, inputs, precision) {
  const geom = positionGeometry(drawing);
  if (!geom) return { points: drawing.points, positionEntryPrice: drawing.positionEntryPrice };
  const isLong = drawing.type === "long-position";
  const tick = tickSizeForPrecision(precision);

  let entry = Number(inputs.positionEntryPrice);
  if (!Number.isFinite(entry)) entry = geom.entryPrice;

  let stop = Number(inputs.positionStopPrice);
  let target = Number(inputs.positionProfitPrice);
  const stopTicks = Number(inputs.positionStopTicks);
  const profitTicks = Number(inputs.positionProfitTicks);

  if (Number.isFinite(stopTicks) && tick > 0) {
    stop = isLong ? entry - stopTicks * tick : entry + stopTicks * tick;
  } else if (!Number.isFinite(stop)) {
    stop = geom.stopPrice;
  }

  if (Number.isFinite(profitTicks) && tick > 0) {
    target = isLong ? entry + profitTicks * tick : entry - profitTicks * tick;
  } else if (!Number.isFinite(target)) {
    target = geom.targetPrice;
  }

  stop = clampPositionLevelPrice(stop, entry, isLong, "stop", tick);
  target = clampPositionLevelPrice(target, entry, isLong, "target", tick);

  if (Number.isFinite(Number(inputs.positionEntryPrice))) {
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (risk <= 0 && geom.risk > 0) {
      stop = clampPositionLevelPrice(
        isLong ? entry - geom.risk : entry + geom.risk,
        entry,
        isLong,
        "stop",
        tick,
      );
    }
    if (reward <= 0 && geom.reward > 0) {
      target = clampPositionLevelPrice(
        isLong ? entry + geom.reward : entry - geom.reward,
        entry,
        isLong,
        "target",
        tick,
      );
    }
  }

  const topPrice = isLong ? target : stop;
  const bottomPrice = isLong ? stop : target;

  return {
    points: [
      { time: geom.tStart, price: topPrice },
      { time: geom.tEnd, price: bottomPrice },
    ],
    positionEntryPrice: Number.isFinite(entry) ? entry : geom.entryPrice,
  };
}
