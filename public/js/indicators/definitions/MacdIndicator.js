import { defineIndicator } from "../defineIndicator.js";
import { BaseIndicator } from "../BaseIndicator.js";
import { computeMacdIndicator } from "../math/macd.js";
import { sourceLabel } from "../math/source.js";
import { plotStyleKeys } from "../schema.js";

export const MACD_TV_COLORS = {
  hist0: "#26a69a",
  hist1: "#b2dfdb",
  hist2: "#ffcdd2",
  hist3: "#ff5252",
  macd: "#2962ff",
  signal: "#ff6d00",
  zero: "rgba(120, 123, 134, 0.5)",
};

export const MACD_MA_TYPES = [
  { id: "ema", label: "EMA" },
  { id: "sma", label: "SMA" },
  { id: "smma", label: "SMMA (RMA)" },
  { id: "wma", label: "WMA" },
];

export const MacdIndicator = defineIndicator(class MacdIndicator {
  constructor() {}

  static id = "MACD@tv-basicstudies";
  static type = "macd";
  static title = "MACD";
  static shortTitle = "MACD";
  static primaryPlot = "macd";
  static studyPaneOrder = 1;
  static studyPaneHeight = 110;

  static plots = [
    {
      id: "histogram",
      type: "histogram",
      title: "Histogram",
      when: (_inputs, style) => style.histogramVisible !== false,
    },
    { id: "macd", title: "MACD", color: MACD_TV_COLORS.macd, priceLine: false },
    { id: "signal", title: "Signal line", color: MACD_TV_COLORS.signal, priceLine: false },
    { id: "zero", title: "Zero", color: MACD_TV_COLORS.zero, priceLine: false, band: true },
  ];

  static inputs = [
    { id: "source", type: "source", title: "Source", defval: "close" },
    { id: "fastLength", type: "int", title: "Fast length", defval: 12 },
    { id: "slowLength", type: "int", title: "Slow length", defval: 26 },
    { id: "signalLength", type: "int", title: "Signal length", defval: 9 },
    {
      id: "oscillatorMaType",
      type: "select",
      title: "Oscillator MA type",
      defval: "ema",
      options: MACD_MA_TYPES,
    },
    {
      id: "signalMaType",
      type: "select",
      title: "Signal MA type",
      defval: "ema",
      options: MACD_MA_TYPES,
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
      histogramVisible: true,
      histogramPlotType: "columns",
      histColor0: MACD_TV_COLORS.hist0,
      histColor0Opacity: 100,
      histColor1: MACD_TV_COLORS.hist1,
      histColor1Opacity: 100,
      histColor2: MACD_TV_COLORS.hist2,
      histColor2Opacity: 100,
      histColor3: MACD_TV_COLORS.hist3,
      histColor3Opacity: 100,
      macdVisible: true,
      macdColor: MACD_TV_COLORS.macd,
      macdWidth: 1,
      macdStyle: 0,
      macdPriceLine: false,
      macdPlotType: "line",
      signalVisible: true,
      signalColor: MACD_TV_COLORS.signal,
      signalWidth: 1,
      signalStyle: 0,
      signalPriceLine: false,
      signalPlotType: "line",
      zeroVisible: true,
      zeroColor: "#787b86",
      zeroWidth: 1,
      zeroStyle: 2,
      zeroPriceLine: false,
      zeroPlotType: "line",
      zeroLevel: 0,
    };
  }

  static compute(bars, inputs, style) {
    return computeMacdIndicator(bars, inputs, style);
  }

  static formatPlotValue(plotKey, raw) {
    if (plotKey === "zero") return null;
    if (raw == null || !Number.isFinite(raw)) return null;
    return Number(raw).toFixed(2);
  }

  static legendParams(instance) {
    return [
      sourceLabel(instance.inputs.source ?? "close").toLowerCase(),
      String(instance.inputs.fastLength ?? 12),
      String(instance.inputs.slowLength ?? 26),
      String(instance.inputs.signalLength ?? 9),
    ];
  }

  static valueLabels(instance) {
    /** @type {{ key: string, title: string }[]} */
    const labels = [];
    if (instance.style.histogramVisible !== false) {
      labels.push({ key: "histogram", title: "Histogram" });
    }
    labels.push({ key: "macd", title: "MACD" }, { key: "signal", title: "Signal" });
    return labels;
  }

  static plotStyle(instance, plotKey) {
    if (plotKey === "histogram") {
      return {
        visible: instance.style.histogramVisible !== false,
        color: MACD_TV_COLORS.hist0,
        width: 1,
        lineStyle: 0,
        priceLine: false,
        title: "",
      };
    }
    return BaseIndicator.plotStyle(instance, plotKey);
  }

  static stylePlotRows(_inputValues, _style) {
    const macdKeys = plotStyleKeys("macd");
    const signalKeys = plotStyleKeys("signal");
    const zeroKeys = plotStyleKeys("zero");
    return [
      { type: "toggle", visibleKey: "histogramVisible", label: "Histogram" },
      {
        type: "histogramColor",
        label: "Color 0",
        colorKey: "histColor0",
        opacityKey: "histColor0Opacity",
        plotTypeKey: "histogramPlotType",
        plotKind: "macd",
      },
      { type: "histogramColor", label: "Color 1", colorKey: "histColor1", opacityKey: "histColor1Opacity" },
      { type: "histogramColor", label: "Color 2", colorKey: "histColor2", opacityKey: "histColor2Opacity" },
      { type: "histogramColor", label: "Color 3", colorKey: "histColor3", opacityKey: "histColor3Opacity" },
      { type: "separator" },
      { type: "line", plotKey: "macd", label: "MACD", ...macdKeys },
      { type: "line", plotKey: "signal", label: "Signal line", ...signalKeys },
      { type: "band", plotKey: "zero", label: "Zero", levelKey: "zeroLevel", ...zeroKeys },
    ];
  }
});
