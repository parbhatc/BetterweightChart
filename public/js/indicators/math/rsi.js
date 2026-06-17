import { barSourceValue } from "./source.js";
import { smoothSeries } from "./smooth.js";

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
 * @param {import("./source.js").PriceSource} source
 */
export function computeRsi(bars, length, source) {
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

/**
 * @param {object[]} bars
 * @param {object} inputs
 * @param {object} style
 */
export function computeRsiIndicator(bars, inputs, style) {
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
