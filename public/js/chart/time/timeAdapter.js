/**
 * Single boundary for UTC (logic) ↔ chart-time (render) ↔ pixel (screen).
 *
 * Domains are strictly separated:
 * - time:   UTC ↔ chart-time conversion only
 * - index:  bar index lookups only (no pixels, no conversion)
 * - coord:  chart-time ↔ pixel mapping only
 */

import {
  pixelToPoint,
  chartXAt,
  chartVisibleRightX,
  timeToLogical,
  logicalToChartTime,
  safePriceToY,
} from "../coords/timeScale.js";

/**
 * @param {object} opts
 * @param {object[]} opts.utcBars
 * @param {object[]} opts.chartBars
 * @param {object[]} opts.mapBars
 * @param {number} opts.barSec
 */
export function createTimeAdapter({ utcBars, chartBars, mapBars, barSec }) {
  const utcToChartMap = new Map();
  const chartToUtcMap = new Map();
  const utcTimeToIdx = new Map();
  const chartTimeToIdx = new Map();

  const n = Math.min(utcBars.length, chartBars.length);
  for (let i = 0; i < n; i += 1) {
    const utc = utcBars[i].time;
    const chart = chartBars[i].time;
    utcToChartMap.set(utc, chart);
    chartToUtcMap.set(chart, utc);
  }
  utcBars.forEach((b, i) => utcTimeToIdx.set(b.time, i));
  chartBars.forEach((b, i) => chartTimeToIdx.set(b.time, i));

  const lastChart = chartBars.length ? chartBars[chartBars.length - 1].time : null;
  const realLastChartTime = lastChart;

  /** UTC ↔ chart-time only — always via shared logical index for exact round-trip. */
  const time = {
    /** @param {number} utcTime */
    toChart(utcTime) {
      if (utcTime == null || !Number.isFinite(utcTime)) return utcTime;
      if (utcToChartMap.has(utcTime)) return utcToChartMap.get(utcTime);
      const logical = timeToLogical(utcBars, barSec, utcTime);
      if (logical == null || !Number.isFinite(logical)) return utcTime;
      const chart = logicalToChartTime(chartBars, barSec, logical);
      return chart != null && Number.isFinite(chart) ? chart : utcTime;
    },
    /** @param {number} chartTime */
    toUtc(chartTime) {
      if (chartTime == null || !Number.isFinite(chartTime)) return chartTime;
      if (chartToUtcMap.has(chartTime)) return chartToUtcMap.get(chartTime);
      const logical = timeToLogical(chartBars, barSec, chartTime);
      if (logical == null || !Number.isFinite(logical)) return chartTime;
      const utc = logicalToChartTime(utcBars, barSec, logical);
      return utc != null && Number.isFinite(utc) ? utc : chartTime;
    },
  };

  /** Bar index lookups only. */
  const index = {
    /** @param {number} utcTime */
    utc(utcTime) {
      if (utcTime == null || !Number.isFinite(utcTime)) return undefined;
      return utcTimeToIdx.get(utcTime);
    },
    /** @param {number} chartTime */
    chart(chartTime) {
      if (chartTime == null || !Number.isFinite(chartTime)) return undefined;
      return chartTimeToIdx.get(chartTime);
    },
    /** @param {number} i */
    utcBar(i) {
      return i != null && i >= 0 && i < utcBars.length ? utcBars[i] : undefined;
    },
    /** @param {number} utcTime */
    utcBarByUtcTime(utcTime) {
      const i = index.utc(utcTime);
      return i != null ? index.utcBar(i) : undefined;
    },
    /** @param {number} chartTime */
    utcBarByChartTime(chartTime) {
      const i = index.chart(chartTime);
      return i != null ? index.utcBar(i) : undefined;
    },
  };

  /**
   * Chart-time ↔ pixel only. Never returns UTC times or bar indexes.
   * UTC→pixel uses time.toChart internally; callers outside coord must not mix domains.
   */
  const coord = {
    /**
     * Chart-time { time, price } from pane-local pixel coords.
     * @param {import("lightweight-charts").IChartApi} chart
     * @param {import("lightweight-charts").ISeriesApi} series
     * @param {number} x
     * @param {number} y
     */
    fromPixel(chart, series, x, y) {
      return pixelToPoint(chart, series, mapBars, barSec, x, y, realLastChartTime);
    },

    /**
     * @param {import("lightweight-charts").IChartApi} chart
     * @param {import("lightweight-charts").ISeriesApi} series
     * @param {HTMLElement} container
     * @param {number} clientX
     * @param {number} clientY
     */
    fromClient(chart, series, container, clientX, clientY) {
      const rect = container.getBoundingClientRect();
      return coord.fromPixel(chart, series, clientX - rect.left, clientY - rect.top);
    },

    /**
     * @param {import("lightweight-charts").IChartApi} chart
     * @param {import("lightweight-charts").ISeriesApi} series
     * @param {number} mediaX
     * @param {number} mediaY
     */
    fromMedia(chart, series, mediaX, mediaY) {
      return pixelToPoint(chart, series, mapBars, barSec, mediaX, mediaY, realLastChartTime);
    },

    /**
     * @param {import("lightweight-charts").IChartApi} chart
     * @param {number} chartTime
     */
    xFromChart(chart, chartTime) {
      const ts = chart.timeScale();
      return chartXAt(ts, mapBars, barSec, undefined, chartTime, realLastChartTime);
    },

    /**
     * @param {import("lightweight-charts").IChartApi} chart
     * @param {number} utcTime
     */
    xFromUtc(chart, utcTime) {
      return coord.xFromChart(chart, time.toChart(utcTime));
    },

    /** @param {import("lightweight-charts").ISeriesApi} series @param {number} price */
    yFromPrice(series, price) {
      return safePriceToY(series, price);
    },

    /** @param {import("lightweight-charts").IChartApi} chart */
    visibleRightX(chart) {
      return chartVisibleRightX(chart.timeScale());
    },

    /**
     * @param {import("lightweight-charts").IChartApi} chart
     * @param {import("lightweight-charts").ISeriesApi} series
     * @param {number} dx
     * @param {number} dy
     * @param {number} anchorX
     * @param {number} anchorY
     * @param {number} paneW
     * @param {number} paneH
     */
    scrollMedia(chart, series, dx, dy, anchorX, anchorY, paneW, paneH) {
      const pad = 2;
      const ts = chart.timeScale();
      const barSpacing = ts.options().barSpacing ?? 8;

      const anchorPoint = pixelToPoint(chart, series, mapBars, barSec, anchorX, anchorY, realLastChartTime);
      if (!anchorPoint) return null;

      const barDelta = Math.round(dx / barSpacing);
      const logical = timeToLogical(mapBars, barSec, anchorPoint.time);
      if (logical == null || !Number.isFinite(logical)) return null;
      const newChartTime = logicalToChartTime(mapBars, barSec, logical + barDelta);

      const newMediaY = Math.max(pad, Math.min(paneH - pad, anchorY + dy));
      const newPrice = series.coordinateToPrice(newMediaY);
      if (newChartTime == null || newPrice == null || !Number.isFinite(newPrice)) return null;

      const newMediaX = chartXAt(ts, mapBars, barSec, undefined, newChartTime, realLastChartTime);
      const newMediaYFromPrice = safePriceToY(series, newPrice);
      if (newMediaX == null || newMediaYFromPrice == null) return null;

      return {
        x: Math.max(pad, Math.min(paneW - pad, newMediaX)),
        y: Math.max(pad, Math.min(paneH - pad, newMediaYFromPrice)),
      };
    },
  };

  return { time, index, coord };
}
