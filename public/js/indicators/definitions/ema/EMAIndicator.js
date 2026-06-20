import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import { createFloat, createInt, createSelect, createSource, calcInputs, fill, plot } from "../../builders.js";
import { SMOOTHING_TYPE, SMOOTHING_TYPES, EmaRings } from "../../math/ema.js";
import { sourceLabel } from "../../math/source.js";
const COLORS = {
  ema: "#2962ff",
  smoothed: "#fdd835",
  bbLine: "#4caf50",
  bbFill: "#4caf50",
};

class EmaIndicator extends BarScriptIndicator {

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

  init() {
    const smoothingType = this.getString("smoothingType", SMOOTHING_TYPE.NONE);

    this.state.rings = new EmaRings({
      length: this.getInt("length", 9),
      offset: this.getInt("offset", 0, 0),
      smoothingType,
      smoothType:
        smoothingType === SMOOTHING_TYPE.SMA_BOLLINGER_BAND
          ? SMOOTHING_TYPE.SMA
          : smoothingType,
      smoothingLength: this.getInt("smoothingLength", 14),
      bbStdDev: this.getFloat("bbStdDev", 2),
    });
  }

  onBar(bar) {
    const rings = this.state.rings;
    const shifted = rings.pushEma(this.source(), this.index);
    this.plot("ema", shifted);

    if (rings.smoothingType === SMOOTHING_TYPE.NONE) return;

    const smoothed = rings.smooth(shifted, bar);
    this.plot("smoothed", smoothed);

    if (rings.smoothingType !== SMOOTHING_TYPE.SMA_BOLLINGER_BAND) return;

    const dev = rings.stdDev();
    this.plot(
      "upper",
      smoothed != null && dev != null ? smoothed + rings.bbStdDev * dev : null,
    );
    this.plot(
      "lower",
      smoothed != null && dev != null ? smoothed - rings.bbStdDev * dev : null,
    );
  }

  legendParams(instance) {
    return [
      String(instance.inputs.length ?? 9),
      sourceLabel(instance.inputs.source ?? "close").toLowerCase(),
    ];
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

BarScriptIndicator.define(EmaIndicator);

export default EmaIndicator;
