import { barSourceValue } from "./source.js";
import { smoothSeries, stdDev } from "./smooth.js";

/** @typedef {"none"|"sma"|"sma_bb"|"ema"|"smma"|"wma"|"vwma"} SmoothingType */

export const SMOOTHING_TYPES = /** @type {const} */ ([
  { id: "none", label: "None" },
  { id: "sma", label: "SMA" },
  { id: "sma_bb", label: "SMA + Bollinger Bands" },
  { id: "ema", label: "EMA" },
  { id: "smma", label: "SMMA (RMA)" },
  { id: "wma", label: "WMA" },
  { id: "vwma", label: "VWMA" },
]);

/**
 * @param {object[]} bars
 * @param {object} inputs
 * @param {number} inputs.length
 * @param {import("./source.js").PriceSource} inputs.source
 * @param {number} inputs.offset
 * @param {SmoothingType} inputs.smoothingType
 * @param {number} inputs.smoothingLength
 * @param {number} inputs.bbStdDev
 */
export function computeEmaIndicator(bars, inputs) {
  const length = Math.max(1, Math.floor(Number(inputs.length) || 9));
  const source = inputs.source ?? "close";
  const offset = Math.floor(Number(inputs.offset) || 0);
  const smoothingType = inputs.smoothingType ?? "none";
  const smoothingLength = Math.max(1, Math.floor(Number(inputs.smoothingLength) || 14));
  const bbStdDev = Math.max(0, Number(inputs.bbStdDev) || 2);

  const raw = bars.map((b) => barSourceValue(b, source));
  const ema = emaCore(raw, length);
  const shifted = applyOffset(ema, offset);

  /** @type {Record<string, Array<number | null>>} */
  const plots = { ema: shifted };

  if (smoothingType !== "none") {
    const smoothType = smoothingType === "sma_bb" ? "sma" : smoothingType;
    const smoothed = smoothSeries(shifted, smoothingLength, smoothType, bars);
    plots.smoothed = smoothed;
    if (smoothingType === "sma_bb") {
      const dev = stdDev(shifted, smoothingLength);
      plots.upper = smoothed.map((m, i) =>
        m != null && dev[i] != null ? m + bbStdDev * dev[i] : null,
      );
      plots.lower = smoothed.map((m, i) =>
        m != null && dev[i] != null ? m - bbStdDev * dev[i] : null,
      );
    }
  }

  return plots;
}

/** @param {Array<number | null>} values @param {number} length */
function emaCore(values, length) {
  const out = /** @type {Array<number | null>} */ ([]);
  const k = 2 / (length + 1);
  let ema = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out.push(null);
      continue;
    }
    if (ema == null) {
      if (i + 1 < length) {
        out.push(null);
        continue;
      }
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += values[j] ?? 0;
      ema = sum / length;
    } else {
      ema = v * k + ema * (1 - k);
    }
    out.push(ema);
  }
  return out;
}

/** @param {Array<number | null>} values @param {number} offset */
function applyOffset(values, offset) {
  if (!offset) return values.slice();
  const out = values.map(() => null);
  if (offset > 0) {
    for (let i = offset; i < values.length; i++) out[i] = values[i - offset];
  } else {
    const abs = Math.abs(offset);
    for (let i = 0; i + abs < values.length; i++) out[i] = values[i + abs];
  }
  return out;
}
