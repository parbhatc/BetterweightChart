import { ComputeIndicator } from "../../ComputeIndicator.js";
import { calcInputs, createFloat, createInt, createSelect, createSource, fill, lengthSourceLegend, plot } from "../../builders.js";
import { smoothSeries } from "../../math/smooth.js";
import { barSourceValue } from "../../math/source.js";
import { offsetSeries, rollingMeanStdDev } from "../../math/rolling.js";

const MA_TYPES = [
  { id: "sma", label: "SMA" },
  { id: "ema", label: "EMA" },
  { id: "smma", label: "SMMA (RMA)" },
  { id: "wma", label: "WMA" },
  { id: "vwma", label: "VWMA" },
];

class BollingerBandsIndicator extends ComputeIndicator {
  constructor() {
    super("bollinger_bands", "BB", "Bollinger Bands");
    this.setPrimaryPlot("basis");
    this.setPlots([
      plot("basis", "Basis", "#f23645"),
      plot("upper", "Upper", "#2962ff"),
      plot("lower", "Lower", "#2962ff"),
    ]);
    this.setFills([fill("background", "upper", "lower", "Background", "#2962ff", { opacity: 10 })]);
    this.setInputs([
      createInt("length", "Length", 20, { min: 1 }),
      createSelect("basisMaType", "Basis MA Type", "sma", MA_TYPES),
      createSource("source", "Source", "close"),
      createFloat("stdDev", "StdDev", 2),
      createInt("offset", "Offset", 0),
      ...calcInputs(),
    ]);
  }

  computeSeries(bars, inputs) {
    const length = Math.max(1, Math.floor(Number(inputs.length) || 20));
    const source = String(inputs.source ?? "close");
    const values = bars.map((bar) => barSourceValue(bar, source));
    const basis = smoothSeries(values, length, String(inputs.basisMaType ?? "sma"), bars);
    const { stdDev } = rollingMeanStdDev(values, length);
    const multiplier = Number.isFinite(Number(inputs.stdDev)) ? Number(inputs.stdDev) : 2;
    const upper = basis.map((value, i) => value == null || stdDev[i] == null ? null : value + multiplier * stdDev[i]);
    const lower = basis.map((value, i) => value == null || stdDev[i] == null ? null : value - multiplier * stdDev[i]);
    const offset = Number(inputs.offset) || 0;
    return {
      basis: offsetSeries(basis, offset),
      upper: offsetSeries(upper, offset),
      lower: offsetSeries(lower, offset),
    };
  }

  legendParams(instance) {
    return lengthSourceLegend(instance.inputs, 20);
  }
}

ComputeIndicator.define(BollingerBandsIndicator);

export default BollingerBandsIndicator;
