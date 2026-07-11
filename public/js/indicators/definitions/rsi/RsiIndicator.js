import { ComputeIndicator } from "../../ComputeIndicator.js";
import { calcInputs, createInt, createSelect, createSource, fill, lengthSourceLegend, plot } from "../../builders.js";
import { SMOOTHING_TYPE, SMOOTHING_TYPES } from "../../math/ema.js";
import { barSourceValue } from "../../math/source.js";
import { smoothSeries } from "../../math/smooth.js";
import { fillStyleKeys, buildBandFillSegments } from "../../schema.js";
import { applyColorOpacity } from "../../../ui/color/picker.js";

/** @param {number} avgGain @param {number} avgLoss */
function rsiFromAvg(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Wilder RSI (matches TradingView ta.rsi).
 * @param {object[]} bars
 * @param {number} length
 * @param {import("../../math/source.js").PriceSource} source
 */
function computeRsi(bars, length, source) {
  const len = Math.max(1, Math.floor(Number(length) || 14));
  const values = bars.map((b) => barSourceValue(b, source));
  const n = values.length;
  /** @type {Array<number | null>} */
  const out = new Array(n).fill(null);
  if (n < len + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= len; i += 1) {
    const ch = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (ch > 0) avgGain += ch;
    else avgLoss += -ch;
  }
  avgGain /= len;
  avgLoss /= len;
  out[len] = rsiFromAvg(avgGain, avgLoss);

  for (let i = len + 1; i < n; i += 1) {
    const ch = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (len - 1) + gain) / len;
    avgLoss = (avgLoss * (len - 1) + loss) / len;
    out[i] = rsiFromAvg(avgGain, avgLoss);
  }
  return out;
}

const COLORS = {
  rsi: "#7e57c2",
  smoothed: "#fdd835",
  band: "#787b86",
};

const RSI_SMOOTHING_TYPES = SMOOTHING_TYPES.filter(
  (t) => t.id !== SMOOTHING_TYPE.SMA_BOLLINGER_BAND,
);

class RsiIndicator extends ComputeIndicator {

  constructor() {
    super("rsi", "RSI", "RSI");
    this.setPrimaryPlot("rsi");
    this.setStudyPaneOrder(0);
    this.setStudyPaneHeight(100);
    this.setStudyPaneScale({ min: 0, max: 100 });
    this.setPlots([
      plot("rsi", "RSI", COLORS.rsi),
      plot("smoothed", "RSI-based MA", COLORS.smoothed, {
        when: (inputs) => inputs.smoothingType !== SMOOTHING_TYPE.NONE,
      }),
      plot("upper", "RSI Upper Band", COLORS.band, { band: true, lineStyle: 2, level: 70 }),
      plot("middle", "RSI Middle Band", COLORS.band, { band: true, lineStyle: 2, level: 50 }),
      plot("lower", "RSI Lower Band", COLORS.band, { band: true, lineStyle: 2, level: 30 }),
    ]);
    this.setFills([
      fill("rsiBgFill", "upper", "lower", "RSI Background Fill", COLORS.rsi, { opacity: 15 }),
    ]);
    this.setInputs([
      createInt("length", "RSI Length", 14, { section: "RSI Settings" }),
      createSource("source", "Source", "close", { section: "RSI Settings" }),
      createSelect("smoothingType", "Type", SMOOTHING_TYPE.SMA, RSI_SMOOTHING_TYPES, {
        section: "Smoothing",
        affectsStyle: true,
      }),
      createInt("smoothingLength", "Length", 14, {
        section: "Smoothing",
        disabled: (inputs) => inputs.smoothingType === SMOOTHING_TYPE.NONE,
      }),
      ...calcInputs(),
    ]);
  }

  computeSeries(bars, inputs, style) {
    const length = Math.max(1, Math.floor(Number(inputs.length) || 14));
    const source = inputs.source ?? "close";
    const smoothingType = inputs.smoothingType ?? "sma";
    const smoothingLength = Math.max(1, Math.floor(Number(inputs.smoothingLength) || 14));

    const rsi = computeRsi(bars, length, source);
    /** @type {Record<string, Array<number | null>>} */
    const plots = { rsi };

    if (smoothingType !== "none") {
      const smoothType = smoothingType === "sma_bb" ? "sma" : smoothingType;
      plots.smoothed = smoothSeries(rsi, smoothingLength, smoothType, bars);
    }

    const upperLevel = Number(style.upperLevel ?? 70);
    const middleLevel = Number(style.middleLevel ?? 50);
    const lowerLevel = Number(style.lowerLevel ?? 30);
    plots.upper = bars.map(() => (Number.isFinite(upperLevel) ? upperLevel : 70));
    plots.middle = bars.map(() => (Number.isFinite(middleLevel) ? middleLevel : 50));
    plots.lower = bars.map(() => (Number.isFinite(lowerLevel) ? lowerLevel : 30));

    return plots;
  }

  formatPlotValue(plotKey, raw) {
    if (plotKey === "rsi" || plotKey === "smoothed") {
      if (raw == null || !Number.isFinite(raw)) return null;
      return Number(raw).toFixed(2);
    }
    return null;
  }

  legendParams(instance) {
    return lengthSourceLegend(instance.inputs, 14);
  }

  valueLabels(instance) {
    /** @type {{ key: string, title: string }[]} */
    const labels = [{ key: "rsi", title: "RSI" }];
    if (instance.inputs.smoothingType !== SMOOTHING_TYPE.NONE) {
      labels.push({ key: "smoothed", title: "RSI-based MA" });
    }
    return labels;
  }

  getBandFills(instance, chartBars) {
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
          String(instance.style[keys.colorKey] ?? COLORS.rsi),
          Number(instance.style[keys.opacityKey]) || 15,
        ),
        segments,
        extendRight: true,
      },
    ];
  }

  handleInputChange(inputValues, style, changedKey) {
    if (changedKey === "smoothingType" && inputValues.smoothingType !== SMOOTHING_TYPE.NONE) {
      style.smoothedVisible = true;
    }
  }
}

ComputeIndicator.define(RsiIndicator);

export default RsiIndicator;
