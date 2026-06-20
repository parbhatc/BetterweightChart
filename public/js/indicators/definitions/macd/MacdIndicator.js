import { BaseIndicator } from "../../BaseIndicator.js";
import { ComputeIndicator } from "../../ComputeIndicator.js";
import { calcInputs, createInt, createSelect, createSource } from "../../builders.js";
import { barSourceValue } from "../../math/source.js";
import { smoothSeries } from "../../math/smooth.js";
import { sourceLabel } from "../../math/source.js";
import { applyColorOpacity } from "../../../ui/color/picker.js";
import { plotStyleKeys } from "../../schema.js";

/** @typedef {"ema"|"sma"|"smma"|"wma"} MacdMaType */

/** @param {MacdMaType} type */
function normalizeMaType(type) {
  if (type === "sma" || type === "smma" || type === "wma") return type;
  return "ema";
}

const COLORS = {
  hist0: "#26a69a",
  hist1: "#b2dfdb",
  hist2: "#ffcdd2",
  hist3: "#ff5252",
  macd: "#2962ff",
  signal: "#ff6d00",
  zero: "rgba(120, 123, 134, 0.5)",
};

const MA_TYPES = [
  { id: "ema", label: "EMA" },
  { id: "sma", label: "SMA" },
  { id: "smma", label: "SMMA (RMA)" },
  { id: "wma", label: "WMA" },
];

class MacdIndicator extends ComputeIndicator {

  constructor() {
    super("macd", "MACD", "MACD");
    this.setPrimaryPlot("macd");
    this.setStudyPaneOrder(1);
    this.setStudyPaneHeight(110);
    this.setPlots([
      {
        id: "histogram",
        type: "histogram",
        title: "Histogram",
        when: (_inputs, style) => style.histogramVisible !== false,
      },
      { id: "macd", title: "MACD", color: COLORS.macd, priceLine: false },
      { id: "signal", title: "Signal line", color: COLORS.signal, priceLine: false },
      { id: "zero", title: "Zero", color: COLORS.zero, priceLine: false, band: true },
    ]);
    this.setInputs([
      createSource("source", "Source", "close"),
      createInt("fastLength", "Fast length", 12),
      createInt("slowLength", "Slow length", 26),
      createInt("signalLength", "Signal length", 9),
      createSelect("oscillatorMaType", "Oscillator MA type", "ema", MA_TYPES),
      createSelect("signalMaType", "Signal MA type", "ema", MA_TYPES),
      ...calcInputs(),
    ]);
  }

  defaultStyle() {
    return {
      ...BaseIndicator.defaultStyle(),
      histogramVisible: true,
      histogramPlotType: "columns",
      histColor0: COLORS.hist0,
      histColor0Opacity: 100,
      histColor1: COLORS.hist1,
      histColor1Opacity: 100,
      histColor2: COLORS.hist2,
      histColor2Opacity: 100,
      histColor3: COLORS.hist3,
      histColor3Opacity: 100,
      macdVisible: true,
      macdColor: COLORS.macd,
      macdWidth: 1,
      macdStyle: 0,
      macdPriceLine: false,
      macdPlotType: "line",
      signalVisible: true,
      signalColor: COLORS.signal,
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

  computeSeries(bars, inputs, style) {
    const source = inputs.source ?? "close";
    const fastLen = Math.max(1, Math.floor(Number(inputs.fastLength) || 12));
    const slowLen = Math.max(1, Math.floor(Number(inputs.slowLength) || 26));
    const signalLen = Math.max(1, Math.floor(Number(inputs.signalLength) || 9));
    const oscMa = normalizeMaType(inputs.oscillatorMaType ?? "ema");
    const sigMa = normalizeMaType(inputs.signalMaType ?? "ema");

    const values = bars.map((b) => barSourceValue(b, source));
    const fast = smoothSeries(values, fastLen, oscMa, bars);
    const slow = smoothSeries(values, slowLen, oscMa, bars);

    /** @type {Array<number | null>} */
    const macd = values.map((_, i) => {
      const f = fast[i];
      const s = slow[i];
      if (f == null || s == null || !Number.isFinite(f) || !Number.isFinite(s)) return null;
      return f - s;
    });

    const signal = smoothSeries(macd, signalLen, sigMa, bars);

    /** @type {Array<number | null>} */
    const histogram = macd.map((m, i) => {
      const sig = signal[i];
      if (m == null || sig == null || !Number.isFinite(m) || !Number.isFinite(sig)) return null;
      return m - sig;
    });

    const c0 = applyColorOpacity(String(style.histColor0 ?? COLORS.hist0), Number(style.histColor0Opacity) || 100);
    const c1 = applyColorOpacity(String(style.histColor1 ?? COLORS.hist1), Number(style.histColor1Opacity) || 100);
    const c2 = applyColorOpacity(String(style.histColor2 ?? COLORS.hist2), Number(style.histColor2Opacity) || 100);
    const c3 = applyColorOpacity(String(style.histColor3 ?? COLORS.hist3), Number(style.histColor3Opacity) || 100);

    const histColors = histogram.map((h, i) => {
      if (h == null || !Number.isFinite(h)) return c0;
      const prev = i > 0 ? histogram[i - 1] : null;
      if (h >= 0) {
        if (prev != null && h < prev) return c1;
        return c0;
      }
      if (prev != null && h > prev) return c2;
      return c3;
    });

    const zeroLevel = Number(style.zeroLevel ?? 0);
    const zero = bars.map(() => (Number.isFinite(zeroLevel) ? zeroLevel : 0));

    return { histogram, macd, signal, zero, histColors };
  }

  formatPlotValue(plotKey, raw) {
    if (plotKey === "zero") return null;
    if (raw == null || !Number.isFinite(raw)) return null;
    return Number(raw).toFixed(2);
  }

  legendParams(instance) {
    return [
      sourceLabel(instance.inputs.source ?? "close").toLowerCase(),
      String(instance.inputs.fastLength ?? 12),
      String(instance.inputs.slowLength ?? 26),
      String(instance.inputs.signalLength ?? 9),
    ];
  }

  valueLabels(instance) {
    /** @type {{ key: string, title: string }[]} */
    const labels = [];
    if (instance.style.histogramVisible !== false) {
      labels.push({ key: "histogram", title: "Histogram" });
    }
    labels.push({ key: "macd", title: "MACD" }, { key: "signal", title: "Signal" });
    return labels;
  }

  plotStyle(instance, plotKey) {
    if (plotKey === "histogram") {
      return {
        visible: instance.style.histogramVisible !== false,
        color: COLORS.hist0,
        width: 1,
        lineStyle: 0,
        priceLine: false,
        title: "",
      };
    }
    return BaseIndicator.plotStyle(instance, plotKey);
  }

  stylePlotRows(_inputValues, _style) {
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
}

ComputeIndicator.define(MacdIndicator);

export default MacdIndicator;
