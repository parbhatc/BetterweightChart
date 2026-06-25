import {
  chartTimeToCoordinate,
  safeTimeToX,
  timeToLogical,
} from "../../chart/coords/timeScale.js";

/**
 * Pick bar array for overlay time→pixel mapping.
 * When LWC series.data() has extra prefix bars vs mapBars (prepend drift), return logicalOffset.
 * @param {object[]} seriesData
 * @param {object[]} ctxMapBars
 */
export function resolveOverlayMapBars(seriesData, ctxMapBars) {
  if (!ctxMapBars?.length) {
    return { mapBars: seriesData, useAdapter: false, logicalOffset: 0 };
  }
  if (!seriesData?.length) {
    return { mapBars: ctxMapBars, useAdapter: true, logicalOffset: 0 };
  }

  if (seriesData.length !== ctxMapBars.length) {
    const mapHead = ctxMapBars[0]?.time;
    const mapTail = ctxMapBars.at(-1)?.time;
    const seriesHead = seriesData[0]?.time;
    const seriesTail = seriesData.at(-1)?.time;

    // LWC series has extra leading bars — mapBars is the indicator source of truth.
    if (seriesData.length > ctxMapBars.length && mapHead != null) {
      const prefixOffset = seriesData.findIndex((b) => b.time === mapHead);
      if (prefixOffset > 0) {
        return { mapBars: ctxMapBars, useAdapter: true, logicalOffset: prefixOffset };
      }
    }

    // mapBars ahead of series (view updated, series not yet) — use mapBars + adapter.
    if (ctxMapBars.length > seriesData.length && mapHead != null && seriesHead === mapHead) {
      return { mapBars: ctxMapBars, useAdapter: true, logicalOffset: 0 };
    }

    // Heads differ — trust whichever matches the tail (newer history wins).
    if (mapTail != null && seriesTail != null && mapTail === seriesTail) {
      if (seriesData.length > ctxMapBars.length && seriesHead != null && mapHead != null && seriesHead < mapHead) {
        const prefixOffset = seriesData.findIndex((b) => b.time === mapHead);
        return {
          mapBars: ctxMapBars,
          useAdapter: true,
          logicalOffset: prefixOffset > 0 ? prefixOffset : 0,
        };
      }
    }

    const useSeries = seriesData.length > ctxMapBars.length;
    return {
      mapBars: useSeries ? seriesData : ctxMapBars,
      useAdapter: !useSeries,
      logicalOffset: 0,
    };
  }

  if (
    seriesData[0]?.time !== ctxMapBars[0]?.time ||
    seriesData.at(-1)?.time !== ctxMapBars.at(-1)?.time
  ) {
    return { mapBars: seriesData, useAdapter: false, logicalOffset: 0 };
  }

  return { mapBars: ctxMapBars, useAdapter: true, logicalOffset: 0 };
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {{ mapBars?: object[], barSec?: number, lastRealChartTime?: number, timeAdapter?: object } | null} timeCtx
 */
export function createOverlayTimeToX(chart, series, timeCtx) {
  const ts = chart.timeScale();
  const seriesData = series.data?.() ?? [];
  const ctxMapBars = timeCtx?.mapBars ?? [];
  const { mapBars, useAdapter, logicalOffset } = resolveOverlayMapBars(seriesData, ctxMapBars);
  const timeAdapter = useAdapter ? (timeCtx?.timeAdapter ?? null) : null;
  const barSec = timeCtx?.barSec ?? 60;
  const lastReal = timeCtx?.lastRealChartTime ?? mapBars.at(-1)?.time;

  return (t) => {
    if (t == null || !Number.isFinite(Number(t))) return null;
    const time = Number(t);
    if (typeof ts.timeToCoordinate === "function") {
      const direct = ts.timeToCoordinate(time);
      if (direct != null && Number.isFinite(direct) && direct > 0) return direct;
    }
    if (timeAdapter) {
      const x = timeAdapter.coord.xFromChart(chart, time);
      if (x != null && Number.isFinite(x)) return x;
    }
    if (mapBars.length) {
      if (logicalOffset > 0 && typeof ts.logicalToCoordinate === "function") {
        const logical = timeToLogical(mapBars, barSec, time);
        if (logical != null && Number.isFinite(logical)) {
          const x = ts.logicalToCoordinate(logical + logicalOffset);
          if (x != null && Number.isFinite(x)) return x;
        }
      }
      const x = chartTimeToCoordinate(ts, mapBars, barSec, time, lastReal);
      if (x != null && Number.isFinite(x)) return x;
    }
    return safeTimeToX(ts, time);
  };
}
