import { chartDebug } from "../../debug/chart/index.js";
import { invalidatePaneChartView } from "../../chart/pane/viewCache.js";

/** Keep bars warm after switching resolution or for another pane. */
export const RESOLUTION_CACHE_TTL_MS = 30_000;
/** Longer TTL while bar replay is active (interval switching). */
export const RESOLUTION_CACHE_REPLAY_TTL_MS = 60_000;

/** @type {boolean} */
let replayExtendedTtl = false;

/** @param {boolean} active */
export function setResolutionCacheReplayTtl(active) {
  replayExtendedTtl = Boolean(active);
}

function cacheTtlMs() {
  return replayExtendedTtl ? RESOLUTION_CACHE_REPLAY_TTL_MS : RESOLUTION_CACHE_TTL_MS;
}

/**
 * @typedef {{
 *   bars: object[],
 *   _historyExhausted: boolean,
 *   _firstDataRequest: boolean,
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
    entry.timer = setTimeout(() => evict(k, "ttl"), cacheTtlMs());
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
  const ttlMs = cacheTtlMs();
  if (entry.timer && ageMs > ttlMs) return null;
  return entry.snapshot.bars.slice();
}

/**
 * Publish loaded bars so other panes with the same symbol + interval can reuse them.
 * @param {object} pane
 */
export function publishResolutionCache(pane) {
  if (pane._replaySnapshot) return;
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

export function clearResolutionCache() {
  for (const entry of entries.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  entries.clear();
  chartDebug("data", "resolution cache clear all");
}

/**
 * Snapshot pane bars for a resolution before switching away (starts TTL eviction).
 * @param {object} pane
 * @param {string} resolution — interval being left (not the new one)
 */
export function stashPaneResolutionCache(pane, resolution) {
  if (pane._replaySnapshot) return;
  if (!pane.bars?.length || !pane.symbol || !resolution) return;

  const snapshot = snapshotFromPane(pane);
  if (!snapshot) return;

  putEntry(pane.symbol, resolution, snapshot, { ttl: true });
  chartDebug("data", "resolution cache stash", {
    pane: pane.index,
    symbol: pane.symbol,
    resolution,
    bars: snapshot.bars.length,
    ttlMs: cacheTtlMs(),
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
  const ttlMs = cacheTtlMs();
  if (entry.timer && ageMs > ttlMs) {
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
