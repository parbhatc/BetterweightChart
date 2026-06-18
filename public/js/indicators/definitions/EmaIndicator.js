import { defineIndicator } from "../defineIndicator.js";
import { SMOOTHING_TYPES } from "../math/ema.js";
import { sourceLabel } from "../math/source.js";

export const EMA_TV_COLORS = {
  ema: "#2962ff",
  smoothed: "#fdd835",
  bbLine: "#4caf50",
  bbFill: "#4caf50",
};

/** @param {Array<number | null>} buf @param {number} i @param {number} offset */
function shiftedAt(buf, i, offset) {
  if (!offset) return buf[i] ?? null;
  if (offset > 0) {
    const src = i - offset;
    return src >= 0 ? (buf[src] ?? null) : null;
  }
  const src = i + Math.abs(offset);
  return src < buf.length ? (buf[src] ?? null) : null;
}

/** @param {number[]} ring @param {number} len @param {number | null} val */
function pushRing(ring, len, val) {
  ring.push(val);
  while (ring.length > len) ring.shift();
}

/** @param {number[]} ring @param {number} len */
function smaRing(ring, len) {
  if (ring.length < len) return null;
  const slice = ring.slice(-len);
  if (slice.some((v) => v == null || !Number.isFinite(v))) return null;
  return slice.reduce((a, b) => a + b, 0) / len;
}

/** @param {number[]} ring @param {number} len */
function stdDevRing(ring, len) {
  if (ring.length < len) return null;
  const slice = ring.slice(-len);
  if (slice.some((v) => v == null || !Number.isFinite(v))) return null;
  const mean = slice.reduce((a, b) => a + b, 0) / len;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / len;
  return Math.sqrt(variance);
}

/** @param {number[]} ring @param {number} len */
function wmaRing(ring, len) {
  if (ring.length < len) return null;
  const slice = ring.slice(-len);
  if (slice.some((v) => v == null || !Number.isFinite(v))) return null;
  const denom = (len * (len + 1)) / 2;
  let sum = 0;
  for (let w = 1; w <= len; w++) sum += slice[w - 1] * w;
  return sum / denom;
}

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

  init() {
    const inputs = this.inputs;
    const length = Math.max(1, Math.floor(Number(inputs.length) || 9));
    const smoothingType = inputs.smoothingType ?? "none";
    const smoothType = smoothingType === "sma_bb" ? "sma" : smoothingType;
    this.state.length = length;
    this.state.k = 2 / (length + 1);
    this.state.ema = null;
    this.state.warm = 0;
    this.state.warmSum = 0;
    this.state.offset = Math.floor(Number(inputs.offset) || 0);
    this.state.smoothingType = smoothingType;
    this.state.smoothType = smoothType;
    this.state.smoothingLength = Math.max(1, Math.floor(Number(inputs.smoothingLength) || 14));
    this.state.bbStdDev = Math.max(0, Number(inputs.bbStdDev) || 2);
    this.state.rawEma = [];
    this.state.shiftedRing = [];
    this.state.smoothEma = null;
    this.state.smma = null;
    this.state.smoothWarm = 0;
    this.state.smoothWarmSum = 0;
    this.state.vwmaPvRing = [];
    this.state.vwmaVolRing = [];
  }

  onBar(bar) {
    const v = this.math.source(bar, this.inputs.source);
    let ema = null;
    if (v != null && Number.isFinite(v)) {
      if (this.state.ema == null) {
        this.state.warmSum += v;
        this.state.warm += 1;
        if (this.state.warm >= this.state.length) {
          this.state.ema = this.state.warmSum / this.state.length;
        }
      } else {
        this.state.ema = v * this.state.k + this.state.ema * (1 - this.state.k);
      }
      ema = this.state.ema;
    }
    this.state.rawEma.push(ema);
    const shifted = shiftedAt(this.state.rawEma, this.index, this.state.offset);
    this.plot("ema", shifted);

    if (this.state.smoothingType === "none") return;

    pushRing(this.state.shiftedRing, this.state.smoothingLength, shifted);
    const slen = this.state.smoothingLength;
    let smoothed = null;

    if (this.state.smoothType === "sma") {
      smoothed = smaRing(this.state.shiftedRing, slen);
    } else if (this.state.smoothType === "ema") {
      if (shifted != null && Number.isFinite(shifted)) {
        if (this.state.smoothEma == null) {
          this.state.smoothWarmSum += shifted;
          this.state.smoothWarm += 1;
          if (this.state.smoothWarm >= slen) {
            this.state.smoothEma = this.state.smoothWarmSum / slen;
          }
        } else {
          const sk = 2 / (slen + 1);
          this.state.smoothEma = shifted * sk + this.state.smoothEma * (1 - sk);
        }
        smoothed = this.state.smoothEma;
      }
    } else if (this.state.smoothType === "smma") {
      if (shifted != null && Number.isFinite(shifted)) {
        if (this.state.smma == null) {
          this.state.smoothWarmSum += shifted;
          this.state.smoothWarm += 1;
          if (this.state.smoothWarm >= slen) {
            this.state.smma = this.state.smoothWarmSum / slen;
          }
        } else {
          this.state.smma = (this.state.smma * (slen - 1) + shifted) / slen;
        }
        smoothed = this.state.smma;
      }
    } else if (this.state.smoothType === "wma") {
      smoothed = wmaRing(this.state.shiftedRing, slen);
    } else if (this.state.smoothType === "vwma") {
      const vol = Number(bar.volume) || 0;
      pushRing(this.state.vwmaPvRing, slen, shifted != null && vol > 0 ? shifted * vol : null);
      pushRing(this.state.vwmaVolRing, slen, vol > 0 ? vol : null);
      if (this.state.vwmaPvRing.length >= slen) {
        let pv = 0;
        let vsum = 0;
        const pvSlice = this.state.vwmaPvRing.slice(-slen);
        const volSlice = this.state.vwmaVolRing.slice(-slen);
        for (let j = 0; j < slen; j++) {
          const p = pvSlice[j];
          const vv = volSlice[j];
          if (p == null || vv == null || vv <= 0) {
            pv = NaN;
            break;
          }
          pv += p;
          vsum += vv;
        }
        smoothed = Number.isFinite(pv) && vsum > 0 ? pv / vsum : null;
      }
    }

    this.plot("smoothed", smoothed);
    if (this.state.smoothingType === "sma_bb") {
      const dev = stdDevRing(this.state.shiftedRing, slen);
      this.plot(
        "upper",
        smoothed != null && dev != null ? smoothed + this.state.bbStdDev * dev : null,
      );
      this.plot(
        "lower",
        smoothed != null && dev != null ? smoothed - this.state.bbStdDev * dev : null,
      );
    }
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
