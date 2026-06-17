import { barSourceValue } from "./source.js";
import { smoothSeries } from "./smooth.js";
import { applyColorOpacity } from "../../ui/color/picker.js";

/** @typedef {"ema"|"sma"|"smma"|"wma"} MacdMaType */

/** @param {MacdMaType} type */
function normalizeMaType(type) {
  if (type === "sma" || type === "smma" || type === "wma") return type;
  return "ema";
}

/**
 * @param {object[]} bars
 * @param {object} inputs
 * @param {object} style
 */
export function computeMacdIndicator(bars, inputs, style) {
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

  const c0 = applyColorOpacity(String(style.histColor0 ?? "#26a69a"), Number(style.histColor0Opacity) || 100);
  const c1 = applyColorOpacity(String(style.histColor1 ?? "#b2dfdb"), Number(style.histColor1Opacity) || 100);
  const c2 = applyColorOpacity(String(style.histColor2 ?? "#ffcdd2"), Number(style.histColor2Opacity) || 100);
  const c3 = applyColorOpacity(String(style.histColor3 ?? "#ff5252"), Number(style.histColor3Opacity) || 100);

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
