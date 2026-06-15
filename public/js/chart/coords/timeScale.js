/**
 * Chart coordinate helpers for time/price ↔ pixel mapping.
 * Supports mapping times beyond the last bar (future whitespace).
 */

import { chartDebug } from "../../debug/chart/index.js";

/** @param {{ time: number }[]} seriesData @param {number} barSec @param {number} timeUtc */
export function timeToLogical(seriesData, barSec, timeUtc) {
  if (!seriesData.length || timeUtc == null || !Number.isFinite(timeUtc)) return null;
  const sec = barSec > 0 ? barSec : 60;
  const lastIdx = seriesData.length - 1;
  const first = seriesData[0];
  const last = seriesData[lastIdx];

  if (timeUtc <= first.time) {
    if (seriesData.length > 1 && seriesData[1].time !== first.time) {
      return (timeUtc - first.time) / (seriesData[1].time - first.time);
    }
    return (timeUtc - first.time) / sec;
  }
  if (timeUtc >= last.time) {
    return lastIdx + (timeUtc - last.time) / sec;
  }

  let lo = 0;
  let hi = lastIdx;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (seriesData[mid].time <= timeUtc) lo = mid;
    else hi = mid;
  }
  const t0 = seriesData[lo].time;
  const t1 = seriesData[hi].time;
  if (t1 <= t0) return lo;
  return lo + (timeUtc - t0) / (t1 - t0);
}

/** @param {{ time: number }[]} seriesData @param {number} barSec @param {number} logical */
export function logicalToChartTime(seriesData, barSec, logical) {
  if (!seriesData.length || logical == null || !Number.isFinite(logical)) return null;
  const lastIdx = seriesData.length - 1;
  const sec = barSec > 0 ? barSec : 60;

  if (logical <= 0) {
    const first = seriesData[0];
    if (seriesData.length > 1 && seriesData[1].time !== first.time) {
      return first.time + logical * (seriesData[1].time - first.time);
    }
    return first.time + logical * sec;
  }
  if (logical >= lastIdx) {
    const last = seriesData[lastIdx];
    return last.time + (logical - lastIdx) * sec;
  }

  const lo = Math.floor(logical);
  const hi = lo + 1;
  const t0 = seriesData[lo].time;
  const t1 = seriesData[hi].time;
  return t0 + (logical - lo) * (t1 - t0);
}

/** @param {number} time @param {{ time: number }[]} bars @param {number} barSec */
export function timeToBarIndex(time, bars, barSec) {
  const logical = timeToLogical(bars, barSec, time);
  if (logical == null || !Number.isFinite(logical)) return 0;
  return Math.round(logical);
}

/** @param {number} barIdx @param {{ time: number }[]} bars @param {number} barSec */
export function barIndexToTime(barIdx, bars, barSec) {
  if (!Number.isFinite(barIdx)) return null;
  return logicalToChartTime(bars, barSec, barIdx);
}

/** @param {number} time @param {{ time: number }[]} bars @param {number} barSec */
export function snapTimeToNearestBar(time, bars, barSec) {
  if (!bars.length || time == null || !Number.isFinite(time)) return time;
  const logical = timeToLogical(bars, barSec, time);
  if (logical == null || !Number.isFinite(logical)) return time;
  const snapped = logicalToChartTime(bars, barSec, Math.round(logical));
  return snapped ?? time;
}

/** @param {number} time @param {{ time: number }[]} bars */
export function clampTimeToBarRange(time, bars) {
  if (!bars?.length || time == null || !Number.isFinite(time)) return time;
  const first = bars[0].time;
  const last = bars[bars.length - 1].time;
  if (time < first) return first;
  if (time > last) return last;
  return time;
}

/** @param {{ bars?: { time: number }[], mapBars?: { time: number }[] }} ctx */
export function coordMapBars(ctx) {
  return ctx.mapBars ?? ctx.bars ?? [];
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
        const logical = timeToLogical(seriesData, barSec, timeUtc);
        if (logical != null && Number.isFinite(logical)) {
          x = ts.logicalToCoordinate(logical);
          if (x != null && Number.isFinite(x)) {
            chartDebug("drawings", "chartXAt", { timeUtc, logical, x, barSec, bars: seriesData.length });
            return x;
          }
        }
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
  if (bars.length && typeof ts.coordinateToLogical === "function") {
    const logical = ts.coordinateToLogical(x);
    if (logical != null && Number.isFinite(logical)) {
      time = logicalToChartTime(bars, barSec, logical);
      chartDebug("drawings", "pixelToPoint", { x, logical, time, barSec, bars: bars.length });
    }
  }

  if (time == null && typeof ts.coordinateToTime === "function") {
    const t = ts.coordinateToTime(x);
    if (t != null) time = typeof t === "number" ? t : null;
  }

  if (time == null || !Number.isFinite(time)) return null;
  return { time, price: Number(price) };
}

/**
 * Visible price span on the main series pane (top → bottom of chart area).
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {import("lightweight-charts").ISeriesApi} series
 */
export function measureVisiblePriceRange(chart, series) {
  const paneH = chart?.paneSize?.()?.height;
  if (!paneH || paneH <= 0) return null;
  const pTop = series?.coordinateToPrice?.(0);
  const pBottom = series?.coordinateToPrice?.(paneH);
  if (pTop == null || pBottom == null || !Number.isFinite(pTop) || !Number.isFinite(pBottom)) return null;
  const range = Math.abs(pBottom - pTop);
  return range > 0 ? range : null;
}
