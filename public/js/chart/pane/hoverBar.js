/**
 * Resolve hover bar index / bar for status line + indicator values.
 * Matches the values-tooltip nearest-bar behavior.
 */

/** @param {ReturnType<import("../time/timeAdapter.js").createTimeAdapter> | null | undefined} ta @param {number} time */
export function resolveUtcBarTime(ta, time) {
  if (time == null || !Number.isFinite(time)) return time;
  if (ta?.index?.utc?.(time) != null) return time;
  return ta?.time?.toUtc?.(time) ?? time;
}

/** @param {{ time: number }[]} bars @param {number} utcTime */
export function nearestBarIndex(bars, utcTime) {
  if (!bars?.length || utcTime == null || !Number.isFinite(utcTime)) {
    return Math.max(0, (bars?.length ?? 1) - 1);
  }
  let bestIdx = 0;
  let bestDist = Math.abs(bars[0].time - utcTime);
  for (let i = 1; i < bars.length; i += 1) {
    const dist = Math.abs(bars[i].time - utcTime);
    if (dist < bestDist) {
      bestIdx = i;
      bestDist = dist;
    }
  }
  return bestIdx;
}

/**
 * @param {object} pane
 * @param {object | null | undefined} bar
 * @param {(pane: object) => object[]} barsForPane
 */
export function normalizeHoverBar(pane, bar, barsForPane) {
  if (!bar?.time) return undefined;
  const ta = pane.timeAdapter;
  const utcTime = resolveUtcBarTime(ta, bar.time);
  const fromIndex = ta?.index?.utcBarByUtcTime?.(utcTime);
  if (fromIndex) return fromIndex;
  const bars = barsForPane(pane);
  const idx = nearestBarIndex(bars, utcTime);
  return bars[idx] ?? bar;
}

/**
 * @param {object} pane
 * @param {object | null | undefined} bar
 * @param {object[]} utcBars
 * @param {(pane: object) => object[]} barsForPane
 */
export function barIndexForHover(pane, bar, utcBars, barsForPane) {
  if (!utcBars.length) return 0;
  const normalized = bar ? normalizeHoverBar(pane, bar, barsForPane) : null;
  const utcTime = normalized?.time ?? bar?.time;
  if (utcTime == null) return utcBars.length - 1;
  const exact = utcBars.findIndex((b) => b.time === utcTime);
  if (exact >= 0) return exact;
  return nearestBarIndex(utcBars, utcTime);
}
