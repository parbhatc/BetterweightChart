/**
 * Chart coordinate helpers for time/price ↔ pixel mapping.
 * Supports mapping times beyond the last bar (virtual future time via LWC extrapolation).
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

/** Index of last real (non-whitespace) bar in bars array. */
function realLastBarIndex(bars, lastRealChartTime) {
  if (!bars.length) return -1;
  if (lastRealChartTime == null) return bars.length - 1;
  let idx = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].time <= lastRealChartTime) idx = i;
    else break;
  }
  return idx;
}

/**
 * Map x pixel → logical bar index (LWC-aligned, with future/past extrapolation).
 * @param {import("lightweight-charts").ITimeScaleApi} ts
 * @param {{ time: number }[]} bars
 * @param {number} barSec
 * @param {number} x
 * @param {number | null | undefined} [lastRealChartTime]
 */
export function coordinateToLogical(ts, bars, barSec, x, lastRealChartTime) {
  if (!bars.length || x == null || !Number.isFinite(x)) return null;
  const anchorIdx = realLastBarIndex(bars, lastRealChartTime);
  const lastIdx = anchorIdx >= 0 ? anchorIdx : bars.length - 1;
  const barSpacing = ts.options().barSpacing ?? 8;
  const xLast =
    typeof ts.logicalToCoordinate === "function" ? ts.logicalToCoordinate(lastIdx) : null;
  const x0 = typeof ts.logicalToCoordinate === "function" ? ts.logicalToCoordinate(0) : null;

  if (typeof ts.coordinateToLogical === "function") {
    const logical = ts.coordinateToLogical(x);
    if (logical != null && Number.isFinite(logical)) {
      if (xLast != null && barSpacing > 0 && x > xLast + barSpacing * 0.15) {
        return lastIdx + (x - xLast) / barSpacing;
      }
      if (x0 != null && barSpacing > 0 && x < x0 - barSpacing * 0.15) {
        return (x - x0) / barSpacing;
      }
      return logical;
    }
  }

  if (xLast != null && barSpacing > 0 && x > xLast + barSpacing * 0.15) {
    return lastIdx + (x - xLast) / barSpacing;
  }
  if (x0 != null && barSpacing > 0 && x < x0 - barSpacing * 0.15) {
    return (x - x0) / barSpacing;
  }
  return null;
}

/**
 * Map x pixel → chart-time, including future/past beyond series data (no whitespace bars required).
 * @param {import("lightweight-charts").ITimeScaleApi} ts
 * @param {{ time: number }[]} bars
 * @param {number} barSec
 * @param {number} x
 * @param {number | null | undefined} [lastRealChartTime]
 */
export function coordinateToChartTime(ts, bars, barSec, x, lastRealChartTime) {
  if (!bars.length || x == null || !Number.isFinite(x)) {
    chartDebug("drawings", "coordinateToChartTime: no bars or x", { x, bars: bars.length });
    return null;
  }
  const logical = coordinateToLogical(ts, bars, barSec, x, lastRealChartTime);
  if (logical == null || !Number.isFinite(logical)) {
    chartDebug("drawings", "coordinateToChartTime: miss", { x, bars: bars.length });
    return null;
  }
  const time = logicalToChartTime(bars, barSec, logical);
  if (time == null || !Number.isFinite(time)) {
    chartDebug("drawings", "coordinateToChartTime: logicalToChartTime failed", {
      x,
      logical,
      barSec,
      bars: bars.length,
    });
    return null;
  }
  return time;
}

/** @param {{ time: number }[]} bars @param {number} chartTime @param {number | null | undefined} [lastRealChartTime] */
function isChartTimeOnSeries(bars, chartTime, lastRealChartTime) {
  if (!bars.length) return false;
  const last = lastRealChartTime ?? bars[bars.length - 1].time;
  return chartTime >= bars[0].time && chartTime <= last;
}

/**
 * Map chart-time → x pixel, including future/past beyond series data.
 * @param {import("lightweight-charts").ITimeScaleApi} ts
 * @param {{ time: number }[]} bars
 * @param {number} barSec
 * @param {number} timeUtc chart-time
 * @param {number | null | undefined} [lastRealChartTime] last candle chart-time (excludes whitespace bars)
 */
export function chartTimeToCoordinate(ts, bars, barSec, timeUtc, lastRealChartTime) {
  if (!bars.length || timeUtc == null || !Number.isFinite(timeUtc)) return null;
  const barSpacing = ts.options().barSpacing ?? 8;
  const anchorIdx = realLastBarIndex(bars, lastRealChartTime);
  const onSeries = isChartTimeOnSeries(bars, timeUtc, lastRealChartTime);

  const logical = timeToLogical(bars, barSec, timeUtc);
  if (logical == null || !Number.isFinite(logical)) return null;

  if (onSeries && typeof ts.logicalToCoordinate === "function") {
    const viaLogical = ts.logicalToCoordinate(logical);
    if (viaLogical != null && Number.isFinite(viaLogical)) {
      if (typeof ts.timeToCoordinate === "function") {
        const direct = ts.timeToCoordinate(timeUtc);
        // LWC returns 0 for many out-of-range times — only trust direct when it agrees with logical.
        if (
          direct != null &&
          Number.isFinite(direct) &&
          direct > 0 &&
          Math.abs(direct - viaLogical) < 2
        ) {
          return direct;
        }
      }
      return viaLogical;
    }
  }

  if (onSeries && typeof ts.timeToCoordinate === "function") {
    const direct = ts.timeToCoordinate(timeUtc);
    if (direct != null && Number.isFinite(direct) && direct > 0) return direct;
  }

  if (onSeries && typeof ts.logicalToCoordinate === "function") {
    const x = ts.logicalToCoordinate(logical);
    if (x != null && Number.isFinite(x)) return x;
  }

  if (barSpacing > 0 && typeof ts.logicalToCoordinate === "function" && anchorIdx >= 0) {
    const xLast = ts.logicalToCoordinate(anchorIdx);
    if (xLast != null && Number.isFinite(xLast) && logical >= anchorIdx) {
      return xLast + (logical - anchorIdx) * barSpacing;
    }
    const x0 = ts.logicalToCoordinate(0);
    if (x0 != null && Number.isFinite(x0) && logical < 0) {
      return x0 + logical * barSpacing;
    }
  }

  return null;
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

/** @deprecated Use context.timeAdapter.coord — kept for legacy callers only. */
export function coordMapBars(ctx) {
  return ctx.mapBars ?? ctx.bars ?? [];
}

/**
 * @param {import("lightweight-charts").ITimeScaleApi} ts
 * @param {{ time: number }[]} seriesData
 * @param {number} barSec
 * @param {number | null | undefined} [logical]
 * @param {number | null | undefined} [timeUtc]
 * @param {number | null | undefined} [lastRealChartTime]
 */
export function chartXAt(ts, seriesData, barSec, logical, timeUtc, lastRealChartTime) {
  try {
    const anchorIdx = realLastBarIndex(seriesData, lastRealChartTime);
    const lastIdx = anchorIdx >= 0 ? anchorIdx : seriesData.length - 1;
    if (
      logical != null &&
      Number.isFinite(logical) &&
      lastIdx >= 0 &&
      logical >= 0 &&
      logical <= lastIdx &&
      typeof ts.logicalToCoordinate === "function"
    ) {
      const x = ts.logicalToCoordinate(logical);
      if (x != null && Number.isFinite(x)) return x;
    }

    if (timeUtc != null && Number.isFinite(timeUtc) && seriesData.length) {
      const x = chartTimeToCoordinate(ts, seriesData, barSec, timeUtc, lastRealChartTime);
      if (x != null && Number.isFinite(x)) return x;
      chartDebug("drawings", "chartXAt: miss", { timeUtc, barSec, bars: seriesData.length });
    }
  } catch (err) {
    chartDebug("drawings", "chartXAt: error", String(err));
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
    // LWC returns 0 for many out-of-range times — treat as a miss.
    if (x != null && Number.isFinite(x) && x > 0) return x;
    return null;
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
 * @param {number | null | undefined} [lastRealChartTime]
 */
export function pixelToPoint(chart, series, bars, barSec, x, y, lastRealChartTime) {
  const ts = chart.timeScale();
  const price = series.coordinateToPrice(y);
  if (price == null || !Number.isFinite(price)) {
    chartDebug("drawings", "pixelToPoint: no price", { x, y });
    return null;
  }

  const time = coordinateToChartTime(ts, bars, barSec, x, lastRealChartTime);
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
