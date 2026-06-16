/** Minimum future whitespace bars appended past the last candle. */
import { CHART_FEATURES, isFeatureEnabled } from "../features.js";

export const CHART_FUTURE_WHITESPACE_MIN = 48;
/** Extra bars kept ahead of the visible logical range end. */
export const CHART_FUTURE_WHITESPACE_MARGIN = 64;

/** Bars added per grow step when panning into future space. */
export const CHART_FUTURE_WHITESPACE_CHUNK = 64;

/** Upper cap on appended future whitespace bars. */
export const CHART_FUTURE_WHITESPACE_MAX = 2880;

/** @param {object} [scales] */
export function isFutureWhitespaceEnabled(_scales) {
  return isFeatureEnabled(CHART_FEATURES.FUTURE_WHITESPACE);
}

/**
 * @param {object} pane
 * @param {object} [scales]
 */
export function futureWhitespaceBarCount(pane, scales) {
  if (!isFutureWhitespaceEnabled(scales)) return 0;
  return pane.futureWhitespaceBars ?? CHART_FUTURE_WHITESPACE_MIN;
}

/**
 * Append lightweight-charts whitespace points after the last bar so the time
 * scale and crosshair can address future times beyond the last candle.
 *
 * @param {{ time: number }[]} chartBars
 * @param {number} barSec
 * @param {number} count
 */
export function withFutureWhitespace(chartBars, barSec, count) {
  if (!chartBars.length || count <= 0) return chartBars;
  const sec = barSec > 0 ? barSec : 60;
  const out = [...chartBars];
  appendFutureWhitespaceTail(out, sec, count);
  return out;
}

/**
 * Append whitespace time points in place (no copy of existing rows).
 * @param {{ time: number }[]} rows
 * @param {number} barSec
 * @param {number} count
 * @returns {number} bars appended
 */
export function appendFutureWhitespaceTail(rows, barSec, count) {
  if (!rows.length || count <= 0) return 0;
  const sec = barSec > 0 ? barSec : 60;
  let t = rows[rows.length - 1].time;
  for (let i = 0; i < count; i++) {
    t += sec;
    rows.push({ time: t });
  }
  return count;
}
