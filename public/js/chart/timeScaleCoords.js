/**
 * Chart coordinate helpers for time/price ↔ pixel mapping.
 * Supports mapping times beyond the last bar (future whitespace).
 */

/** @param {{ time: number }[]} seriesData @param {number} barSec @param {number} logical */
export function logicalToChartTime(seriesData, barSec, logical) {
  if (!seriesData.length || logical == null || !Number.isFinite(logical)) return null;
  const lastIdx = seriesData.length - 1;
  const idx = Math.round(logical);
  if (idx >= 0 && idx <= lastIdx) return seriesData[idx]?.time ?? null;
  const last = seriesData[lastIdx];
  const sec = barSec > 0 ? barSec : 60;
  return last.time + (idx - lastIdx) * sec;
}

/**
 * @param {import("lightweight-charts").ITimeScaleApi} ts
 * @param {{ time: number }[]} seriesData
 * @param {number} barSec
 * @param {number | null | undefined} [logical]
 * @param {number | null | undefined} [timeUtc]
 */
export function chartXAt(ts, seriesData, barSec, logical, timeUtc) {
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
        const sec = barSec > 0 ? barSec : 60;
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

export function chartVisibleRightX(ts) {
  if (!ts?.getVisibleLogicalRange || !ts?.logicalToCoordinate) return null;
  const range = ts.getVisibleLogicalRange();
  if (!range || range.to == null || !Number.isFinite(range.to)) return null;
  const x = ts.logicalToCoordinate(range.to);
  return x != null && Number.isFinite(x) ? x : null;
}

/** @param {import("lightweight-charts").ISeriesApi} series @param {number} price */
export function safePriceToY(series, price) {
  if (price == null || !Number.isFinite(Number(price))) return null;
  try {
    const y = series?.priceToCoordinate?.(Number(price));
    return y != null && Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
}

/** @param {import("lightweight-charts").ITimeScaleApi} ts @param {number} time */
export function safeTimeToX(ts, time) {
  if (time == null || !Number.isFinite(Number(time))) return null;
  try {
    const x = ts?.timeToCoordinate?.(Number(time));
    return x != null && Number.isFinite(x) ? x : null;
  } catch {
    return null;
  }
}

/**
 * @param {import("lightweight-charts").ITimeScaleApi} ts
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {{ time: number }[]} bars
 * @param {number} barSec
 * @param {number} time
 * @param {number} price
 */
export function pointToPixel(ts, series, bars, barSec, time, price) {
  const y = safePriceToY(series, price);
  const x = chartXAt(ts, bars, barSec, undefined, time);
  if (x == null || y == null) return null;
  return { x, y };
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {{ time: number }[]} bars
 * @param {number} barSec
 * @param {number} x
 * @param {number} y
 */
export function pixelToPoint(chart, series, bars, barSec, x, y) {
  const ts = chart.timeScale();
  const price = series.coordinateToPrice(y);
  if (price == null || !Number.isFinite(price)) return null;

  let time = null;
  if (typeof ts.coordinateToTime === "function") {
    const t = ts.coordinateToTime(x);
    if (t != null) time = typeof t === "number" ? t : null;
  }

  if (time == null && bars.length && typeof ts.coordinateToLogical === "function") {
    const logical = ts.coordinateToLogical(x);
    if (logical != null && Number.isFinite(logical)) {
      time = logicalToChartTime(bars, barSec, logical);
    }
  }

  if (time == null || !Number.isFinite(time)) return null;
  return { time, price: Number(price) };
}
