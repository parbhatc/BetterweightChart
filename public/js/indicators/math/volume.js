import { smoothSeries } from "./smooth.js";
import { applyColorOpacity } from "../../ui/color/picker.js";

/**
 * @param {object[]} bars
 * @param {object} inputs
 * @param {object} style
 */
export function computeVolumeIndicator(bars, inputs, style) {
  const maLength = Math.max(1, Math.floor(Number(inputs.maLength) || 20));
  const vol = bars.map((b) => {
    const v = Number(b.volume);
    return Number.isFinite(v) ? v : 0;
  });
  const ma = smoothSeries(vol, maLength, "sma");
  const usePrevClose = Boolean(inputs.colorBasedOnPrevClose);
  const growing = applyColorOpacity(
    String(style.growingColor ?? "#26a69a"),
    Number(style.growingOpacity ?? 50),
  );
  const falling = applyColorOpacity(
    String(style.fallingColor ?? "#ef5350"),
    Number(style.fallingOpacity ?? 50),
  );
  /** @type {string[]} */
  const volColors = bars.map((b, i) => {
    const prev = bars[i - 1];
    let up;
    if (usePrevClose && prev) {
      up = Number(b.close) >= Number(prev.close);
    } else {
      up = Number(b.close) >= Number(b.open);
    }
    return up ? growing : falling;
  });
  return { vol, ma, volColors };
}
