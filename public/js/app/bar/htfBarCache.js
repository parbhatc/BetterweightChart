// HTF bar cache: FETCHES and STORES higher-timeframe series and handles
// replay-anchor extension. Indicators read/merge/request through
// indicators/security/htfAccess.js (resolveHtfSeries) — not this module directly.
import { chartDebug } from "../../debug/chart/index.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { buildInitialPeriodParams, buildPrependPeriodParams, buildTvPeriodParams, alignBarTime } from "./periodParams.js";
import { lookupSymbolBars } from "./symbolBarCache.js";

/** @typedef {{ utcBars: object[], chartBars: object[], historyExhausted: boolean, updatedAt: number, source?: string, epoch: number, version: number }} HtfBarEntry */

/** @type {Map<string, HtfBarEntry>} */
const store = new Map();
/** @type {Map<string, Promise<HtfBarEntry | null>>} */
const inFlight = new Map();

// ---------------------------------------------------------------------------
// Data epoch: every entry is stamped with the epoch it was written in. Bumping
// the epoch (symbol change, TF change, replay enter/exit, replay rewind)
// invalidates the whole store lazily — stale-epoch entries read as null and
// async fetch completions from an older epoch are dropped instead of stored.
// ---------------------------------------------------------------------------
let dataEpoch = 0;
let versionCounter = 0;
/** @type {Map<string, number>} last seen replay anchor per resolution (rewind detection) */
const lastAnchorByRes = new Map();

export function getDataEpoch() {
  return dataEpoch;
}

/** @param {string} [reason] */
export function bumpDataEpoch(reason = "") {
  dataEpoch += 1;
  lastAnchorByRes.clear();
  chartDebug("data", "htf data epoch bump", { epoch: dataEpoch, reason });
  return dataEpoch;
}

/**
 * Track the replay anchor; a backward move (rewind / jump back) bumps the
 * epoch so anchored fetches made at a later cursor cannot leak future data.
 * @param {string} resolution
 * @param {number} anchorSec
 */
export function noteReplayAnchor(resolution, anchorSec) {
  if (!resolution || anchorSec == null || !Number.isFinite(anchorSec)) return;
  const prev = lastAnchorByRes.get(resolution);
  if (prev != null && anchorSec < prev) {
    bumpDataEpoch("replay-rewind");
  }
  lastAnchorByRes.set(resolution, anchorSec);
}

/** Stamp + version an entry and publish it. @param {string} key @param {HtfBarEntry} entry */
function putHtfEntry(key, entry) {
  entry.epoch = dataEpoch;
  entry.version = ++versionCounter;
  store.set(key, entry);
  return entry;
}

/** @param {string} symbol @param {string} resolution */
export function htfCacheKey(symbol, resolution) {
  return `${symbol}|${resolution}`;
}

/** @param {string} symbol @param {string} resolution @returns {HtfBarEntry | null} */
export function getHtfBars(symbol, resolution) {
  if (!symbol || !resolution) return null;
  const key = htfCacheKey(symbol, resolution);
  const entry = store.get(key) ?? null;
  if (entry && entry.epoch !== dataEpoch) {
    store.delete(key);
    return null;
  }
  return entry;
}

/** Store mutation counter for symbol+resolution — 0 when absent. Recompute keys use this. */
export function getHtfSeriesVersion(symbol, resolution) {
  return getHtfBars(symbol, resolution)?.version ?? 0;
}

/**
 * Drop trailing bars whose bucket is not fully closed at `capSec`.
 * @param {object[]} bars @param {number} barSec @param {number} capSec
 */
function dropUnclosedTail(bars, barSec, capSec) {
  if (!bars?.length || !barSec || capSec == null) return bars ?? [];
  let end = bars.length;
  while (end > 0 && bars[end - 1].time + barSec > capSec) end -= 1;
  return end === bars.length ? bars : bars.slice(0, end);
}

/**
 * Merge paired utc/chart records: incoming replaces the covered time range,
 * existing records survive only outside [incoming head, incoming tail].
 * @param {{ utc: object, chart: object }[]} existing
 * @param {{ utc: object, chart: object }[]} incoming
 */
function mergeRecordsReplacingRange(existing, incoming) {
  if (!incoming?.length) return existing ?? [];
  if (!existing?.length) return incoming;
  const first = incoming[0].utc.time;
  const last = incoming.at(-1).utc.time;
  const head = existing.filter((r) => r.utc.time < first);
  const tail = existing.filter((r) => r.utc.time > last);
  return [...head, ...incoming, ...tail];
}

/** @param {object[]} utcBars @param {object[]} [chartBars] */
function toRecords(utcBars, chartBars) {
  return (utcBars ?? []).map((b, i) => ({ utc: b, chart: chartBars?.[i] ?? b }));
}

/**
 * HTF cache fetched at an earlier replay anchor may end before buckets needed now
 * (e.g. 9:15 15m bar cached at 9:29 — 9:30 bucket missing until anchor passes 9:45).
 * @param {string} symbol
 * @param {string} resolution
 * @param {number} anchorSec replay playback anchor (or live chart tail, 1m UTC)
 * @param {{ confirmedOnly?: boolean }} [opts] confirmedOnly: the store holds only fully
 *   closed buckets (true HTF series) — stale only when a NEWER CLOSED bucket exists,
 *   so extension fires once per bucket boundary, not on every anchor step.
 */
export function htfCacheStaleForAnchor(symbol, resolution, anchorSec, opts = {}) {
  const tfSec = resolutionSec(resolution);
  if (!symbol || !resolution || anchorSec == null || !tfSec) return false;
  const entry = getHtfBars(symbol, resolution);
  if (!entry?.utcBars?.length) return false;
  const lastOpen = entry.utcBars.at(-1)?.time;
  if (lastOpen == null) return false;
  const anchorOpen = alignBarTime(anchorSec, tfSec);
  if (opts.confirmedOnly) {
    // Newest closed bucket open: bucket [o, o+tf) is closed iff o+tf <= anchor.
    return lastOpen < anchorOpen - tfSec;
  }
  // Chart-resolution series (compare bars): the bucket at the anchor is the current bar.
  return lastOpen < anchorOpen;
}

/**
 * Append only missing HTF tail bars for replay anchor (few bars, not countBack=1000).
 * @param {object} opts
 * @param {import("../../datafeed/types.js").Datafeed} opts.datafeed
 * @param {object} opts.symbolInfo
 * @param {string} opts.symbol
 * @param {string} opts.resolution
 * @param {number} opts.anchorSec
 */
export async function extendHtfCacheForAnchor(opts) {
  const { datafeed, symbolInfo, symbol, resolution, anchorSec } = opts;
  const tfSec = resolutionSec(resolution);
  if (!datafeed || !symbolInfo || !symbol || !resolution || anchorSec == null || !tfSec) {
    return getHtfBars(symbol, resolution);
  }
  const chartSec = resolutionSec(opts.pane?.resolution ?? "") ?? null;
  const confirmedOnly = chartSec != null && tfSec > chartSec;
  if (!htfCacheStaleForAnchor(symbol, resolution, anchorSec, { confirmedOnly })) {
    return getHtfBars(symbol, resolution);
  }

  const key = htfCacheKey(symbol, resolution);
  const flightKey = `${key}|extend`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const startEpoch = dataEpoch;
  const task = (async () => {
    const entry = getHtfBars(symbol, resolution);
    const lastOpen = entry?.utcBars?.at(-1)?.time ?? null;
    const anchorOpen = alignBarTime(anchorSec, tfSec);
    const gapBars =
      lastOpen == null ? 4 : Math.max(2, Math.ceil((anchorOpen - lastOpen) / tfSec) + 2);
    const countBack = Math.min(16, gapBars);

    const params = buildTvPeriodParams({
      barSec: tfSec,
      countBack,
      to: anchorSec,
      firstDataRequest: false,
    });
    chartDebug("data", "htf cache extend anchor", {
      symbol,
      resolution,
      anchorSec,
      countBack,
      lastOpen,
    });

    const result = await datafeed.getBars(symbolInfo, resolution, params);
    // Stale epoch (symbol/TF/replay changed while fetching): drop the result.
    if (startEpoch !== dataEpoch) return getHtfBars(symbol, resolution);
    let fetched = result.bars ?? [];
    // Never store a partially formed HTF bucket as a confirmed bar — the
    // forming bucket is rebuilt on read from chart bars (htfAccess).
    if (confirmedOnly) fetched = dropUnclosedTail(fetched, tfSec, anchorSec);
    if (!fetched.length) return entry ?? null;

    const base = entry?.utcBars ?? [];
    const byTime = new Map(base.map((b) => [b.time, b]));
    for (const bar of fetched) {
      if (lastOpen != null && bar.time < lastOpen) continue;
      byTime.set(bar.time, bar);
    }
    const merged = [...byTime.values()].sort((a, b) => a.time - b.time);
    if (!merged.length) return entry ?? null;
    // Same length can still mean the last (previously partial) bucket got finalized OHLC.
    const prevLast = base.at(-1);
    const nextLast = merged.at(-1);
    const lastUnchanged =
      prevLast &&
      nextLast &&
      prevLast.time === nextLast.time &&
      prevLast.high === nextLast.high &&
      prevLast.low === nextLast.low &&
      prevLast.close === nextLast.close;
    if (entry && merged.length === base.length && lastUnchanged) return entry;

    const next = putHtfEntry(key, {
      utcBars: merged,
      chartBars: merged,
      historyExhausted: entry?.historyExhausted ?? false,
      updatedAt: Date.now(),
      source: entry?.source ?? "datafeed",
    });
    chartDebug("data", "htf cache extended", {
      symbol,
      resolution,
      bars: merged.length,
      added: merged.length - base.length,
      last: merged.at(-1)?.time,
    });
    return next;
  })().finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, task);
  return task;
}

/**
 * Publish bars into the shared HTF store (from pane / resolution cache / another indicator).
 * @param {string} symbol
 * @param {string} resolution
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {string} [source]
 */
export function seedHtfBars(symbol, resolution, utcBars, chartBars, source = "seed") {
  if (!symbol || !resolution || !utcBars?.length) return null;
  const key = htfCacheKey(symbol, resolution);
  const existing = getHtfBars(symbol, resolution);

  // Incoming bars replace their covered time range; existing bars survive only
  // outside it. No length-based arbitration — a fresh seed always wins its window.
  const merged = mergeRecordsReplacingRange(
    toRecords(existing?.utcBars, existing?.chartBars),
    toRecords(utcBars, chartBars?.length === utcBars.length ? chartBars : null),
  );

  const prev = existing;
  const nextUtc = merged.map((r) => r.utc);
  if (
    prev &&
    prev.utcBars.length === nextUtc.length &&
    prev.utcBars[0]?.time === nextUtc[0]?.time &&
    barsShallowEqual(prev.utcBars.at(-1), nextUtc.at(-1))
  ) {
    // No visible change — keep the entry (and its version) stable.
    return prev;
  }

  const entry = putHtfEntry(key, {
    utcBars: nextUtc,
    chartBars: merged.map((r) => r.chart),
    historyExhausted: existing?.historyExhausted ?? false,
    updatedAt: Date.now(),
    source,
  });
  chartDebug("data", "htf cache seed", { symbol, resolution, source, bars: entry.utcBars.length });
  return entry;
}

/** @param {object | undefined} a @param {object | undefined} b */
function barsShallowEqual(a, b) {
  return (
    !!a &&
    !!b &&
    a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close
  );
}

/**
 * @param {object} opts
 * @param {import("../../datafeed/types.js").Datafeed} opts.datafeed
 * @param {object} opts.symbolInfo
 * @param {string} opts.symbol
 * @param {string} opts.resolution HTF id e.g. "15"
 * @param {number} opts.countBack bars needed on HTF series
 * @param {object} opts.pane chart pane (timezone)
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} opts.settingsStore
 * @param {object | null} [opts.symbolInfoExtra]
 */
/** @param {object} opts @param {number} want */
function lookupBarsForEnsure(opts, want) {
  const hit = lookupSymbolBars({
    symbol: opts.symbol,
    resolution: opts.resolution,
    pane: opts.pane,
    getAllChartPanes: opts.getAllChartPanes,
    settingsStore: opts.settingsStore,
    symbolInfoExtra: opts.symbolInfoExtra,
    resolutions: opts.resolutions ?? [],
  });
  if (!hit?.utcBars?.length) return null;
  return { ...hit, sufficient: hit.utcBars.length >= want };
}

export async function ensureHtfBars(opts) {
  const { datafeed, symbolInfo, symbol, resolution, countBack, pane, settingsStore, symbolInfoExtra } =
    opts;
  const key = htfCacheKey(symbol, resolution);
  // Keep this aligned with periodParams.COUNT_BACK_MAX. Indicators can
  // legitimately need 3,000-4,000 bars; capping the first fetch at 2,000
  // forced a long chain of 200-bar prepend requests on every fresh boot.
  const want = Math.max(50, Math.min(4000, Number(countBack) || 300));
  const anchorSec = opts.playbackAnchorSec;
  const tfSec = resolutionSec(resolution);
  const chartSec = resolutionSec(pane?.resolution ?? "") ?? null;
  const confirmedOnly = tfSec != null && chartSec != null && tfSec > chartSec;
  // Tail cap: replay anchor, or (live mode) the newest chart bar — so a store
  // that ends before the newest closed HTF bucket is extended, not trusted.
  const tailCap =
    anchorSec != null && Number.isFinite(anchorSec)
      ? anchorSec
      : pane?.bars?.length
        ? pane.bars.at(-1).time
        : null;

  if (tailCap != null && htfCacheStaleForAnchor(symbol, resolution, tailCap, { confirmedOnly })) {
    const symInfo = symbolInfo ?? pane?.symbolInfo ?? symbolInfoExtra;
    if (symInfo) {
      await extendHtfCacheForAnchor({ ...opts, anchorSec: tailCap, symbolInfo: symInfo });
    }
  }

  const cached = lookupBarsForEnsure(opts, want);
  if (cached?.sufficient) {
    return seedHtfBars(symbol, resolution, cached.utcBars, cached.chartBars, cached.source);
  }

  let existing = getHtfBars(symbol, resolution);
  const tailFresh =
    tailCap == null || !htfCacheStaleForAnchor(symbol, resolution, tailCap, { confirmedOnly });
  // ponytail: replay anchor caps HTF depth — never chase countBack=1000 on every step
  if (anchorSec != null && existing?.utcBars?.length && tailFresh) {
    return existing;
  }
  if (existing && existing.utcBars.length >= want && !existing.historyExhausted && tailFresh) {
    return existing;
  }

  let pending = inFlight.get(key);
  if (pending) return pending;

  pending = fetchHtfBars({
    datafeed,
    symbolInfo,
    symbol,
    resolution,
    want,
    pane,
    settingsStore,
    symbolInfoExtra,
    existing,
    playbackAnchorSec: anchorSec,
    getAllChartPanes: opts.getAllChartPanes,
    resolutions: opts.resolutions,
  }).finally(() => inFlight.delete(key));

  inFlight.set(key, pending);
  return pending;
}

/**
 * @param {object} opts
 * @param {HtfBarEntry | undefined} opts.existing
 */
async function fetchHtfBars(opts) {
  const {
    datafeed,
    symbolInfo,
    symbol,
    resolution,
    want,
    pane,
    settingsStore,
    symbolInfoExtra,
    existing,
  } = opts;
  const key = htfCacheKey(symbol, resolution);
  const barSec = resolutionSec(resolution);
  const chartSec = resolutionSec(pane?.resolution ?? "") ?? null;
  const confirmedOnly = barSec != null && chartSec != null && barSec > chartSec;
  const startEpoch = dataEpoch;

  let cacheSource = "datafeed";
  const warmed = lookupBarsForEnsure(
    {
      symbol,
      resolution,
      pane,
      settingsStore,
      symbolInfoExtra,
      getAllChartPanes: opts.getAllChartPanes,
      resolutions: opts.resolutions,
    },
    want,
  );

  /** @type {object[]} */
  let utcBars = warmed?.utcBars?.length ? warmed.utcBars.slice() : [];

  if (!utcBars.length) {
    const partial = lookupBarsForEnsure(
      {
        symbol,
        resolution,
        pane,
        settingsStore,
        symbolInfoExtra,
        getAllChartPanes: opts.getAllChartPanes,
        resolutions: opts.resolutions,
      },
      0,
    );
    if (partial?.utcBars?.length) {
      utcBars = partial.utcBars.slice();
      cacheSource = partial.source;
      chartDebug("data", "htf cache from request.security", {
        symbol,
        resolution,
        source: partial.source,
        bars: utcBars.length,
      });
    }
  } else {
    cacheSource = warmed.source;
  }

  if (utcBars.length < want) {
    if (!symbolInfo) return existing ?? null;
    const playbackAnchorSec = opts.playbackAnchorSec;
    const to =
      playbackAnchorSec != null && Number.isFinite(playbackAnchorSec)
        ? playbackAnchorSec
        : pane.bars?.length > 0
          ? alignBarTime(pane.bars.at(-1).time, barSec)
          : alignBarTime(Date.now() / 1000, barSec);
    // Coarser live timeframes include the currently-forming bucket in history.
    // We drop that bucket below, so request one extra bar; otherwise a request
    // for 2000 repeatedly stores 1999 and immediately refetches forever.
    const fetchCount = Math.min(4000, confirmedOnly ? want + 1 : want);
    const params = buildInitialPeriodParams(barSec, fetchCount);
    params.to = to;
    chartDebug("data", "htf cache fetch", { symbol, resolution, countBack: want, to: params.to });
    const result = await datafeed.getBars(symbolInfo, resolution, params);
    // Stale epoch (symbol/TF/replay changed while fetching): drop the result.
    if (startEpoch !== dataEpoch) return getHtfBars(symbol, resolution);
    let fetched = result.bars ?? [];
    // Never store a partially formed HTF bucket as confirmed — it's rebuilt on read.
    if (confirmedOnly) fetched = dropUnclosedTail(fetched, barSec, to);
    if (fetched.length) {
      // Fresh native fetch replaces its covered range; lookup bars survive outside it.
      utcBars = mergeRecordsReplacingRange(toRecords(utcBars), toRecords(fetched)).map(
        (r) => r.utc,
      );
      cacheSource = "datafeed";
    }
  }

  if (startEpoch !== dataEpoch) return getHtfBars(symbol, resolution);
  if (!utcBars.length) return existing ?? null;

  // Same-epoch fresh data replaces the covered range of the existing entry —
  // no length-based "never shrink" arbitration.
  const currentExisting = getHtfBars(symbol, resolution);
  const merged = mergeRecordsReplacingRange(
    toRecords(currentExisting?.utcBars, currentExisting?.chartBars),
    toRecords(utcBars),
  );

  const entry = putHtfEntry(key, {
    utcBars: merged.map((r) => r.utc),
    chartBars: merged.map((r) => r.chart),
    // A short fetch is NOT exhaustion — wall-clock `from` over gaps/weekends can
    // return fewer bars than wanted, and an anchored fetch only caps the tail.
    // prependHtfBars is the sole authority for true exhaustion (noData / no older bars);
    // marking anchored fetches exhausted permanently blocked history refills after rewinds.
    historyExhausted: currentExisting?.historyExhausted ?? false,
    updatedAt: Date.now(),
    source: cacheSource,
  });
  chartDebug("data", "htf cache store", { symbol, resolution, bars: entry.utcBars.length });
  return entry;
}

/**
 * Prepend older HTF bars when an overlay study needs more HTF history.
 * @param {object} opts
 */
export async function prependHtfBars(opts) {
  const { datafeed, symbolInfo, symbol, resolution, countBack, pane, settingsStore, symbolInfoExtra } =
    opts;
  const key = htfCacheKey(symbol, resolution);
  const entry = getHtfBars(symbol, resolution);
  if (!entry || entry.historyExhausted || !entry.utcBars.length) return entry ?? null;

  const startEpoch = dataEpoch;
  const barSec = resolutionSec(resolution);
  const first = entry.utcBars[0].time;
  const params = buildPrependPeriodParams(first, barSec, Math.min(500, countBack));
  const result = await datafeed.getBars(symbolInfo, resolution, params);
  // Stale epoch: drop — do not mutate an entry from a different data generation.
  if (startEpoch !== dataEpoch) return getHtfBars(symbol, resolution);
  if (!result.bars?.length || result.noData) {
    entry.historyExhausted = true;
    return entry;
  }

  const older = result.bars.filter((b) => b.time < first);
  if (!older.length) {
    entry.historyExhausted = true;
    return entry;
  }

  const olderChart = older.slice();
  const next = putHtfEntry(key, {
    utcBars: [...older, ...entry.utcBars],
    chartBars: [...olderChart, ...(entry.chartBars ?? entry.utcBars)],
    historyExhausted: entry.historyExhausted,
    updatedAt: Date.now(),
    source: entry.source,
  });
  chartDebug("data", "htf cache prepend", {
    symbol,
    resolution,
    bars: next.utcBars.length,
    added: older.length,
  });
  return next;
}

/** Clear all cached HTF / security bar series. */
export function clearAllHtfBars() {
  store.clear();
  chartDebug("data", "htf cache clear all");
}

/** @param {string} symbol @param {string} [resolution] */
export function clearHtfBars(symbol, resolution) {
  if (!symbol) return;
  if (resolution) {
    store.delete(htfCacheKey(symbol, resolution));
    return;
  }
  for (const k of [...store.keys()]) {
    if (k.startsWith(`${symbol}|`)) store.delete(k);
  }
}

/**
 * Drop HTF entries at or coarser than target after switching to a finer chart TF.
 * Native coarse chart bars must not stay in the store — they disagree with LTF-aggregated HTF.
 * @param {string} symbol
 * @param {string} targetResolution
 */
export function clearHtfCoarserThan(symbol, targetResolution) {
  const targetSec = resolutionSec(targetResolution);
  if (!symbol || targetSec == null) return;
  let cleared = 0;
  for (const k of [...store.keys()]) {
    if (!k.startsWith(`${symbol}|`)) continue;
    const res = k.slice(symbol.length + 1);
    const sec = resolutionSec(res);
    if (sec != null && sec >= targetSec) {
      store.delete(k);
      cleared += 1;
    }
  }
  if (cleared) {
    chartDebug("data", "htf cache invalidate finer switch", {
      symbol,
      targetResolution,
      cleared,
    });
  }
}
