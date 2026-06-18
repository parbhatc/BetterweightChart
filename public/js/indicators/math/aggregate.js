/**
 * Aggregate chart bars to a higher timeframe (OHLCV).
 * Buckets align to wall-clock boundaries in chart time (matches TV session bars).
 * @param {object[]} bars UTC bars
 * @param {number} targetSec period length in seconds
 * @param {number} [chartSec] source bar period (for alignment)
 * @param {(utcTime: number, index: number) => number} [chartTimeAt] map UTC → chart time for bucketing
 */
export function aggregateBars(bars, targetSec, chartSec = 60, chartTimeAt) {
  if (!bars.length || targetSec <= chartSec) {
    return bars.map((b, i) => ({ ...b, sourceIndex: i, startSourceIndex: i }));
  }

  /** @type {object[]} */
  const out = [];
  /** @type {object | null} */
  let cur = null;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const ct = chartTimeAt ? chartTimeAt(b.time, i) : b.time;
    const bucket = Math.floor(ct / targetSec) * targetSec;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = {
        time: bucket,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume ?? 0,
        sourceIndex: i,
        startSourceIndex: i,
        endTime: b.time,
      };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume = (cur.volume ?? 0) + (b.volume ?? 0);
      cur.endTime = b.time;
      cur.sourceIndex = i;
    }
  }
  if (cur) out.push(cur);
  return out;
}
