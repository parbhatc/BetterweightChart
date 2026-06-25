import { rafThrottle } from "../chart/pan/perf.js";

/**
 * Cache visible logical range for use inside primitive updateAllViews (avoid
 * getVisibleLogicalRange during LWC recalculate — it re-enters range handlers).
 * Updates synchronously on every range change so shading stays locked to candles.
 * @param {import("lightweight-charts").ITimeScaleApi} timeScale
 * @param {(range: { from: number, to: number } | null) => void} onRange
 * @returns {() => void}
 */
export function subscribeVisibleLogicalRangeCache(timeScale, onRange) {
  const push = () => onRange(timeScale.getVisibleLogicalRange() ?? null);
  push();
  timeScale.subscribeVisibleLogicalRangeChange(push);
  return () => {
    try {
      timeScale.unsubscribeVisibleLogicalRangeChange(push);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Subscribe to visible-range changes with at-most-once-per-frame refresh.
 * LWC already repaints on pan/zoom; this coalesces extra primitive requestUpdate calls.
 * @param {import("lightweight-charts").ITimeScaleApi} timeScale
 * @param {() => void} requestUpdate
 * @returns {() => void}
 */
export function subscribePrimitiveViewportRefresh(timeScale, requestUpdate) {
  const onRange = rafThrottle(() => requestUpdate());
  timeScale.subscribeVisibleLogicalRangeChange(onRange);
  return () => {
    try {
      timeScale.unsubscribeVisibleLogicalRangeChange(onRange);
    } catch {
      /* ignore */
    }
  };
}
