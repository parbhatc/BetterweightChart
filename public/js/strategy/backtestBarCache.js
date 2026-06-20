import { chartDebug } from "../debug/chart/index.js";
import { resolutionSec } from "../chart/resolutions.js";
import { shiftBarsToChartTime, chartTimeZoneForPane } from "../chart/timezone/chartTime.js";
import {
  backtestRangeSatisfied,
  normalizeBacktestRangeId,
} from "./backtestRange.js";

/** @typedef {{ utcBars: object[], chartBars: object[], historyExhausted: boolean, complete: boolean, updatedAt: number }} BacktestBarEntry */

/** @type {Map<string, BacktestBarEntry>} */
const store = new Map();
/** @type {Map<string, Promise<BacktestBarEntry | null>>} */
const inFlight = new Map();

/** @param {string} symbol @param {string} resolution */
export function backtestCacheKey(symbol, resolution) {
  return `${symbol}|${resolution}`;
}

/** @param {string} symbol @param {string} resolution @returns {BacktestBarEntry | null} */
export function getBacktestBars(symbol, resolution) {
  if (!symbol || !resolution) return null;
  return store.get(backtestCacheKey(symbol, resolution)) ?? null;
}

/** @param {import("./backtestRange.js").BacktestRange | string} range */
function rangeIdForFetch(range) {
  const id = typeof range === "string" ? normalizeBacktestRangeId(range) : normalizeBacktestRangeId(range?.id);
  return id;
}

/**
 * Bars older than the pane's first bar, in chart-time OHLC form.
 * @param {object} pane
 */
export function olderBarsFromBacktestCache(pane) {
  const entry = getBacktestBars(pane?.symbol, pane?.resolution);
  if (!entry?.utcBars?.length || !pane?.bars?.length) return null;

  const first = pane.bars[0].time;
  const older = [];
  for (let i = 0; i < entry.utcBars.length; i++) {
    const utcTime = entry.utcBars[i].time;
    if (utcTime >= first) continue;
    const b = entry.utcBars[i];
    older.push({
      time: utcTime,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume ?? 0,
    });
  }
  return older.length ? older : null;
}

/**
 * Serve a chart getBars-shaped slice from the strategy backtest cache (no network).
 * @param {string} symbol
 * @param {string} resolution
 * @param {{ from?: number, to?: number, countBack?: number }} periodParams
 */
export function tryBacktestCacheBars(symbol, resolution, periodParams = {}) {
  const entry = getBacktestBars(symbol, resolution);
  if (!entry?.complete || !entry.utcBars.length) return null;

  const to = periodParams.to != null ? Number(periodParams.to) : null;
  const from = periodParams.from != null ? Number(periodParams.from) : null;
  const countBack =
    periodParams.countBack != null ? Math.max(1, Number(periodParams.countBack)) : null;

  let bars = entry.utcBars;
  if (to != null) bars = bars.filter((b) => b.time <= to);
  if (from != null) bars = bars.filter((b) => b.time >= from);
  if (!bars.length) return null;
  if (countBack != null && bars.length > countBack) bars = bars.slice(-countBack);

  return {
    bars,
    meta: { source: "backtest-cache", cached: entry.utcBars.length },
    noData: false,
  };
}

/**
 * Load full backtest history via dedicated API (not chart getBars).
 * @param {object} opts
 */
export async function ensureBacktestBarCache(opts) {
  const { datafeed, pane, backtestRange, settingsStore, onChunk } = opts;
  if (!datafeed || !pane?.symbol || !pane.resolution) return null;
  if (typeof datafeed.getBacktestBars !== "function") {
    chartDebug("data", "backtest cache: getBacktestBars not available on datafeed");
    return null;
  }

  const range =
    typeof backtestRange === "string"
      ? { id: normalizeBacktestRangeId(backtestRange) }
      : (backtestRange ?? { id: "90d" });
  const id = rangeIdForFetch(range);
  if (id === "custom" && (range.from == null || range.to == null)) return null;

  const key = backtestCacheKey(pane.symbol, pane.resolution);
  const barSec = resolutionSec(pane.resolution);
  const existing = store.get(key);
  if (existing?.complete) return existing;

  let pending = inFlight.get(key);
  if (pending) return pending;

  pending = (async () => {
    if (!pane.symbolInfo && pane.symbol) {
      pane.symbolInfo = await datafeed.resolveSymbol(pane.symbol);
    }
    if (!pane.symbolInfo) return null;

    const result = await datafeed.getBacktestBars(pane.symbolInfo, pane.resolution, {
      rangeId: id,
      from: range.from,
      to: range.to,
    });

    const tz = chartTimeZoneForPane(pane, settingsStore, pane.symbolInfo);
    const utcBars = result.bars ?? [];
    const chartBars = utcBars.length ? shiftBarsToChartTime(utcBars, tz) : [];
    const complete =
      Boolean(result.meta?.complete) ||
      backtestRangeSatisfied(utcBars, range, pane.chart, barSec);

    const entry = {
      utcBars,
      chartBars,
      historyExhausted: !utcBars.length || Boolean(result.noData),
      complete,
      updatedAt: Date.now(),
    };
    store.set(key, entry);
    chartDebug("data", "backtest cache loaded", {
      symbol: pane.symbol,
      resolution: pane.resolution,
      bars: utcBars.length,
      complete,
      meta: result.meta,
    });
    onChunk?.(entry);
    return entry;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, pending);
  return pending;
}

/** @param {string} symbol @param {string} resolution */
export function clearBacktestBars(symbol, resolution) {
  if (symbol && resolution) store.delete(backtestCacheKey(symbol, resolution));
  else store.clear();
}
