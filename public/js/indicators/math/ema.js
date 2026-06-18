/** @typedef {"none"|"sma"|"sma_bb"|"ema"|"smma"|"wma"|"vwma"} SmoothingType */

export const SMOOTHING_TYPES = /** @type {const} */ ([
  { id: "none", label: "None" },
  { id: "sma", label: "SMA" },
  { id: "sma_bb", label: "SMA + Bollinger Bands" },
  { id: "ema", label: "EMA" },
  { id: "smma", label: "SMMA (RMA)" },
  { id: "wma", label: "WMA" },
  { id: "vwma", label: "VWMA" },
]);
