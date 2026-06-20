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
    const interval = TF_MAP[tfKey];
    if (!interval) return data;
    const maxCandles = interval / 60;
    if (maxCandles <= 1) return data;

    /** @type {Record<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>} */
    const grouped = {};
    for (const candle of data) {
      const t = Aggregate.bucketTime(candle.time, interval);
      if (!grouped[t]) {
        grouped[t] = {
          time: t,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0,
        };
      } else {
        const g = grouped[t];
        g.high = Math.max(g.high, candle.high);
        g.low = Math.min(g.low, candle.low);
        g.close = candle.close;
        g.volume += candle.volume || 0;
      }
    }
    return Object.values(grouped)
      .filter((c) => c.high !== c.low || c.volume > 0)
      .sort((a, b) => a.time - b.time);
  }

  /** @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }[]} raw1m @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }} fullAggBar */
  static truncatedBar(raw1m, fullAggBar, tfKey, replayTip1mOpen) {
    if (!fullAggBar || replayTip1mOpen == null || !Number.isFinite(replayTip1mOpen)) return fullAggBar;
    const interval = TF_MAP[tfKey];
    if (!interval || interval <= 60) return fullAggBar;

    const bucketOpen = fullAggBar.time;
    /** @type {typeof raw1m} */
    const included = [];
    for (const c of raw1m) {
      if (Aggregate.bucketTime(c.time, interval) !== bucketOpen) continue;
      if (c.time <= replayTip1mOpen) included.push(c);
    }
    if (included.length === 0) return fullAggBar;

    const open = included[0].open;
    let high = included[0].high;
    let low = included[0].low;
    let vol = 0;
    for (const c of included) {
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
      vol += c.volume || 0;
    }
    const close = included[included.length - 1].close;
    if (
      open === fullAggBar.open &&
      high === fullAggBar.high &&
      low === fullAggBar.low &&
      close === fullAggBar.close
    ) {
      return fullAggBar;
    }
    return {
      ...fullAggBar,
      open,
      high,
      low,
      close,
      volume: vol,
    };
  }

  static chartBar(b) {
    return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
  }

  /** @param {{ time: number; open?: number; high?: number; low?: number; close?: number }[]} chartBars @param {string} tfKey @param {number} count */
  static futureWhitespace(chartBars, tfKey, count) {
    if (!chartBars.length || count <= 0) return chartBars;
    const tfSec = TF_MAP[tfKey] ?? 60;
    const out = [...chartBars];
    let t = chartBars[chartBars.length - 1].time;
    for (let i = 0; i < count; i++) {
      t += tfSec;
      out.push({ time: t });
    }
    return out;
  }

  static estimated1mWindow(aggBarCount, tfKey) {
    const mult = Math.max(1, TF_MAP[tfKey] / 60);
    const n = Math.ceil(Math.max(8, aggBarCount) * mult * ONE_M_BUFFER);
    return Math.min(MAX_1M_CHUNK, Math.max(MIN_1M_CHUNK, n));
  }
}
