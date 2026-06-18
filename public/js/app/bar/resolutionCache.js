import { chartDebug } from "../../debug/chart/index.js";
import { invalidatePaneChartView } from "../../chart/pane/viewCache.js";

/** Keep bars warm after switching resolution or for another pane. */
export const RESOLUTION_CACHE_TTL_MS = 10_000;

/**
 * @typedef {{
 *   bars: object[],
 *   _historyExhausted: boolean,
 *   _firstDataRequest: boolean,
 *   futureWhitespaceBars: number | null,
 * }} ResolutionSnapshot
 */

/**
 * @typedef {{
 *   snapshot: ResolutionSnapshot,
 *   updatedAt: number,
 *   timer: ReturnType<typeof setTimeout> | null,
 * }} CacheEntry
 */

/** @type {Map<string, CacheEntry>} */
const entries = new Map();

/**
 * @param {string} symbol
 * @param {string} resolution
 */
export function seriesCacheKey(symbol, resolution) {
  return `${symbol}|${resolution}`;
}

/**
 * @param {object} pane
 * @returns {ResolutionSnapshot | null}
 */
function snapshotFromPane(pane) {
  if (!pane.bars?.length) return null;
  return {
    bars: pane.bars.slice(),
    _historyExhausted: Boolean(pane._historyExhausted),
    _firstDataRequest: pane._firstDataRequest !== false,
    futureWhitespaceBars: pane.futureWhitespaceBars ?? null,
  };
}

/**
 * @param {object} pane
 * @param {ResolutionSnapshot} snapshot
 */
function applySnapshotToPane(pane, snapshot) {
  pane.bars = snapshot.bars.slice();
  pane._historyExhausted = snapshot._historyExhausted;
  pane._firstDataRequest = snapshot._firstDataRequest;
  pane.futureWhitespaceBars = snapshot.futureWhitespaceBars;
  invalidatePaneChartView(pane);
}

/**
 * @param {string} k
 * @param {"ttl" | "expired"} reason
 */
function evict(k, reason) {
  const entry = entries.get(k);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entries.delete(k);
  const [symbol, resolution] = k.split("|");
  chartDebug("data", "resolution cache evict", {
    symbol,
    resolution,
    reason,
    bars: entry.snapshot.bars.length,
  });
}

/**
 * @param {string} symbol
 * @param {string} resolution
 * @param {ResolutionSnapshot} snapshot
 * @param {{ ttl?: boolean }} [opts]
 */
function putEntry(symbol, resolution, snapshot, opts = {}) {
  const k = seriesCacheKey(symbol, resolution);
  const prev = entries.get(k);
  if (prev?.timer) clearTimeout(prev.timer);

  const entry = {
    snapshot,
    updatedAt: Date.now(),
    timer: null,
  };

  if (opts.ttl) {
    entry.timer = setTimeout(() => evict(k, "ttl"), RESOLUTION_CACHE_TTL_MS);
  }

  entries.set(k, entry);
}

/**
 * Read published bars for symbol+resolution (e.g. reuse 15m if user switched from 15m chart).
 * @param {string} symbol
 * @param {string} resolution
 * @returns {object[] | null}
 */
export function getResolutionCacheBars(symbol, resolution) {
  const entry = entries.get(seriesCacheKey(symbol, resolution));
  if (!entry) return null;
  const ageMs = Date.now() - entry.updatedAt;
  if (entry.timer && ageMs > RESOLUTION_CACHE_TTL_MS) return null;
  return entry.snapshot.bars.slice();
}

/**
 * Publish loaded bars so other panes with the same symbol + interval can reuse them.
 * @param {object} pane
 */
export function publishResolutionCache(pane) {
  const snapshot = snapshotFromPane(pane);
  if (!snapshot || !pane.symbol || !pane.resolution) return;

  putEntry(pane.symbol, pane.resolution, snapshot, { ttl: false });
  chartDebug("data", "resolution cache publish", {
    pane: pane.index,
    symbol: pane.symbol,
    resolution: pane.resolution,
    bars: snapshot.bars.length,
  });
}

/**
 * Snapshot pane bars for a resolution before switching away (starts TTL eviction).
 * @param {object} pane
 * @param {string} resolution — interval being left (not the new one)
 */
export function stashPaneResolutionCache(pane, resolution) {
  if (!pane.bars?.length || !pane.symbol || !resolution) return;

  const snapshot = snapshotFromPane(pane);
  if (!snapshot) return;

  putEntry(pane.symbol, resolution, snapshot, { ttl: true });
  chartDebug("data", "resolution cache stash", {
    pane: pane.index,
    symbol: pane.symbol,
    resolution,
    bars: snapshot.bars.length,
    ttlMs: RESOLUTION_CACHE_TTL_MS,
  });
}

/**
 * Restore pane bars from the shared cache when switching back or opening another pane.
 * @param {object} pane
 * @returns {boolean}
 */
export function tryRestorePaneResolutionCache(pane) {
  if (!pane.symbol || !pane.resolution) return false;

  const k = seriesCacheKey(pane.symbol, pane.resolution);
  const entry = entries.get(k);
  if (!entry) return false;

  const ageMs = Date.now() - entry.updatedAt;
  if (entry.timer && ageMs > RESOLUTION_CACHE_TTL_MS) {
    evict(k, "expired");
    return false;
  }

  applySnapshotToPane(pane, entry.snapshot);
  chartDebug("data", "resolution cache hit", {
    pane: pane.index,
    symbol: pane.symbol,
    resolution: pane.resolution,
    bars: pane.bars.length,
    ageMs,
    shared: true,
  });
  return true;
}
