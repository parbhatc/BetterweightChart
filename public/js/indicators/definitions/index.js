import EmaIndicator from "./ema/EMAIndicator.js";
import VolumeIndicator from "./volume/VolumeIndicator.js";
import RsiIndicator from "./rsi/RsiIndicator.js";
import MacdIndicator from "./macd/MacdIndicator.js";
import PivotPointsHlIndicator from "./pivot/PivotPointsHlIndicator.js";
import FvgIndicator from "./fvg/FvgIndicator.js";
import SmtIndicator from "./smt/SmtIndicator.js";
import LevelsIndicator from "./levels/LevelsIndicator.js";
import { ALL_STRATEGIES } from "../../strategy/definitions/index.js";

/** Add your indicator here after creating its file. */
export const ALL_INDICATORS = [
  EmaIndicator,
  VolumeIndicator,
  RsiIndicator,
  MacdIndicator,
  PivotPointsHlIndicator,
  FvgIndicator,
  SmtIndicator,
  LevelsIndicator,
  ...ALL_STRATEGIES,
];

export {
  EmaIndicator,
  VolumeIndicator,
  RsiIndicator,
  MacdIndicator,
  PivotPointsHlIndicator,
  FvgIndicator,
  SmtIndicator,
  LevelsIndicator,
};
