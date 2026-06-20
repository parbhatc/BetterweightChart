import { Aggregate } from "./aggregate.js";
import { TF_MAP } from "../core/constants.js";

export class CompletedAgg {
  /** @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }[]} data1m @param {number | string} intervalSecOrTfKey */
  static completed(data1m, intervalSecOrTfKey) {
    const intervalSec =
      typeof intervalSecOrTfKey === "string" ? TF_MAP[intervalSecOrTfKey] : intervalSecOrTfKey;
    if (!data1m?.length || !intervalSec || intervalSec <= 60) return data1m ?? [];

    /** @type {Record<number, { time: number; open: number; high: number; low: number; close: number; volume: number; last1m: number }>} */
    const grouped = {};

    for (const candle of data1m) {
      const bucketOpen = Aggregate.bucketTime(candle.time, intervalSec);
      const g = grouped[bucketOpen];
      if (!g) {
        grouped[bucketOpen] = {
          time: bucketOpen,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0,
          last1m: candle.time,
        };
      } else {
        g.high = Math.max(g.high, candle.high);
        g.low = Math.min(g.low, candle.low);
        g.close = candle.close;
        g.volume += candle.volume || 0;
        g.last1m = Math.max(g.last1m, candle.time);
      }
    }

    const bucketClose1m = intervalSec - 60;

    return Object.values(grouped)
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
