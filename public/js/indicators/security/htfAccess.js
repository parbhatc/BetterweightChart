// HTF access layer: indicators READ HTF series here (lookup + merge with the
// shared store + sufficiency check) and REQUEST more bars when short.
// Fetching/storing/replay-anchor handling lives in app/bar/htfBarCache.js.
import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { getHtfBars } from "../../app/bar/htfBarCache.js";

/** Unix second when an HTF bucket is fully closed (start of next bucket). */
export function htfBarCompleteAt(bucketOpen, tfSec) {
  return bucketOpen + tfSec;
}

/** Replay anchor (chart cursor, unix sec) for this overlay ctx, or null when not replaying. */
export function ctxPlaybackAnchorSec(ctx) {
  const a =
    typeof ctx?.getPlaybackAnchorSec === "function"
      ? ctx.getPlaybackAnchorSec(ctx.chartResolution ?? "")
      : null;
  return a != null && Number.isFinite(a) ? a : null;
}

/**
 * Cap a bar series at the replay anchor: keep buckets whose OPEN is <= anchor
 * (the forming bucket stays; strictly-future buckets are dropped). The shared
 * store is append-only and cursor-blind — this read-time slice is what keeps
 * indicators from seeing bars past the replay cursor after backward jumps.
 * @param {{ utcBars?: object[], chartBars?: object[] } | null} hit
 * @param {number | null} anchorSec
 */
export function sliceSeriesToAnchor(hit, anchorSec) {
  const bars = hit?.utcBars;
  if (!bars?.length || anchorSec == null || !Number.isFinite(anchorSec)) return hit ?? null;
  if (bars.at(-1).time <= anchorSec) return hit;
  if (bars[0].time > anchorSec) {
    return { ...hit, utcBars: [], chartBars: [] };
  }
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].time <= anchorSec) lo = mid;
    else hi = mid - 1;
  }
  return {
    ...hit,
    utcBars: bars.slice(0, lo + 1),
    chartBars: (hit.chartBars ?? []).slice(0, lo + 1),
  };
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
  const merged = sym ? mergeWithHtfStore(sym, resolution, raw) : raw;
  return sliceSeriesToAnchor(merged, ctxPlaybackAnchorSec(ctx));
}

/** @param {object} ctx @param {string} [symbol] @param {string} resolution @param {number} countBack */
export function requestSecuritySeries(ctx, symbol, resolution, countBack) {
  ctx.requestSecurityBars?.(symbol, resolution, countBack);
  ctx.requestBars?.(resolution, countBack);
  ctx.requestHtfBars?.(resolution, countBack);
}

/**
 * Single entry point for indicator HTF reads: lookup + merge with the shared
 * store + sufficiency check, firing a fetch request when short and not exhausted.
 * @param {object} ctx
 * @param {string} [symbol]
 * @param {string} tfId
 * @param {number} want bars needed
 * @param {{ request?: boolean }} [opts] request=false suppresses the fetch request (pure read)
 * @returns {{ utcBars: object[], chartBars: object[], source: string, pending: boolean, exhausted: boolean }}
 */
export function resolveHtfSeries(ctx, symbol, tfId, want, opts = {}) {
  const need = Math.max(10, Number(want) || 300);
  const sym = symbol ?? ctx.primarySymbol ?? ctx.symbol;
  const stored = sym ? getHtfBars(sym, normalizeResolutionId(tfId) ?? tfId) : null;
  const exhausted = Boolean(stored?.historyExhausted && stored.utcBars?.length > 0);
  const raw = ctx.lookupSecurity?.(sym, tfId, need) ?? getSecuritySeries(ctx, sym, tfId);
  // Pane lookups can be shorter than the shared store — always take the longer.
  const merged = sym ? mergeWithHtfStore(sym, normalizeResolutionId(tfId) ?? tfId, raw) : raw;
  const hit = sliceSeriesToAnchor(merged, ctxPlaybackAnchorSec(ctx));
  const utcBars = hit?.utcBars ?? [];
  const chartBars = hit?.chartBars ?? [];
  const pending = utcBars.length < need && !exhausted;
  if (pending && opts.request !== false) requestSecuritySeries(ctx, sym, tfId, need);
  return { utcBars, chartBars, source: hit?.source ?? "", pending, exhausted };
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
