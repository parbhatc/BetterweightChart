import {
  DEFAULT_POSITION_DURATION_SEC,
  POSITION_INPUT_DEFAULTS,
  POSITION_STYLE_DEFAULTS,
} from "./constants.js";
import { positionGeometry } from "./geometry.js";
import { computePositionQty } from "./quantity.js";
import { resolvePositionStatsFields } from "./stats.js";

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizePositionDrawing(drawing) {
  const geom = positionGeometry(drawing);
  if (!geom) return drawing;
  const merged = {
    ...POSITION_INPUT_DEFAULTS,
    ...POSITION_STYLE_DEFAULTS,
    ...drawing,
    positionDurationSec: drawing.positionDurationSec ?? DEFAULT_POSITION_DURATION_SEC,
    showPriceLabels: drawing.showPriceLabels !== false,
    alwaysShowStats: Boolean(drawing.alwaysShowStats),
    statsFields: resolvePositionStatsFields(drawing),
    statsPosition: drawing.statsPosition ?? POSITION_STYLE_DEFAULTS.statsPosition,
    profitColor: drawing.profitColor ?? POSITION_STYLE_DEFAULTS.profitColor,
    stopColor: drawing.stopColor ?? POSITION_STYLE_DEFAULTS.stopColor,
    fontSize: drawing.fontSize ?? POSITION_STYLE_DEFAULTS.fontSize,
  };
  return {
    ...merged,
    positionEntryPrice: Number.isFinite(Number(drawing.positionEntryPrice))
      ? Number(drawing.positionEntryPrice)
      : geom.entryPrice,
    positionQty: computePositionQty(merged),
  };
}
