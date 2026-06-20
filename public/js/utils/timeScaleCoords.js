export class TimeScaleCoords {
  /** @param {{ time: number }[]} seriesData @param {number} tfSec @param {number} logical */
  static logicalToChartTime(seriesData, tfSec, logical) {
    if (!seriesData.length || logical == null || !Number.isFinite(logical)) return null;
    const lastIdx = seriesData.length - 1;
    const idx = Math.round(logical);
    if (idx >= 0 && idx <= lastIdx) return seriesData[idx]?.time ?? null;
    const last = seriesData[lastIdx];
    const sec = tfSec > 0 ? tfSec : 60;
    return last.time + (idx - lastIdx) * sec;
  }

  /**
   * @param {import("lightweight-charts").ITimeScaleApi<import("lightweight-charts").Time>} ts
   * @param {{ time: number }[]} seriesData
   * @param {number} tfSec
   * @param {number | null | undefined} [logical]
   * @param {number | null | undefined} [timeUtc]
   */
  static chartXAt(ts, seriesData, tfSec, logical, timeUtc) {
    try {
      if (logical != null && Number.isFinite(logical) && typeof ts.logicalToCoordinate === "function") {
        const x = ts.logicalToCoordinate(logical);
        if (x != null && Number.isFinite(x)) return x;
      }

      if (timeUtc != null && Number.isFinite(timeUtc)) {
        let x = typeof ts.timeToCoordinate === "function" ? ts.timeToCoordinate(timeUtc) : null;
        if (x != null && Number.isFinite(x)) return x;

        if (seriesData.length && typeof ts.logicalToCoordinate === "function") {
          const lastIdx = seriesData.length - 1;
          const last = seriesData[lastIdx];
          const sec = tfSec > 0 ? tfSec : 60;
          const first = seriesData[0];
          if (timeUtc >= last.time) {
            const lo = lastIdx + (timeUtc - last.time) / sec;
            x = ts.logicalToCoordinate(lo);
            if (x != null && Number.isFinite(x)) return x;
          }
          if (timeUtc < first.time) {
            const lo = (timeUtc - first.time) / sec;
            x = ts.logicalToCoordinate(lo);
            if (x != null && Number.isFinite(x)) return x;
          }
          let lo = 0;
          let hi = lastIdx;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (seriesData[mid].time <= timeUtc) lo = mid;
            else hi = mid - 1;
          }
          x = ts.logicalToCoordinate(lo);
          if (x != null && Number.isFinite(x)) return x;
        }
      }
    } catch {
      //
    }

    return null;
  }

  static chartVisibleRightX(ts) {
    if (!ts || typeof ts.getVisibleLogicalRange !== "function" || typeof ts.logicalToCoordinate !== "function") {
      return null;
    }
    const range = ts.getVisibleLogicalRange();
    if (!range || range.to == null || !Number.isFinite(range.to)) return null;
    const x = ts.logicalToCoordinate(range.to);
    return x != null && Number.isFinite(x) ? x : null;
  }
}

export const logicalToChartTime = (seriesData, tfSec, logical) =>
  TimeScaleCoords.logicalToChartTime(seriesData, tfSec, logical);
export const chartXAt = (ts, seriesData, tfSec, logical, timeUtc) =>
  TimeScaleCoords.chartXAt(ts, seriesData, tfSec, logical, timeUtc);
export const chartVisibleRightX = (ts) => TimeScaleCoords.chartVisibleRightX(ts);

/** Avoid lightweight-charts "Value is null" when scale is not ready yet. */
export function safePriceToY(series, price) {
  if (price == null || !Number.isFinite(Number(price))) return null;
  try {
    const y = series?.priceToCoordinate?.(Number(price));
    return y != null && Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
}

/** @param {import("lightweight-charts").ITimeScaleApi<import("lightweight-charts").Time>} ts */
export function safeTimeToX(ts, time) {
  if (time == null || !Number.isFinite(Number(time))) return null;
  try {
    const x = ts?.timeToCoordinate?.(Number(time));
    return x != null && Number.isFinite(x) ? x : null;
  } catch {
    return null;
  }
}
