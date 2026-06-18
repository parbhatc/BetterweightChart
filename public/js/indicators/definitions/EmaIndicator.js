import { defineIndicator } from "../defineIndicator.js";
import { computeEmaIndicator, SMOOTHING_TYPES } from "../math/ema.js";
import { sourceLabel } from "../math/source.js";

export const EMA_TV_COLORS = {
  ema: "#2962ff",
  smoothed: "#fdd835",
  bbLine: "#4caf50",
  bbFill: "#4caf50",
};

export const EmaIndicator = defineIndicator(class EmaIndicator {
  constructor() {}

  static id = "Moving Average Exponential@tv-basicstudies";
  static type = "ema";
  static title = "Moving Average Exponential";
  static shortTitle = "EMA";
  static primaryPlot = "ema";

  static plots = [
    { id: "ema", title: "EMA", color: EMA_TV_COLORS.ema, priceLine: false },
    {
      id: "smoothed",
      title: "EMA-based MA",
      color: EMA_TV_COLORS.smoothed,
      priceLine: false,
      when: (inputs) => inputs.smoothingType !== "none",
    },
    {
      id: "upper",
      title: "Upper Bollinger Band",
      color: EMA_TV_COLORS.bbLine,
      priceLine: false,
      when: (inputs) => inputs.smoothingType === "sma_bb",
    },
    {
      id: "lower",
      title: "Lower Bollinger Band",
      color: EMA_TV_COLORS.bbLine,
      priceLine: false,
      when: (inputs) => inputs.smoothingType === "sma_bb",
    },
  ];

  static fills = [
    {
      id: "bbFill",
      upper: "upper",
      lower: "lower",
      title: "Bollinger Bands Background Fill",
      color: EMA_TV_COLORS.bbFill,
      opacity: 10,
      when: (inputs) => inputs.smoothingType === "sma_bb",
    },
  ];

  static inputs = [
    { id: "length", type: "int", title: "Length", defval: 9 },
    { id: "source", type: "source", title: "Source", defval: "close" },
    { id: "offset", type: "int", title: "Offset", defval: 0 },
    {
      id: "smoothingType",
      type: "select",
      title: "Type",
      defval: "none",
      options: SMOOTHING_TYPES,
      section: "Smoothing",
      affectsStyle: true,
    },
    {
      id: "smoothingLength",
      type: "int",
      title: "Length",
      defval: 14,
      section: "Smoothing",
      disabled: (inputs) => inputs.smoothingType === "none",
    },
    {
      id: "bbStdDev",
      type: "float",
      title: "BB StdDev",
      defval: 2,
      section: "Smoothing",
      disabled: (inputs) => inputs.smoothingType !== "sma_bb",
    },
    { id: "timeframe", type: "timeframe", title: "Timeframe", defval: "chart", section: "Calculation" },
    {
      id: "waitForClose",
      type: "bool",
      title: "Wait for timeframe closes",
      defval: true,
      section: "Calculation",
    },
  ];

  static compute(bars, inputs) {
    return computeEmaIndicator(bars, inputs);
  }

  static legendParams(instance) {
    return [
      String(instance.inputs.length ?? 9),
      sourceLabel(instance.inputs.source ?? "close").toLowerCase(),
    ];
  }

  static mergeStyleDefaults(style, inputs = {}) {
    const defs = this.defaultStyle();
    if (inputs.smoothingType === "sma_bb") {
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

  static handleInputChange(inputs, style, changedKey) {
    if (changedKey === "smoothingType") {
      if (inputs.smoothingType !== "none") style.smoothedVisible = true;
      if (inputs.smoothingType === "sma_bb") {
        style.upperVisible = true;
        style.lowerVisible = true;
        style.bbFillVisible = true;
      }
    }
  }
});
