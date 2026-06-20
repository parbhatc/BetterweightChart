import { fetchTradingViewBars } from "./client.mjs";
import { fetchTradingViewBarsReplay } from "./replayClient.mjs";
import { resolutionSec } from "../resolutions.mjs";

const CHUNK = 5000;
const MAX_ROUNDS = 120;

/** @type {Map<string, { bars: object[], symbolInfo: object, at: number }>} */
const backtestResponseCache = new Map();

/** @param {string} symbol @param {string} resolution @param {number} days */
function cacheKey(symbol, resolution, days) {
  return `${symbol}|${resolution}|${days}`;
}

/** @param {object[]} a @param {object[]} b */
function mergeBars(a, b) {
  const map = new Map(a.map((bar) => [bar.time, bar]));
  for (const bar of b) map.set(bar.time, bar);
  return [...map.values()].sort((x, y) => x.time - y.time);
}

/** @param {number} days @param {number} resSec */
function estimateBarsNeeded(days, resSec) {
  const sessionSec = 6.5 * 3600;
  const barsPerDay = Math.max(1, Math.floor(sessionSec / resSec));
  return Math.ceil(days * barsPerDay * 0.85);
}

/**
 * @param {string} symbol
 * @param {string} resolution
 * @param {number} countBack
 * @param {{ to?: number } | null} range
 * @param {boolean} replayOnly
 */
async function fetchChunk(symbol, resolution, countBack, range, replayOnly) {
  if (replayOnly) {
    return fetchTradingViewBarsReplay(symbol, resolution, countBack, range);
  }
  const live = await fetchTradingViewBars(symbol, resolution, countBack, range);
  if (live.bars.length) return live;
  return fetchTradingViewBarsReplay(symbol, resolution, countBack, range);
}

/**
 * Deep history fetch for strategy backtests — pages backward until the calendar window is covered.
 * Separate from chart getBars so the tester loads once with replay fallback.
 *
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {string} opts.resolution
 * @param {number} [opts.days]
 * @param {number} [opts.from]
 * @param {number} [opts.to]
 */
export async function tradingViewBacktestHistory(opts) {
  const symbol = String(opts.symbol || "").trim();
  const resolution = String(opts.resolution || "1");
  const days = Math.max(1, Number(opts.days) || 90);
  const resSec = resolutionSec(resolution);
  const key = cacheKey(symbol, resolution, days);
  const hit = backtestResponseCache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) {
    const needBars = estimateBarsNeeded(days, resSec);
    return formatPayload(hit.bars, hit.symbolInfo, days, resSec, true, needBars);
  }

  let bars = [];
  /** @type {object | null} */
  let symbolInfo = null;
  let replayOnly = false;
  let rounds = 0;
  let exhausted = false;

  const initial = await fetchChunk(symbol, resolution, CHUNK, null, false);
  bars = initial.bars;
  symbolInfo = initial.symbolInfo ?? null;
  if (!bars.length) {
    return { s: "no_data", t: [], o: [], h: [], l: [], c: [], v: [], meta: { noData: true } };
  }

  const newest = opts.to != null ? Number(opts.to) : bars[bars.length - 1].time;
  const targetFrom = opts.from != null ? Number(opts.from) : newest - days * 86400;
  const needBars = estimateBarsNeeded(days, resSec);

  while (rounds < MAX_ROUNDS) {
    const oldest = bars[0].time;
    const inRange = bars.filter((b) => b.time >= targetFrom && b.time <= newest);
    if (oldest <= targetFrom && inRange.length >= needBars) break;

    const anchor = oldest - resSec;
    const chunk = await fetchChunk(symbol, resolution, CHUNK, { to: anchor }, replayOnly);
    if (!chunk.bars.length) {
      if (!replayOnly) {
        replayOnly = true;
        continue;
      }
      exhausted = true;
      break;
    }

    const older = chunk.bars.filter((b) => b.time < oldest);
    if (!older.length) {
      if (!replayOnly) {
        replayOnly = true;
        continue;
      }
      exhausted = true;
      break;
    }

    bars = mergeBars(bars, older);
    symbolInfo = chunk.symbolInfo ?? symbolInfo;
    rounds += 1;
  }

  const filtered = bars.filter((b) => b.time >= targetFrom && b.time <= newest);
  const inRangeCount = filtered.length;
  const oldestBar = filtered[0]?.time ?? bars[0]?.time;
  const complete =
    inRangeCount >= needBars * 0.7 ||
    (exhausted && oldestBar != null && oldestBar <= targetFrom && inRangeCount > 0);
  backtestResponseCache.set(key, { bars: filtered, symbolInfo, at: Date.now() });
  return formatPayload(filtered, symbolInfo, days, resSec, complete, needBars);
}

/**
 * @param {object[]} bars
 * @param {object | null} symbolInfo
 * @param {number} days
 * @param {number} resSec
 * @param {boolean} complete
 * @param {number} needBars
 */
function formatPayload(bars, symbolInfo, days, resSec, complete, needBars) {
  return {
    s: bars.length ? "ok" : "no_data",
    t: bars.map((b) => b.time),
    o: bars.map((b) => b.open),
    h: bars.map((b) => b.high),
    l: bars.map((b) => b.low),
    c: bars.map((b) => b.close),
    v: bars.map((b) => b.volume ?? 0),
    meta: {
      symbolInfo,
      source: "backtest",
      complete,
      bars: bars.length,
      needBars,
      oldest: bars[0]?.time,
      newest: bars[bars.length - 1]?.time,
    },
  };
}
