import { chartDebug } from "../../debug/chart/index.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { shiftBarsToChartTime, chartTimeZoneForPane } from "../../chart/timezone/chartTime.js";
import { buildInitialPeriodParams, buildPrependPeriodParams, alignBarTime } from "./periodParams.js";
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

  const cached = lookupBarsForEnsure(opts, want);
  if (cached?.sufficient) {
    return seedHtfBars(symbol, resolution, cached.utcBars, cached.chartBars, cached.source);
  }

  const existing = store.get(key);
  if (existing && existing.utcBars.length >= want && !existing.historyExhausted) {
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
  const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfoExtra ?? symbolInfo);

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
    const to =
      pane.bars?.length > 0
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

  const chartBars = shiftBarsToChartTime(utcBars, tz);
  const entry = {
    utcBars,
    chartBars,
    historyExhausted: utcBars.length < want,
    updatedAt: Date.now(),
    source: utcBars.length >= want ? cacheSource : "datafeed",
  };
  store.set(key, entry);
  chartDebug("data", "htf cache store", { symbol, resolution, bars: utcBars.length });
  return entry;
}

/**
 * Prepend older HTF bars when FVG lookback needs more history.
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

  const tz = chartTimeZoneForPane(pane, settingsStore, symbolInfoExtra ?? symbolInfo);
  entry.utcBars = merged;
  entry.chartBars = shiftBarsToChartTime(merged, tz);
  entry.updatedAt = Date.now();
  store.set(key, entry);
  chartDebug("data", "htf cache prepend", { symbol, resolution, bars: merged.length, added: older.length });
  return entry;
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
