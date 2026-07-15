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
 * Resolve the overlay time→pixel mapping. Performs the ONE series.data() copy +
 * resolveOverlayMapBars. The result only changes when bar DATA changes (not during a pan),
 * so callers should cache it and rebuild only on data-change.
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {{ mapBars?: object[], barSec?: number, lastRealChartTime?: number, timeAdapter?: object } | null} timeCtx
 * @returns {{ mapBars: object[], useAdapter: boolean, logicalOffset: number, barSec: number, lastReal: number|undefined, timeAdapter: object|null }}
 */
export function resolveOverlayTimeMapping(series, timeCtx) {
  const seriesData = series.data?.() ?? [];
  const ctxMapBars = timeCtx?.mapBars ?? [];
  const { mapBars, useAdapter, logicalOffset } = resolveOverlayMapBars(seriesData, ctxMapBars);
  const timeAdapter = useAdapter ? (timeCtx?.timeAdapter ?? null) : null;
  const barSec = timeCtx?.barSec ?? 60;
  const lastReal = timeCtx?.lastRealChartTime ?? mapBars.at(-1)?.time;
  return { mapBars, useAdapter, logicalOffset, barSec, lastReal, timeAdapter };
}

/**
 * Build the per-frame time→pixel closure from a resolved mapping. Does NOT call series.data().
 * Uses the live chart.timeScale() each call so panning is reflected natively.
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {ReturnType<typeof resolveOverlayTimeMapping>} mapping
 * @returns {(t: number) => number | null}
 */
export function createOverlayTimeToXFromMapping(chart, mapping) {
  const { mapBars, logicalOffset, barSec, lastReal, timeAdapter } = mapping;
  const firstTime = mapBars[0]?.time;

  return (t) => {
    if (t == null || !Number.isFinite(Number(t))) return null;
    let time = Number(t);
    // Times before loaded history have no coordinate on the time scale; the
    // fallbacks below would extrapolate a bogus x (ghost overlays after day
    // jumps / short reloads). Clamp to the first loaded bar — extrapolating
    // into the FUTURE stays allowed (whitespace/extended overlays rely on it).
    if (firstTime != null && time < firstTime) time = firstTime;
    const ts = chart.timeScale();
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

/**
 * Backward-compatible wrapper: resolves the mapping and builds the closure in one call.
 * Per-frame callers should instead cache resolveOverlayTimeMapping and reuse it across pans.
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {{ mapBars?: object[], barSec?: number, lastRealChartTime?: number, timeAdapter?: object } | null} timeCtx
 */
export function createOverlayTimeToX(chart, series, timeCtx) {
  return createOverlayTimeToXFromMapping(chart, resolveOverlayTimeMapping(series, timeCtx));
}
