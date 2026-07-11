// HTF bar cache: FETCHES and STORES higher-timeframe series and handles
// replay-anchor extension. Indicators read/merge/request through
// indicators/security/htfAccess.js (resolveHtfSeries) — not this module directly.
import { chartDebug } from "../../debug/chart/index.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { buildInitialPeriodParams, buildPrependPeriodParams, buildTvPeriodParams, alignBarTime } from "./periodParams.js";
import { lookupSymbolBars } from "./symbolBarCache.js";

/** @typedef {{ utcBars: object[], chartBars: object[], historyExhausted: boolean, updatedAt: number, source?: string }} HtfBarEntry */

/** @type {Map<string, HtfBarEntry>} */
const store = new Map();
/** @type {Map<string, Promise<HtfBarEntry | null>>} */
const inFlight = new Map();

/** @param {string} symbol @param {string} resolution */
export function htfCacheKey(symbol, resolution) {
  return `${symbol}|${resolution}`;
}

/** @param {string} symbol @param {string} resolution @returns {HtfBarEntry | null} */
export function getHtfBars(symbol, resolution) {
  if (!symbol || !resolution) return null;
  return store.get(htfCacheKey(symbol, resolution)) ?? null;
}

/**
 * HTF cache fetched at an earlier replay anchor may end before buckets needed now
 * (e.g. 9:15 15m bar cached at 9:29 — 9:30 bucket missing until anchor passes 9:45).
 * @param {string} symbol
 * @param {string} resolution
 * @param {number} anchorSec replay playback anchor (1m UTC)
 */
export function htfCacheStaleForAnchor(symbol, resolution, anchorSec) {
  const tfSec = resolutionSec(resolution);
  if (!symbol || !resolution || anchorSec == null || !tfSec) return false;
  const entry = getHtfBars(symbol, resolution);
  if (!entry?.utcBars?.length) return false;
  const lastOpen = entry.utcBars.at(-1)?.time;
  if (lastOpen == null) return false;
  const anchorOpen = alignBarTime(anchorSec, tfSec);
  // ponytail: pivot-right needs the next HTF bucket closed through anchor
  return lastOpen < anchorOpen - tfSec;
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
  if (!htfCacheStaleForAnchor(symbol, resolution, anchorSec)) {
    return getHtfBars(symbol, resolution);
  }

  const key = htfCacheKey(symbol, resolution);
  const flightKey = `${key}|extend`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

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
    if (!result.bars?.length) return entry ?? null;

    const base = entry?.utcBars ?? [];
    const byTime = new Map(base.map((b) => [b.time, b]));
    for (const bar of result.bars) {
      if (lastOpen != null && bar.time < lastOpen) continue;
      byTime.set(bar.time, bar);
    }
    const merged = [...byTime.values()].sort((a, b) => a.time - b.time);
    if (!merged.length) return entry ?? null;
    if (entry && merged.length === base.length) return entry;

    const next = {
      utcBars: merged,
      chartBars: merged,
      historyExhausted: entry?.historyExhausted ?? false,
      updatedAt: Date.now(),
      source: entry?.source ?? "datafeed",
    };
    store.set(key, next);
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
  const existing = store.get(key);

  if (source === "timeframe-switch" && existing?.utcBars?.length) {
    const byTime = new Map(
      existing.utcBars.map((b, i) => [
        b.time,
        { utc: b, chart: existing.chartBars?.[i] ?? b },
      ]),
    );
    for (let i = 0; i < utcBars.length; i++) {
      byTime.set(utcBars[i].time, {
        utc: utcBars[i],
        chart: chartBars?.[i] ?? utcBars[i],
      });
    }
    const mergedUtc = [...byTime.values()]
      .sort((a, b) => a.utc.time - b.utc.time)
      .map((e) => e.utc);
    const mergedChart = [...byTime.values()]
      .sort((a, b) => a.utc.time - b.utc.time)
      .map((e) => e.chart);
    const entry = {
      utcBars: mergedUtc,
      chartBars: mergedChart,
      historyExhausted: existing.historyExhausted ?? false,
      updatedAt: Date.now(),
      source,
    };
    store.set(key, entry);
    chartDebug("data", "htf cache seed merge", {
      symbol,
      resolution,
      source,
      bars: entry.utcBars.length,
      mergedFrom: utcBars.length,
    });
    return entry;
  }

  if (existing && existing.utcBars.length >= utcBars.length) return existing;

  const entry = {
    utcBars: utcBars.slice(),
    chartBars: chartBars?.length ? chartBars.slice() : utcBars.slice(),
    historyExhausted: existing?.historyExhausted ?? false,
    updatedAt: Date.now(),
    source,
  };
  store.set(key, entry);
  chartDebug("data", "htf cache seed", { symbol, resolution, source, bars: entry.utcBars.length });
  return entry;
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
  const want = Math.max(50, Math.min(2000, Number(countBack) || 300));
  const anchorSec = opts.playbackAnchorSec;

  if (anchorSec != null && htfCacheStaleForAnchor(symbol, resolution, anchorSec)) {
    const symInfo = symbolInfo ?? pane?.symbolInfo ?? symbolInfoExtra;
    if (symInfo) {
      await extendHtfCacheForAnchor({ ...opts, anchorSec, symbolInfo: symInfo });
    }
  }

  const cached = lookupBarsForEnsure(opts, want);
  if (cached?.sufficient) {
    return seedHtfBars(symbol, resolution, cached.utcBars, cached.chartBars, cached.source);
  }

  let existing = store.get(key);
  // ponytail: replay anchor caps HTF depth — never chase countBack=1000 on every step
  if (
    anchorSec != null &&
    existing?.utcBars?.length &&
    !htfCacheStaleForAnchor(symbol, resolution, anchorSec)
  ) {
    return existing;
  }
  if (
    existing &&
    existing.utcBars.length >= want &&
    !existing.historyExhausted &&
    (anchorSec == null || !htfCacheStaleForAnchor(symbol, resolution, anchorSec))
  ) {
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
    const params = buildInitialPeriodParams(barSec, want);
    params.to = to;
    chartDebug("data", "htf cache fetch", { symbol, resolution, countBack: want, to: params.to });
    const result = await datafeed.getBars(symbolInfo, resolution, params);
    if (result.bars?.length) {
      utcBars = result.bars;
    }
  }

  if (!utcBars.length) return existing ?? null;

  // ponytail: never shrink store — unless replay anchor moved forward (handled above)
  if (existing?.utcBars?.length && utcBars.length <= existing.utcBars.length) {
    return existing;
  }

  const chartBars = utcBars;
  const entry = {
    utcBars,
    chartBars,
    // A short fetch is NOT exhaustion — wall-clock `from` over gaps/weekends can
    // return fewer bars than wanted. Only a replay anchor caps history here;
    // prependHtfBars is the sole authority for true exhaustion (noData / no older bars).
    historyExhausted: opts.playbackAnchorSec != null,
    updatedAt: Date.now(),
    source: utcBars.length >= want ? cacheSource : "datafeed",
  };
  store.set(key, entry);
  chartDebug("data", "htf cache store", { symbol, resolution, bars: utcBars.length });
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
  const entry = store.get(key);
  if (!entry || entry.historyExhausted || !entry.utcBars.length) return entry ?? null;

  const barSec = resolutionSec(resolution);
  const first = entry.utcBars[0].time;
  const params = buildPrependPeriodParams(first, barSec, Math.min(500, countBack));
  const result = await datafeed.getBars(symbolInfo, resolution, params);
  if (!result.bars?.length || result.noData) {
    entry.historyExhausted = true;
    return entry;
  }

  const older = result.bars.filter((b) => b.time < first);
  if (!older.length) {
    entry.historyExhausted = true;
    return entry;
  }

  const seen = new Set();
  const merged = [...older, ...entry.utcBars].filter((b) => {
    if (seen.has(b.time)) return false;
    seen.add(b.time);
    return true;
  });

  entry.utcBars = merged;
  entry.chartBars = merged;
  entry.updatedAt = Date.now();
  store.set(key, entry);
  chartDebug("data", "htf cache prepend", { symbol, resolution, bars: merged.length, added: older.length });
  return entry;
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
