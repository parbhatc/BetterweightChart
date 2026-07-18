import { Aggregate } from "./aggregate.js";
import { TF_MAP } from "../core/constants.js";

export class CompletedAgg {
  /** @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }[]} data1m @param {number | string} intervalSecOrTfKey */
  static completed(data1m, intervalSecOrTfKey) {
    const intervalSec =
      typeof intervalSecOrTfKey === "string" ? TF_MAP[intervalSecOrTfKey] : intervalSecOrTfKey;
    if (!data1m?.length || !intervalSec || intervalSec <= 60) return data1m ?? [];

    /** @type {Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number; first1m: number; last1m: number }>} */
    const grouped = new Map();

    for (const candle of data1m) {
      if (!candle || !Number.isFinite(candle.time)) continue;
      const bucketOpen = Aggregate.bucketTime(candle.time, intervalSec);
      const g = grouped.get(bucketOpen);
      const volume = Number.isFinite(candle.volume) ? candle.volume : 0;
      if (!g) {
        grouped.set(bucketOpen, {
          time: bucketOpen,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume,
          first1m: candle.time,
          last1m: candle.time,
        });
      } else {
        g.high = Math.max(g.high, candle.high);
        g.low = Math.min(g.low, candle.low);
        if (candle.time < g.first1m) {
          g.first1m = candle.time;
          g.open = candle.open;
        }
        if (candle.time >= g.last1m) {
          g.last1m = candle.time;
          g.close = candle.close;
        }
        g.volume += volume;
      }
    }

    const bucketClose1m = intervalSec - 60;

    return [...grouped.values()]
      .filter((c) => c.last1m >= c.time + bucketClose1m)
      .filter((c) => c.high !== c.low || c.volume > 0)
      .sort((a, b) => a.time - b.time)
      .map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume }));
  }

  static bucketMap(data1m, intervalSecOrTfKey) {
    const bars = CompletedAgg.completed(data1m, intervalSecOrTfKey);
    /** @type {Map<number, (typeof bars)[number]>} */
    const map = new Map();
    for (const bar of bars) map.set(bar.time, bar);
    return map;
  }

  static sliceThrough(completedSorted, anchorUnix) {
    if (!completedSorted?.length || anchorUnix == null) return [];
    let lo = 0;
    let hi = completedSorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (completedSorted[mid].time <= anchorUnix) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? completedSorted.slice(0, lo) : [];
  }
}
