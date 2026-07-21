import { ComputeIndicator } from "../../ComputeIndicator.js";
import { createFloat, createInt, createSelect, createSource, calcInputs, fill, lengthSourceLegend, plot } from "../../builders.js";
import { SMOOTHING_TYPE, SMOOTHING_TYPES } from "../../math/ema.js";
import { barSourceValue } from "../../math/source.js";
import { smoothSeries } from "../../math/smooth.js";
import { offsetSeries, rollingMeanStdDev } from "../../math/rolling.js";
const COLORS = {
  ema: "#2962ff",
  smoothed: "#fdd835",
  bbLine: "#4caf50",
  bbFill: "#4caf50",
};

class EmaIndicator extends ComputeIndicator {

  constructor() {
    super("ema", "EMA", "Moving Average Exponential");
    this.setPrimaryPlot("ema");
    this.setPlots([
      plot("ema", "EMA", COLORS.ema),
      plot("smoothed", "EMA-based MA", COLORS.smoothed, {
        when: (i) => i.smoothingType !== SMOOTHING_TYPE.NONE,
      }),
      plot("upper", "Upper Bollinger Band", COLORS.bbLine, {
        when: (i) => i.smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND,
      }),
      plot("lower", "Lower Bollinger Band", COLORS.bbLine, {
        when: (i) => i.smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND,
      }),
    ]);
    this.setFills([
      fill("bbFill", "upper", "lower", "Bollinger Bands Background Fill", COLORS.bbFill, {
        when: (i) => i.smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND,
      }),
    ]);
    this.setInputs([
      createInt("length", "Length", 9),
      createSource("source", "Source", "close"),
      createInt("offset", "Offset", 0),
      createSelect("smoothingType", "Type", SMOOTHING_TYPE.NONE, SMOOTHING_TYPES, {
        section: "Smoothing",
        affectsStyle: true,
      }),
      createInt("smoothingLength", "Length", 14, {
        section: "Smoothing",
        disabled: (v) => v.smoothingType === SMOOTHING_TYPE.NONE,
      }),
      createFloat("bbStdDev", "BB StdDev", 2, {
        section: "Smoothing",
        disabled: (v) => v.smoothingType !== SMOOTHING_TYPE.SMA_BOLLINGER_BAND,
      }),
      ...calcInputs(),
    ]);
  }

  computeSeries(bars, inputs) {
    const length = Math.max(1, Math.floor(Number(inputs.length) || 9));
    const smoothingLength = Math.max(1, Math.floor(Number(inputs.smoothingLength) || 14));
    const smoothingType = String(inputs.smoothingType ?? SMOOTHING_TYPE.NONE);
    const values = bars.map((bar) => barSourceValue(bar, String(inputs.source ?? "close")));
    const ema = smoothSeries(values, length, "ema", bars);
    const plots = { ema };

    if (smoothingType !== SMOOTHING_TYPE.NONE) {
      const smoothType = smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND
        ? SMOOTHING_TYPE.SMA
        : smoothingType;
      plots.smoothed = smoothSeries(ema, smoothingLength, smoothType, bars);
      if (smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND) {
        const deviations = rollingMeanStdDev(ema, smoothingLength).stdDev;
        const multiplier = Number.isFinite(Number(inputs.bbStdDev)) ? Number(inputs.bbStdDev) : 2;
        plots.upper = plots.smoothed.map((value, i) =>
          value == null || deviations[i] == null ? null : value + multiplier * deviations[i],
        );
        plots.lower = plots.smoothed.map((value, i) =>
          value == null || deviations[i] == null ? null : value - multiplier * deviations[i],
        );
      }
    }

    // Offset is a display shift, so apply it after all calculations. This is
    // what allows TradingView-compatible negative (leftward) offsets.
    const offset = Math.trunc(Number(inputs.offset) || 0);
    for (const key of Object.keys(plots)) plots[key] = offsetSeries(plots[key], offset);
    return plots;
  }

  legendParams(instance) {
    return lengthSourceLegend(instance.inputs, 9);
  }

  mergeStyleDefaults(style, inputs = {}) {
    const defs = this.constructor.defaultStyle();
    if (inputs.smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND) {
      if (style.upperColor === undefined || style.upperColor === defs.smoothedColor) {
        style.upperColor = defs.upperColor;
      }
      if (style.lowerColor === undefined || style.lowerColor === defs.smoothedColor) {
        style.lowerColor = defs.lowerColor;
      }
      if (style.bbFillColor === undefined) style.bbFillColor = defs.bbFillColor;
    }
    return style;
  }

  handleInputChange(inputs, style, changedKey) {
    if (changedKey === "smoothingType") {
      if (inputs.smoothingType !== SMOOTHING_TYPE.NONE) style.smoothedVisible = true;
      if (inputs.smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND) {
        style.upperVisible = true;
        style.lowerVisible = true;
        style.bbFillVisible = true;
      }
    }
  }
}

ComputeIndicator.define(EmaIndicator);

export default EmaIndicator;
