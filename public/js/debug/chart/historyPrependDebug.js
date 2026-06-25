import { chartDebug, chartDebugThrottle, isChartDebugEnabled } from "./index.js";
import { timeToLogical } from "../../chart/coords/timeScale.js";

/** @param {number | null | undefined} sec */
function fmtTime(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return String(sec);
  try {
    return new Date(Number(sec) * 1000).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });
  } catch {
    return String(sec);
  }
}

/** @param {object[] | null | undefined} bars */
function headTail(bars) {
  if (!bars?.length) return null;
  return {
    len: bars.length,
    head: bars[0]?.time ?? null,
    headEt: fmtTime(bars[0]?.time),
    tail: bars.at(-1)?.time ?? null,
    tailEt: fmtTime(bars.at(-1)?.time),
  };
}

/** @param {object[]} bars @param {number} t */
function indexForChartTime(bars, t, barSec = 60) {
  if (!bars?.length || t == null) return null;
  const logical = timeToLogical(bars, barSec, t);
  if (logical == null || !Number.isFinite(logical)) return null;
  return Math.round(logical);
}

/**
 * @param {object} pane
 * @param {string} phase
 * @param {object} [extra]
 */
export function logBarStackSnapshot(pane, phase, extra = {}) {
  const seriesData = pane.series?.data?.() ?? [];
  const view = pane._chartView;
  const mapBars = view?.mapBars ?? pane.mapBars ?? [];
  const snap = {
    phase,
    pane: pane.index,
    historyRestorePending: Boolean(pane._historyRestorePending),
    paneBars: headTail(pane.bars),
    viewUtc: headTail(view?.utcBars),
    viewChart: headTail(view?.chartBars),
    mapBars: headTail(mapBars),
    series: headTail(seriesData),
    lengths: {
      paneBars: pane.bars?.length ?? 0,
      viewUtc: view?.utcBars?.length ?? 0,
      mapBars: mapBars.length,
      series: seriesData.length,
    },
    ...extra,
  };

  const { paneBars: pb, viewUtc: vu, mapBars: mb, series: sr } = snap.lengths;
  const misalign =
    (vu > 0 && pb > 0 && vu !== pb) ||
    (vu > 0 && mb > 0 && vu !== mb) ||
    (vu > 0 && sr > 0 && vu !== sr) ||
    (sr > 0 && mb > 0 && sr !== mb);

  if (misalign) {
    const prefixOffset =
      sr > 0 && mb > 0 && mapBars[0]?.time != null
        ? seriesData.findIndex((b) => b.time === mapBars[0].time)
        : -1;
    snap.misalign = true;
    snap.seriesPrefixOffset = prefixOffset;
    console.warn("[BWC:prepend] BAR STACK MISALIGN", snap);
  }

  if (!isChartDebugEnabled()) return;
  chartDebug("prepend", phase, snap);
}

/**
 * @param {object} pane
 * @param {"hit" | "rebuild" | "keep-ahead"} reason
 * @param {object} detail
 */
export function logChartViewResolve(pane, reason, detail) {
  if (!isChartDebugEnabled()) return;
  chartDebugThrottle("prepend", `view-${reason}`, `getPaneChartView ${reason}`, {
    pane: pane.index,
    ...detail,
  }, 300);
}

/**
 * @param {object} pane
 * @param {string} indicatorId
 * @param {object[]} overlayItems
 * @param {object} timeCtx
 * @param {object} [opts]
 */
export function logOverlayIndexAudit(pane, indicatorId, overlayItems, timeCtx, opts = {}) {
  const mapBars = timeCtx?.mapBars ?? [];
  const seriesData = pane.series?.data?.() ?? [];
  const barSec = timeCtx?.barSec ?? pane._chartView?.barSec ?? 60;
  if (!overlayItems?.length || !mapBars.length) return;

  const sample = overlayItems
    .filter((item) => item.timeStart != null)
    .slice(0, 4)
    .map((item) => {
      const t = item.timeStart;
      const mapIdx = indexForChartTime(mapBars, t, barSec);
      const seriesIdx = seriesData.length ? indexForChartTime(seriesData, t, barSec) : null;
      const ts = pane.chart?.timeScale?.();
      let lwcX = null;
      let lwcLogical = null;
      try {
        if (ts?.timeToCoordinate) lwcX = ts.timeToCoordinate(t);
        if (ts?.logicalToCoordinate && mapIdx != null) lwcLogical = ts.logicalToCoordinate(mapIdx);
      } catch {
        /* chart not ready */
      }
      return {
        label: item.label ?? item.kind ?? "",
        price: item.priceStart ?? item.priceTop,
        timeStart: t,
        timeEt: fmtTime(t),
        mapIdx,
        seriesIdx,
        idxDelta: mapIdx != null && seriesIdx != null ? seriesIdx - mapIdx : null,
        lwcX,
        lwcLogicalX: lwcLogical,
        lwcXDelta: lwcX != null && lwcLogical != null ? lwcX - lwcLogical : null,
      };
    });

  const misIdx = sample.some((s) => s.idxDelta != null && Math.abs(s.idxDelta) >= 1);
  const misX = sample.some((s) => s.lwcXDelta != null && Math.abs(s.lwcXDelta) > 4);

  if (misIdx || misX || opts.force) {
    const payload = {
      indicatorId,
      cacheHit: opts.cacheHit ?? null,
      geometryUnchanged: opts.geometryUnchanged ?? null,
      mapLen: mapBars.length,
      seriesLen: seriesData.length,
      viewLen: pane._chartView?.utcBars?.length ?? 0,
      sample,
    };
    if (misIdx || misX) console.warn("[BWC:prepend] OVERLAY INDEX SHIFT", payload);
    if (isChartDebugEnabled()) chartDebug("prepend", `overlay-${indicatorId}`, payload);
  }
}

/**
 * @param {object} pane
 * @param {number} expectedLen
 * @returns {boolean} true when caller should fall back to full setData
 */
export function needsSeriesResyncAfterPrepend(pane, expectedLen) {
  const seriesLen = pane.series?.data?.()?.length ?? 0;
  if (!expectedLen || !seriesLen) return false;
  if (seriesLen === expectedLen) return false;

  const view = pane._chartView;
  const mapLen = view?.mapBars?.length ?? 0;
  logBarStackSnapshot(pane, "resync-needed", { expectedLen, seriesLen, mapLen });
  return true;
}
