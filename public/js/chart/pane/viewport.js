/**
 * Preserve scroll position across series.setData (LWC resets the time scale by default).
 * Prefer chart-time visible range — stable when prepending history at the left edge.
 */

/** @typedef {{ mode: "time", from: import("lightweight-charts").Time, to: import("lightweight-charts").Time } | { mode: "logical", from: number, to: number }} CapturedViewport */

/** @param {{ from?: unknown, to?: unknown } | null | undefined} range */
function isValidRange(range) {
  return (
    range != null &&
    range.from != null &&
    range.to != null &&
    Number.isFinite(range.from) &&
    Number.isFinite(range.to)
  );
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @returns {CapturedViewport | null}
 */
export function captureVisibleViewport(chart) {
  try {
    const ts = chart.timeScale();
    const time = ts.getVisibleRange?.();
    if (isValidRange(time)) {
      return { mode: "time", from: time.from, to: time.to };
    }
    const logical = ts.getVisibleLogicalRange();
    if (isValidRange(logical)) {
      return { mode: "logical", from: logical.from, to: logical.to };
    }
  } catch {
    /* chart not ready */
  }
  return null;
}

/** @deprecated use captureVisibleViewport */
export function captureVisibleLogicalRange(chart) {
  const v = captureVisibleViewport(chart);
  return v?.mode === "logical" ? { from: v.from, to: v.to } : null;
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {CapturedViewport | null} captured
 * @param {{ logicalShift?: number }} [opts]
 */
export function restoreVisibleViewport(chart, captured, opts = {}) {
  if (!captured) return;
  try {
    const ts = chart.timeScale();
    if (captured.mode === "time" && ts.setVisibleRange) {
      ts.setVisibleRange({ from: captured.from, to: captured.to });
      return;
    }
    if (captured.mode === "logical") {
      const shift = opts.logicalShift ?? 0;
      ts.setVisibleLogicalRange({
        from: captured.from + shift,
        to: captured.to + shift,
      });
    }
  } catch {
    /* chart not ready */
  }
}

/** @deprecated use restoreVisibleViewport */
export function restoreVisibleLogicalRange(chart, range, shift = 0) {
  if (!range) return;
  restoreVisibleViewport(chart, { mode: "logical", from: range.from, to: range.to }, { logicalShift: shift });
}

/**
 * Restore scroll after prepending bars at the left (logical indices shift right).
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {CapturedViewport | null} captured
 * @param {{ from?: number, to?: number } | null | undefined} capturedLogical
 * @param {number} added
 */
export function restoreViewportAfterPrepend(chart, captured, capturedLogical, added) {
  if (!added || added <= 0) {
    restoreVisibleViewport(chart, captured);
    return;
  }
  try {
    const ts = chart.timeScale();
    if (isValidRange(capturedLogical)) {
      ts.setVisibleLogicalRange({
        from: capturedLogical.from + added,
        to: capturedLogical.to + added,
      });
      return;
    }
  } catch {
    /* fall through */
  }
  restoreVisibleViewport(chart, captured, { logicalShift: added });
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {() => void} fn
 * @param {{ logicalShift?: number, followUpFrames?: number, onDone?: () => void }} [opts]
 */
export function withPreservedViewport(chart, fn, opts = {}) {
  const captured = captureVisibleViewport(chart);
  const followUp = opts.followUpFrames ?? 0;
  fn();
  restoreVisibleViewport(chart, captured, opts);
  if (!captured || followUp <= 0) {
    opts.onDone?.();
    return;
  }
  let left = followUp;
  const tick = () => {
    restoreVisibleViewport(chart, captured, opts);
    left -= 1;
    if (left > 0) requestAnimationFrame(tick);
    else opts.onDone?.();
  };
  requestAnimationFrame(tick);
}

/** @deprecated use withPreservedViewport */
export function withPreservedLogicalRange(chart, fn, opts = {}) {
  withPreservedViewport(chart, fn, opts);
}
