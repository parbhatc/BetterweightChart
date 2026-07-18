import { TF_MAP, MIN_1M_CHUNK, MAX_1M_CHUNK, ONE_M_BUFFER, ET_ZONE } from "../core/constants.js";

/** Bucket open for aggregation — ET wall clock for intraday TFs. */
export class Aggregate {
  static bucketTime(timeUnix, intervalSec) {
    const DT = typeof globalThis.luxon !== "undefined" ? globalThis.luxon.DateTime : null;

    if (intervalSec >= 86400) {
      if (DT) {
        const d = DT.fromSeconds(timeUnix, { zone: ET_ZONE });
        if (d.isValid) return Math.floor(d.startOf("day").toSeconds());
      }
      return Math.floor(timeUnix / 86400) * 86400;
    }

    if (!DT) {
      let offset = 0;
      if (intervalSec === 14400) offset = 2 * 3600;
      return Math.floor((timeUnix - offset) / intervalSec) * intervalSec + offset;
    }

    const d = DT.fromSeconds(timeUnix, { zone: ET_ZONE });
    if (!d.isValid) {
      return Math.floor(timeUnix / intervalSec) * intervalSec;
    }

    const dayStart = d.startOf("day");
    const minuteOfDay = Math.floor(d.diff(dayStart, "minutes").minutes);
    const stepMin = intervalSec / 60;
    if (stepMin < 1 || !Number.isFinite(stepMin)) {
      return Math.floor(timeUnix / intervalSec) * intervalSec;
    }
    const bucketMinute = Math.floor(minuteOfDay / stepMin) * stepMin;
    return Math.floor(dayStart.plus({ minutes: bucketMinute }).toSeconds());
  }

  /** @param {{ time: number; open: number; high: number; low: number; close: number; volume: number }[]} data @param {string} tfKey */
  static candles(data, tfKey) {
    if (!Array.isArray(data)) return [];
    const interval = TF_MAP[tfKey];
    if (!interval) return data;
    const maxCandles = interval / 60;
    if (maxCandles <= 1) return data;

    /**
     * A Map keeps timestamp keys as numbers. Track the first/last source time
     * so a response that arrives out of order still has the right OHLC values.
     */
    const grouped = new Map();
    for (const candle of data) {
      if (!candle || !Number.isFinite(candle.time)) continue;
      const t = Aggregate.bucketTime(candle.time, interval);
      const volume = Number.isFinite(candle.volume) ? candle.volume : 0;
      const existing = grouped.get(t);
      if (!existing) {
        grouped.set(t, {
          time: t,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume,
          firstTime: candle.time,
          lastTime: candle.time,
        });
      } else {
        const g = existing;
        g.high = Math.max(g.high, candle.high);
        g.low = Math.min(g.low, candle.low);
        if (candle.time < g.firstTime) {
          g.firstTime = candle.time;
          g.open = candle.open;
        }
        if (candle.time >= g.lastTime) {
          g.lastTime = candle.time;
          g.close = candle.close;
        }
        g.volume += volume;
      }
    }
    return [...grouped.values()]
      .filter((c) => c.high !== c.low || c.volume > 0)
      .sort((a, b) => a.time - b.time)
      // Keep bookkeeping internal; callers receive the original candle shape.
      .map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume }));
  }

  /** @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }[]} raw1m @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }} fullAggBar */
  static truncatedBar(raw1m, fullAggBar, tfKey, replayTip1mOpen) {
    if (!fullAggBar || replayTip1mOpen == null || !Number.isFinite(replayTip1mOpen)) return fullAggBar;
    const interval = TF_MAP[tfKey];
    if (!interval || interval <= 60) return fullAggBar;

    const bucketOpen = fullAggBar.time;
    let first = null;
    let last = null;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const c of raw1m) {
      if (Aggregate.bucketTime(c.time, interval) !== bucketOpen) continue;
      if (c.time > replayTip1mOpen) continue;
      // Do this in one pass: replay updates call this frequently, and sorting
      // or allocating a temporary bar array would create avoidable churn.
      if (!first || c.time < first.time) first = c;
      if (!last || c.time >= last.time) last = c;
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
      volume += Number.isFinite(c.volume) ? c.volume : 0;
    }
    if (!first || !last) return fullAggBar;

    const open = first.open;
    const close = last.close;
    if (
      open === fullAggBar.open &&
      high === fullAggBar.high &&
      low === fullAggBar.low &&
      close === fullAggBar.close &&
      volume === fullAggBar.volume
    ) {
      return fullAggBar;
    }
    return {
      ...fullAggBar,
      open,
      high,
      low,
      close,
      volume,
    };
  }

  static chartBar(b) {
    return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
  }

  static estimated1mWindow(aggBarCount, tfKey) {
    const mult = Math.max(1, TF_MAP[tfKey] / 60);
    const n = Math.ceil(Math.max(8, aggBarCount) * mult * ONE_M_BUFFER);
    return Math.min(MAX_1M_CHUNK, Math.max(MIN_1M_CHUNK, n));
  }
}
