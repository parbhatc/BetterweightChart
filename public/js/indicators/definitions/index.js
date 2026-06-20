import EmaIndicator from "./ema/EMAIndicator.js";
import VolumeIndicator from "./volume/VolumeIndicator.js";
import RsiIndicator from "./rsi/RsiIndicator.js";
import MacdIndicator from "./macd/MacdIndicator.js";
import PivotPointsHlIndicator from "./pivot/PivotPointsHlIndicator.js";
import SmtIndicator from "./smt/SmtIndicator.js";

/** Built-in indicators shipped with the public chart API. */
export const ALL_INDICATORS = [
  EmaIndicator,
  VolumeIndicator,
  RsiIndicator,
  MacdIndicator,
  PivotPointsHlIndicator,
  SmtIndicator,
];

export {
  EmaIndicator,
  VolumeIndicator,
  RsiIndicator,
  MacdIndicator,
  PivotPointsHlIndicator,
  SmtIndicator,
};
