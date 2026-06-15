/** Default horizontal span for one-click placement (20 minutes). */
export const DEFAULT_POSITION_DURATION_SEC = 20 * 60;

export const POSITION_INPUT_DEFAULTS = {
  positionAccountSize: 1000,
  positionLotSize: 1,
  positionRisk: 25,
  positionRiskUnit: "percent",
  positionLeverage: 10000,
  positionQtyPrecision: "default",
};

export const POSITION_RISK_UNIT_ITEMS = [
  { id: "percent", label: "%" },
  { id: "currency", label: "USD" },
];

export const POSITION_QTY_PRECISION_ITEMS = [
  { id: "default", label: "Default" },
  { id: "0", label: "Integer" },
  { id: "1", label: "1 decimal" },
  { id: "2", label: "2 decimals" },
  { id: "3", label: "3 decimals" },
  { id: "4", label: "4 decimals" },
  { id: "5", label: "5 decimals" },
  { id: "6", label: "6 decimals" },
  { id: "7", label: "7 decimals" },
  { id: "8", label: "8 decimals" },
  { id: "9", label: "9 decimals" },
  { id: "10", label: "10 decimals" },
];

export const POSITION_TOOL_TYPES = new Set(["long-position", "short-position"]);

export const POSITION_STATS_FIELD_ITEMS = [
  { id: "tpPriceOffset", label: "TP price offset" },
  { id: "tpPercentOffset", label: "TP percent offset" },
  { id: "tpTickOffset", label: "TP tick offset" },
  { id: "tpAmount", label: "TP amount" },
  { id: "tpPL", label: "TP PL" },
  { id: "openClosedPL", label: "Open/closed PL" },
  { id: "qty", label: "Qty" },
  { id: "riskRewardRatio", label: "Risk/reward ratio" },
  { id: "slPriceOffset", label: "SL price offset" },
  { id: "slPercentOffset", label: "SL percent offset" },
  { id: "slTickOffset", label: "SL tick offset" },
  { id: "slAmount", label: "SL amount" },
  { id: "slPL", label: "SL PL" },
];

export const POSITION_STYLE_DEFAULTS = {
  showPriceLabels: true,
  alwaysShowStats: false,
  statsPosition: "center",
  profitColor: "rgba(8, 153, 129, 0.2)",
  stopColor: "rgba(242, 54, 69, 0.2)",
  fontSize: 12,
};

export const TV_PROFIT_PILL = "#089981";
export const TV_STOP_PILL = "#F23645";
export const TV_ENTRY_PILL = "rgba(120, 123, 134, 0.92)";
export const TV_PROFIT_FILL = "rgba(8, 153, 129, 0.22)";
export const TV_STOP_FILL = "rgba(242, 54, 69, 0.22)";
export const TV_BORDER = "rgba(120, 123, 134, 0.45)";
export const PILL_OUTSIDE_GAP = 6;

/** Fraction of visible chart height used for each side (target / stop) on placement. */
export const VIEWPORT_RISK_FRACTION = 0.1;

/** @param {string} type */
export function isPositionTool(type) {
  return POSITION_TOOL_TYPES.has(type);
}
