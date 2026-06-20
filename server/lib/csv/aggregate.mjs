/**
 * Aggregate 1m OHLCV bars to a higher timeframe (seconds bucket).
 * @param {object[]} bars1m sorted asc
 * @param {number} tfSec bucket size in seconds
 */
export function aggregateBars(bars1m, tfSec) {
  if (!bars1m.length || tfSec <= 60) return bars1m;
  /** @type {object[]} */
  const out = [];
  /** @type {object | null} */
  let cur = null;
  let bucket = null;

  for (const bar of bars1m) {
    const b = Math.floor(bar.time / tfSec) * tfSec;
    if (bucket == null || b !== bucket) {
      if (cur) out.push(cur);
      bucket = b;
      cur = {
        time: b,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
      };
      continue;
    }
    cur.high = Math.max(cur.high, bar.high);
    cur.low = Math.min(cur.low, bar.low);
    cur.close = bar.close;
    cur.volume = (cur.volume ?? 0) + (bar.volume ?? 0);
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * @param {object[]} bars
 * @param {number} [countBack]
 */
export function tailBars(bars, countBack) {
  if (!countBack || bars.length <= countBack) return bars;
  return bars.slice(-countBack);
}
