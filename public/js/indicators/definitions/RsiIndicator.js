import { defineIndicator } from "../defineIndicator.js";
import { BaseIndicator } from "../BaseIndicator.js";
import { SMOOTHING_TYPES } from "../math/ema.js";
import { computeRsiIndicator } from "../math/rsi.js";
import { sourceLabel } from "../math/source.js";
import { plotStyleKeys, fillStyleKeys, buildBandFillSegments } from "../schema.js";
import { applyColorOpacity } from "../../ui/color/picker.js";

export const RSI_TV_COLORS = {
  rsi: "#7e57c2",
  smoothed: "#fdd835",
  band: "#787b86",
};

export const RSI_SMOOTHING_TYPES = SMOOTHING_TYPES.filter((t) => t.id !== "sma_bb");

export const RsiIndicator = defineIndicator(class RsiIndicator {
  constructor() {}

  static id = "RSI@tv-basicstudies";
  static type = "rsi";
  static title = "RSI";
  static shortTitle = "RSI";
  static primaryPlot = "rsi";
  static studyPaneOrder = 0;
  static studyPaneHeight = 100;
  static studyPaneScale = { min: 0, max: 100 };

  static plots = [
    { id: "rsi", title: "RSI", color: RSI_TV_COLORS.rsi, priceLine: false },
    {
      id: "smoothed",
      title: "RSI-based MA",
      color: RSI_TV_COLORS.smoothed,
      priceLine: false,
      when: (inputs) => inputs.smoothingType !== "none",
    },
    { id: "upper", title: "RSI Upper Band", color: RSI_TV_COLORS.band, priceLine: false, band: true },
    { id: "middle", title: "RSI Middle Band", color: RSI_TV_COLORS.band, priceLine: false, band: true },
    { id: "lower", title: "RSI Lower Band", color: RSI_TV_COLORS.band, priceLine: false, band: true },
  ];

  static fills = [
    {
      id: "rsiBgFill",
      upper: "upper",
      lower: "lower",
      title: "RSI Background Fill",
      color: RSI_TV_COLORS.rsi,
      opacity: 10,
    },
  ];

  static inputs = [
    { id: "length", type: "int", title: "RSI Length", defval: 14, section: "RSI Settings" },
    { id: "source", type: "source", title: "Source", defval: "close", section: "RSI Settings" },
    {
      id: "smoothingType",
      type: "select",
      title: "Type",
      defval: "sma",
      options: RSI_SMOOTHING_TYPES,
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
    { id: "timeframe", type: "timeframe", title: "Timeframe", defval: "chart", section: "Calculation" },
    {
      id: "waitForClose",
      type: "bool",
      title: "Wait for timeframe closes",
      defval: true,
      section: "Calculation",
    },
  ];

  static defaultStyle() {
    return {
      ...BaseIndicator.defaultStyle(),
      rsiVisible: true,
      rsiColor: RSI_TV_COLORS.rsi,
      rsiWidth: 1,
      rsiStyle: 0,
      rsiPriceLine: false,
      rsiPlotType: "line",
      smoothedVisible: true,
      smoothedColor: RSI_TV_COLORS.smoothed,
      smoothedWidth: 1,
      smoothedStyle: 0,
      smoothedPriceLine: false,
      smoothedPlotType: "line",
      upperVisible: true,
      upperColor: RSI_TV_COLORS.band,
      upperWidth: 1,
      upperStyle: 2,
      upperPriceLine: false,
      upperPlotType: "line",
      upperLevel: 70,
      middleVisible: true,
      middleColor: "#787b86",
      middleWidth: 1,
      middleStyle: 2,
      middlePriceLine: false,
      middlePlotType: "line",
      middleLevel: 50,
      lowerVisible: true,
      lowerColor: RSI_TV_COLORS.band,
      lowerWidth: 1,
      lowerStyle: 2,
      lowerPriceLine: false,
      lowerPlotType: "line",
      lowerLevel: 30,
      rsiBgFillVisible: true,
      rsiBgFillColor: RSI_TV_COLORS.rsi,
      rsiBgFillOpacity: 15,
    };
  }

  static compute(bars, inputs, style) {
    return computeRsiIndicator(bars, inputs, style);
  }

  static formatPlotValue(plotKey, raw) {
    if (plotKey === "rsi" || plotKey === "smoothed") {
      if (raw == null || !Number.isFinite(raw)) return null;
      return Number(raw).toFixed(2);
    }
    return null;
  }

  static legendParams(instance) {
    return [
      String(instance.inputs.length ?? 14),
      sourceLabel(instance.inputs.source ?? "close").toLowerCase(),
    ];
  }

  static valueLabels(instance) {
    /** @type {{ key: string, title: string }[]} */
    const labels = [{ key: "rsi", title: "RSI" }];
    if (instance.inputs.smoothingType !== "none") {
      labels.push({ key: "smoothed", title: "RSI-based MA" });
    }
    return labels;
  }

  static stylePlotRows(inputValues, _style) {
    const rsiKeys = plotStyleKeys("rsi");
    const smoothKeys = plotStyleKeys("smoothed");
    const upperKeys = plotStyleKeys("upper");
    const middleKeys = plotStyleKeys("middle");
    const lowerKeys = plotStyleKeys("lower");
    const fillKeys = fillStyleKeys("rsiBgFill");
    /** @type {object[]} */
    const rows = [{ type: "line", plotKey: "rsi", label: "RSI", ...rsiKeys }];
    if (inputValues.smoothingType !== "none") {
      rows.push({ type: "line", plotKey: "smoothed", label: "RSI-based MA", ...smoothKeys });
    }
    rows.push(
      { type: "band", plotKey: "upper", label: "RSI Upper Band", levelKey: "upperLevel", ...upperKeys },
      { type: "band", plotKey: "middle", label: "RSI Middle Band", levelKey: "middleLevel", ...middleKeys },
      { type: "band", plotKey: "lower", label: "RSI Lower Band", levelKey: "lowerLevel", ...lowerKeys },
      { type: "fill", label: "RSI Background Fill", ...fillKeys },
    );
    return rows;
  }

  static getBandFills(instance, chartBars) {
    if (instance.hidden || !instance.lastPlots) return [];
    const keys = fillStyleKeys("rsiBgFill");
    if (instance.style[keys.visibleKey] === false) return [];

    const min = this.studyPaneScale?.min ?? 0;
    const max = this.studyPaneScale?.max ?? 100;
    const upper = chartBars.map(() => max);
    const lower = chartBars.map(() => min);
    const segments = buildBandFillSegments(upper, lower, chartBars);
    if (!segments.length) return [];

    return [
      {
        color: applyColorOpacity(
          String(instance.style[keys.colorKey] ?? RSI_TV_COLORS.rsi),
          Number(instance.style[keys.opacityKey]) || 15,
        ),
        segments,
        extendRight: true,
      },
    ];
  }

  static handleInputChange(inputValues, style, changedKey) {
    if (changedKey === "smoothingType" && inputValues.smoothingType !== "none") {
      style.smoothedVisible = true;
    }
  }
});
