import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { getHtfBars } from "../../app/bar/htfBarCache.js";

/** Unix second when an HTF bucket is fully closed (start of next bucket). */
export function htfBarCompleteAt(bucketOpen, tfSec) {
  return bucketOpen + tfSec;
}

/**
 * Prefer native HTF store over short pane/resampled lookups (replay ~62 15m bars vs 125+ in store).
 * @param {string} symbol
 * @param {string} resolution
 * @param {{ utcBars?: object[], chartBars?: object[], source?: string } | null | undefined} hit
 */
export function mergeWithHtfStore(symbol, resolution, hit) {
  const resId = normalizeResolutionId(resolution);
  if (!symbol || !resId) return hit ?? null;

  const stored = getHtfBars(symbol, resId);
  const hitLen = hit?.utcBars?.length ?? 0;
  const storedLen = stored?.utcBars?.length ?? 0;

  if (storedLen > 0 && (hitLen === 0 || storedLen >= hitLen)) {
    return {
      utcBars: stored.utcBars,
      chartBars: stored.chartBars ?? [],
      source: stored.source ?? "htf-store",
    };
  }
  if (hitLen > 0) {
    return {
      utcBars: hit.utcBars,
      chartBars: hit.chartBars ?? [],
      source: hit.source ?? "lookup",
    };
  }
  if (storedLen > 0) {
    return {
      utcBars: stored.utcBars,
      chartBars: stored.chartBars ?? [],
      source: stored.source ?? "htf-store",
    };
  }
  return null;
}

/** @param {object} ctx @param {string} [symbol] @param {string} resolution */
export function getSecuritySeries(ctx, symbol, resolution) {
  const sym = symbol ?? ctx.primarySymbol ?? ctx.symbol;
  const raw =
    ctx.getSecurityBars?.(sym, resolution) ??
    ctx.getBars?.(resolution) ??
    ctx.getHtfBars?.(resolution) ??
    null;
  if (!sym) return raw;
  return mergeWithHtfStore(sym, resolution, raw);
}

/** @param {object} ctx @param {string} [symbol] @param {string} resolution @param {number} countBack */
export function requestSecuritySeries(ctx, symbol, resolution, countBack) {
  ctx.requestSecurityBars?.(symbol, resolution, countBack);
  ctx.requestBars?.(resolution, countBack);
  ctx.requestHtfBars?.(resolution, countBack);
}

/** @param {{ utcBars: object[], chartBars?: object[] }} htf */
export function mapHtfBarsToSeries(htf) {
  return htf.utcBars.map((b, i) => ({
    ...b,
    sourceIndex: i,
    startSourceIndex: i,
    chartTime: htf.chartBars[i]?.time ?? b.time,
    confirmChartTime: htf.chartBars[i]?.time ?? b.time,
  }));
}
