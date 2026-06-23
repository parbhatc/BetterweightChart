import { getPaneChartView } from "./viewCache.js";
import { logicalToChartTime, timeToLogical } from "../coords/timeScale.js";
import { measurePriceBarRatio } from "../price/barRatio.js";
import { chartDebug } from "../../debug/chart/index.js";
import {
  refitPriceScaleToVisibleBars,
  priceRangeFromVisibleLogicalRange,
} from "../settings/applier.js";

/**
 * @param {object} ta
 * @param {{ time: number }[]} mapBars
 * @param {number} barSec
 * @param {number} logical
 */
function logicalToUtc(ta, mapBars, barSec, logical) {
  const chartTime = logicalToChartTime(mapBars, barSec, logical);
  if (chartTime == null || !Number.isFinite(chartTime)) return null;
  return ta.time.toUtc(chartTime);
}

/**
 * @param {object} pane
 * @param {number} realCount
 */
function viewportAnchorIndex(pane, realCount) {
  if (pane.replayCursorEndIndex != null && pane.replayCursorEndIndex >= 0) {
    return pane.replayCursorEndIndex + 1;
  }
  return pane.bars?.length ?? realCount;
}

/**
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 */
function capturePriceLayout(pane, settingsStore) {
  const chart = pane?.chart;
  const series = pane?.series;
  if (!chart || !series) return null;

  const paneH = chart.paneSize?.()?.height;
  if (!paneH || paneH <= 0) return null;

  const pTop = series.coordinateToPrice(0);
  const pBottom = series.coordinateToPrice(paneH);
  if (
    pTop == null ||
    pBottom == null ||
    !Number.isFinite(pTop) ||
    !Number.isFinite(pBottom)
  ) {
    return null;
  }

  const ps = series.priceScale();
  const { scaleMargins, autoScale } = ps.options();
  const sc = settingsStore.get().scales ?? {};
  const minPrice = Math.min(pTop, pBottom);
  const maxPrice = Math.max(pTop, pBottom);

  return {
    minPrice,
    maxPrice,
    visiblePriceRange: Math.abs(maxPrice - minPrice),
    scaleMargins: {
      top: scaleMargins?.top ?? 0.08,
      bottom: scaleMargins?.bottom ?? 0.12,
    },
    autoScale: autoScale !== false,
    lockPriceToBarRatio: Boolean(sc.lockPriceToBarRatio),
    priceBarRatio: measurePriceBarRatio(chart, series),
  };
}

/**
 * Refit price axis to visible bars using captured scale margins (not absolute prices).
 * @param {object} pane
 * @param {ReturnType<typeof capturePriceLayout>} priceLayout
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {() => "left" | "right"} activePriceScaleId
 */
function restorePriceLayout(pane, priceLayout, settingsStore, activePriceScaleId) {
  if (!priceLayout || !pane?.chart || !pane?.series) return null;

  const margins = priceLayout.scaleMargins;
  const lockAfter = !priceLayout.autoScale;

  refitPriceScaleToVisibleBars(pane, settingsStore, activePriceScaleId, {
    margins,
    lockAfter,
    onDone: () => {
      const logical = pane.chart.timeScale().getVisibleLogicalRange?.();
      const barRange = priceRangeFromVisibleLogicalRange(pane, logical);
      const paneH = pane.chart.paneSize?.()?.height;
      const pTop = pane.series.coordinateToPrice(0);
      const pBottom = paneH ? pane.series.coordinateToPrice(paneH) : null;
      const afterMin = pTop != null && pBottom != null ? Math.min(pTop, pBottom) : null;
      const afterMax = pTop != null && pBottom != null ? Math.max(pTop, pBottom) : null;

      chartDebug("data", "timeframe price layout", {
        mode: priceLayout.autoScale ? "refit-auto" : "refit-lock",
        scaleMargins: margins,
        barRange,
        rangeBefore: priceLayout.visiblePriceRange,
        minPriceBefore: priceLayout.minPrice,
        maxPriceBefore: priceLayout.maxPrice,
        minPriceAfter: afterMin,
        maxPriceAfter: afterMax,
        rangeAfter:
          afterMin != null && afterMax != null ? Math.abs(afterMax - afterMin) : null,
      });
    },
  });

  return {
    mode: priceLayout.autoScale ? "refit-auto" : "refit-lock",
    scaleMargins: margins,
    rangeBefore: priceLayout.visiblePriceRange,
    minPriceBefore: priceLayout.minPrice,
    maxPriceBefore: priceLayout.maxPrice,
  };
}

/**
 * Capture visible logical width + tail gap past latest bar (stable across timeframe changes).
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function captureViewportBarLayout(pane, settingsStore, resolutions) {
  const chart = pane?.chart;
  const ts = chart?.timeScale();
  const logical = ts?.getVisibleLogicalRange?.();
  if (!logical || !Number.isFinite(logical.from) || !Number.isFinite(logical.to)) return null;

  const view = getPaneChartView(pane, settingsStore, pane.symbolInfo ?? null, resolutions);
  const realCount = view.utcBars.length;
  if (!realCount) return null;

  const anchorIndex = viewportAnchorIndex(pane, realCount);
  const width = logical.to - logical.from;
  const toBeyondAnchor = logical.to - anchorIndex;
  const latestUtc = view.utcBars.at(-1)?.time ?? null;
  const visibleToUtc = logicalToUtc(view.timeAdapter, view.mapBars, view.barSec, logical.to);
  const visibleFromUtc = logicalToUtc(view.timeAdapter, view.mapBars, view.barSec, logical.from);
  const barsAfterLatest =
    latestUtc != null && visibleToUtc != null && view.barSec > 0
      ? Math.round((visibleToUtc - latestUtc) / view.barSec)
      : null;

  return {
    width,
    toBeyondAnchor,
    anchorIndex,
    realCount,
    logicalFrom: logical.from,
    logicalTo: logical.to,
    resolution: pane.resolution ?? null,
    barSec: view.barSec,
    latestUtc,
    visibleFromUtc,
    visibleToUtc,
    barsAfterLatest,
    rightOffset: ts.options?.().rightOffset ?? null,
    price: capturePriceLayout(pane, settingsStore),
  };
}

/**
 * Compute logical viewport range from a saved bar layout + replay cursor anchor.
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} layout
 */
export function computeViewportBarLayoutLogical(pane, layout) {
  const realCount = pane.bars?.length ?? 0;
  if (!layout || !realCount) return null;
  const anchorIndex = viewportAnchorIndex(pane, realCount);
  const to = anchorIndex + layout.toBeyondAnchor;
  return { from: to - layout.width, to };
}

/**
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} layout
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ id: string, sec?: number }[]} resolutions
 */
export function computeViewportLogicalFromUtc(pane, layout, settingsStore, resolutions) {
  if (!layout || !pane?.chart) return null;

  const { visibleFromUtc, visibleToUtc } = layout;
  if (visibleFromUtc == null || visibleToUtc == null) return null;

  const view = getPaneChartView(pane, settingsStore, pane.symbolInfo ?? null, resolutions);
  const mapBars = view.mapBars;
  const barSec = view.barSec;
  if (!mapBars?.length) return null;

  const from = timeToLogical(mapBars, barSec, visibleFromUtc);
  const to = timeToLogical(mapBars, barSec, visibleToUtc);
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to)) return null;

  return { from, to };
}

/**
 * Restore viewport using saved width + tail gap anchored to the new latest / replay cursor bar.
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} layout
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ id: string, sec?: number }[]} resolutions
 * @param {string} [reason]
 * @param {() => "left" | "right"} [activePriceScaleId]
 * @param {{ skipPrice?: boolean }} [opts]
 */
export function restoreViewportBarLayout(
  pane,
  layout,
  settingsStore,
  resolutions,
  reason = "timeframe",
  activePriceScaleId,
  opts = {},
) {
  if (!layout || !pane?.chart) return null;

  const ts = pane.chart.timeScale();
  getPaneChartView(pane, settingsStore, pane.symbolInfo ?? null, resolutions);
  const realCount = pane.bars?.length ?? 0;
  if (!realCount) return null;

  const anchorIndex = viewportAnchorIndex(pane, realCount);
  const to = anchorIndex + layout.toBeyondAnchor;
  const from = to - layout.width;

  ts.setVisibleLogicalRange({ from, to });

  const priceResult =
    !opts.skipPrice && layout.price
      ? restorePriceLayout(pane, layout.price, settingsStore, activePriceScaleId)
      : null;

  const view = getPaneChartView(pane, settingsStore, pane.symbolInfo ?? null, resolutions);
  const afterLogical = ts.getVisibleLogicalRange?.();
  const latestUtc = view.utcBars.at(-1)?.time ?? null;
  const visibleToUtc =
    afterLogical != null
      ? logicalToUtc(view.timeAdapter, view.mapBars, view.barSec, afterLogical.to)
      : null;
  const barsAfterLatest =
    latestUtc != null && visibleToUtc != null && view.barSec > 0
      ? Math.round((visibleToUtc - latestUtc) / view.barSec)
      : null;

  const result = {
    reason,
    fromResolution: layout.resolution,
    toResolution: pane.resolution ?? null,
    width: layout.width,
    toBeyondAnchor: layout.toBeyondAnchor,
    anchorIndex,
    restored: { from, to },
    afterLogical,
    barsAfterLatestBefore: layout.barsAfterLatest,
    barsAfterLatestAfter: barsAfterLatest,
    widthBefore: layout.width,
    widthAfter: afterLogical ? afterLogical.to - afterLogical.from : null,
    price: priceResult,
  };

  chartDebug("data", "timeframe viewport", result);
  return result;
}

/**
 * Restore viewport from a saved UTC time span (stable across timeframe changes during replay).
 * @param {object} pane
 * @param {ReturnType<typeof captureViewportBarLayout> | null | undefined} layout
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ id: string, sec?: number }[]} resolutions
 * @param {string} [reason]
 * @param {() => "left" | "right"} [activePriceScaleId]
 * @param {{ skipPrice?: boolean }} [opts]
 */
export function restoreViewportBarLayoutFromUtc(
  pane,
  layout,
  settingsStore,
  resolutions,
  reason = "timeframe-utc",
  activePriceScaleId,
  opts = {},
) {
  if (!layout || !pane?.chart) return null;

  const { visibleFromUtc, visibleToUtc } = layout;
  if (visibleFromUtc == null || visibleToUtc == null) return null;

  const view = getPaneChartView(pane, settingsStore, pane.symbolInfo ?? null, resolutions);
  const mapBars = view.mapBars;
  const barSec = view.barSec;
  if (!mapBars?.length) return null;

  const from = timeToLogical(mapBars, barSec, visibleFromUtc);
  const to = timeToLogical(mapBars, barSec, visibleToUtc);
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to)) return null;

  pane.chart.timeScale().setVisibleLogicalRange({ from, to });

  const priceResult =
    !opts.skipPrice && layout.price
      ? restorePriceLayout(pane, layout.price, settingsStore, activePriceScaleId)
      : null;

  const result = {
    reason,
    fromResolution: layout.resolution,
    toResolution: pane.resolution ?? null,
    visibleFromUtc,
    visibleToUtc,
    restored: { from, to },
    price: priceResult,
  };

  chartDebug("data", "timeframe viewport utc", result);
  return result;
}

/** @param {number | null | undefined} price @param {number} [digits] */
export function formatPriceLabel(price, digits = 2) {
  if (price == null || !Number.isFinite(price)) return null;
  return price.toFixed(digits);
}
