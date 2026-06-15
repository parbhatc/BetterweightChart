/** Minimum future whitespace bars appended past the last candle. */
export const CHART_FUTURE_WHITESPACE_MIN = 180;

/** Extra bars kept ahead of the visible logical range end. */
export const CHART_FUTURE_WHITESPACE_MARGIN = 64;

/** Bars added per grow step when panning into future space. */
export const CHART_FUTURE_WHITESPACE_CHUNK = 180;

/** Upper cap on appended future whitespace bars. */
export const CHART_FUTURE_WHITESPACE_MAX = 2880;

/**
 * Append lightweight-charts whitespace points after the last bar so the time
 * scale and crosshair can address future times (TradingView-style).
 *
 * @param {{ time: number }[]} chartBars
 * @param {number} barSec
 * @param {number} count
 */
export function withFutureWhitespace(chartBars, barSec, count) {
  if (!chartBars.length || count <= 0) return chartBars;
  const sec = barSec > 0 ? barSec : 60;
  const out = [...chartBars];
  let t = chartBars[chartBars.length - 1].time;
  for (let i = 0; i < count; i++) {
    t += sec;
    out.push({ time: t });
  }
  return out;
}
