// HTF access layer: indicators READ HTF series here (lookup + merge with the
// shared store + sufficiency check) and REQUEST more bars when short.
// Fetching/storing/replay-anchor handling lives in app/bar/htfBarCache.js.
import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { resolutionSec } from "/js/chart/resolutions.js";
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
 * Cap a bar series at the replay anchor. Without `tfSec`, keep buckets whose
 * OPEN is <= anchor (chart-resolution series: the bar at the anchor is the
 * current bar). With `tfSec` (true HTF series), keep only buckets fully CLOSED
 * at the anchor — a bucket that merely opened before the anchor carries
 * complete-bucket OHLC when it was fetched unanchored, which is future data.
 * The forming HTF bucket is rebuilt from chart bars on read (rebuildFormingBucket).
 * @param {{ utcBars?: object[], chartBars?: object[] } | null} hit
 * @param {number | null} anchorSec
 * @param {number | null} [tfSec] bucket length when the series is coarser than the chart
 */
export function sliceSeriesToAnchor(hit, anchorSec, tfSec = null) {
  const bars = hit?.utcBars;
  if (!bars?.length || anchorSec == null || !Number.isFinite(anchorSec)) return hit ?? null;
  const closeOffset = tfSec != null && Number.isFinite(tfSec) && tfSec > 0 ? tfSec : 0;
  const keep = (bar) => bar.time + closeOffset <= anchorSec;
  if (keep(bars.at(-1))) return hit;
  if (!keep(bars[0])) {
    return { ...hit, utcBars: [], chartBars: [] };
  }
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keep(bars[mid])) lo = mid;
    else hi = mid - 1;
  }
  return {
    ...hit,
    utcBars: bars.slice(0, lo + 1),
    chartBars: (hit.chartBars ?? []).slice(0, lo + 1),
  };
}

/** HTF bucket seconds when `resolution` is coarser than the ctx chart resolution, else null. */
export function htfTfSecForCtx(ctx, resolution) {
  const tfSec = resolutionSec(normalizeResolutionId(resolution) ?? resolution);
  const chartSec = resolutionSec(ctx?.chartResolution ?? "");
  if (tfSec == null || chartSec == null) return null;
  return tfSec > chartSec ? tfSec : null;
}

/**
 * Rebuild the forming HTF bucket from the pane's chart bars (Pine-style
 * lookahead-off + current forming values). The store holds only fully closed
 * buckets; this appends/overwrites the trailing bucket with chart-aggregated
 * OHLC flagged `isForming`. Applies only to the pane's own symbol — compare
 * symbols have no chart bars to aggregate from.
 * @param {{ utcBars: object[], chartBars?: object[] } | null} hit
 * @param {object} ctx overlay ctx (needs utcBars = pane chart bars, replay-capped)
 * @param {string | null | undefined} symbol series symbol
 * @param {number} tfSec HTF bucket seconds
 */
export function rebuildFormingBucket(hit, ctx, symbol, tfSec) {
  const utcBars = hit?.utcBars;
  const chartUtc = ctx?.utcBars;
  if (!utcBars || !tfSec || !chartUtc?.length) return hit ?? null;
  const primary = ctx.primarySymbol ?? ctx.symbol;
  if (symbol && primary && symbol !== primary) return hit;

  const chartTail = chartUtc.at(-1)?.time;
  if (chartTail == null) return hit;
  const bucketOpen = Math.floor(chartTail / tfSec) * tfSec;

  let open = null;
  let high = -Infinity;
  let low = Infinity;
  let close = null;
  let volume = 0;
  for (let i = chartUtc.length - 1; i >= 0; i--) {
    const b = chartUtc[i];
    if (b.time < bucketOpen) break;
    open = b.open;
    high = Math.max(high, b.high);
    low = Math.min(low, b.low);
    if (close == null) close = b.close;
    volume += b.volume ?? 0;
  }
  if (open == null) return hit;

  const forming = { time: bucketOpen, open, high, low, close, volume, isForming: true };
  // Drop any stored bars at/after the forming bucket (legacy partial entries),
  // then append the chart-derived forming bar.
  let end = utcBars.length;
  while (end > 0 && utcBars[end - 1].time >= bucketOpen) end -= 1;
  const chartBars =
    hit.chartBars?.length === utcBars.length ? hit.chartBars : utcBars;
  return {
    ...hit,
    utcBars: [...utcBars.slice(0, end), forming],
    chartBars: [...chartBars.slice(0, end), forming],
  };
}

/**
 * Arbitrate between a pane/lookup hit and the shared store by COVERAGE, not
 * length: the store (epoch-valid, tail-managed) wins when it covers the hit's
 * time window; otherwise the hit wins. The forming bucket is ignored for
 * coverage — it is rebuilt from chart bars on read.
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

  const storedWrapped =
    storedLen > 0
      ? {
          utcBars: stored.utcBars,
          chartBars: stored.chartBars ?? [],
          source: stored.source ?? "htf-store",
        }
      : null;
  const hitWrapped =
    hitLen > 0
      ? {
          utcBars: hit.utcBars,
          chartBars: hit.chartBars ?? [],
          source: hit.source ?? "lookup",
        }
      : null;

  if (!storedWrapped) return hitWrapped;
  if (!hitWrapped) return storedWrapped;

  const tfSec = resolutionSec(resId) ?? 0;
  const storedFirst = stored.utcBars[0].time;
  const storedLast = stored.utcBars.at(-1).time;
  const hitFirst = hit.utcBars[0].time;
  const hitLast = hit.utcBars.at(-1).time;
  // Allow the hit's trailing (forming) bucket to be missing from the store.
  const coversHit = storedFirst <= hitFirst && storedLast + tfSec >= hitLast;
  return coversHit ? storedWrapped : hitWrapped;
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
  const htfSec = htfTfSecForCtx(ctx, resolution);
  const sliced = sliceSeriesToAnchor(merged, ctxPlaybackAnchorSec(ctx), htfSec);
  return htfSec != null ? rebuildFormingBucket(sliced, ctx, sym, htfSec) : sliced;
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
  const resId = normalizeResolutionId(tfId) ?? tfId;
  const stored = sym ? getHtfBars(sym, resId) : null;
  const exhausted = Boolean(stored?.historyExhausted && stored.utcBars?.length > 0);
  const raw = ctx.lookupSecurity?.(sym, tfId, need) ?? getSecuritySeries(ctx, sym, tfId);
  // Pane lookups vs shared store: arbitrated by coverage, not length.
  const merged = sym ? mergeWithHtfStore(sym, resId, raw) : raw;
  const anchorSec = ctxPlaybackAnchorSec(ctx);
  const htfSec = htfTfSecForCtx(ctx, tfId);
  const sliced = sliceSeriesToAnchor(merged, anchorSec, htfSec);
  const hit = htfSec != null ? rebuildFormingBucket(sliced, ctx, sym, htfSec) : sliced;
  const utcBars = hit?.utcBars ?? [];
  const chartBars = hit?.chartBars ?? [];

  // Tail staleness (live + replay): the newest CLOSED bucket implied by the
  // read cap must be present, or the series needs a tail top-up even when the
  // bar count looks sufficient.
  let tailStale = false;
  if (htfSec != null && utcBars.length) {
    const cap = anchorSec ?? ctx.utcBars?.at(-1)?.time ?? null;
    if (cap != null) {
      const newestClosedOpen = Math.floor(cap / htfSec) * htfSec - htfSec;
      let lastConfirmedOpen = null;
      for (let i = utcBars.length - 1; i >= 0; i--) {
        if (!utcBars[i].isForming) {
          lastConfirmedOpen = utcBars[i].time;
          break;
        }
      }
      tailStale = lastConfirmedOpen != null && lastConfirmedOpen < newestClosedOpen;
    }
  }

  const pending = (utcBars.length < need && !exhausted) || tailStale;
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
