import { Aggregate } from "../utils/aggregate.js";
import { sliceBarsThroughAnchor } from "../levels/levelsCalc.js";
import { profileAdd, profileInc, profileOn } from "../core/setup1Profile.js";
import {
  CompletedAgg,
} from "../utils/completedAgg.js";

const COMPLETED_TF_KEYS = ["15m", "1h", "4h"];

/** Chart + HTF keys pre-aggregated once per session load. */
export const SESSION_PRECOMPUTE_TFS = ["1m", "5m", "15m", "1h", "4h"];

export class SessionBarCache {
  constructor() {
    /** @type {{ rawRef: object | null; rawLen: number; rawHead: number; aggs: Record<string, { time: number; open: number; high: number; low: number; close: number; volume?: number }[]>; completedAggs: Record<string, { time: number; open: number; high: number; low: number; close: number; volume?: number }[]>; completedBuckets: Record<string, Map<number, { time: number; open: number; high: number; low: number; close: number; volume?: number }>> }} */
    this._sessionCache = {
      rawRef: null,
      rawLen: 0,
      rawHead: 0,
      aggs: {},
      completedAggs: {},
      completedBuckets: {},
    };
    /** @type {Map<string, { time: number; open: number; high: number; low: number; close: number; volume?: number }[]> | null} */
    this._anchorAggPassMemo = null;
  }

  /** @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }[]} raw1m */
  warm(raw1m) {
    if (!raw1m?.length) {
      this.reset();
      return;
    }
    const head = raw1m[0]?.time ?? 0;
    if (
      this._sessionCache.rawRef === raw1m &&
      this._sessionCache.rawLen === raw1m.length &&
      this._sessionCache.rawHead === head
    ) {
      return;
    }
    /** @type {Record<string, typeof raw1m>} */
    const aggs = {};
    /** @type {Record<string, typeof raw1m>} */
    const completedAggs = {};
    /** @type {Record<string, Map<number, (typeof raw1m)[number]>>} */
    const completedBuckets = {};

    for (const tf of SESSION_PRECOMPUTE_TFS) {
      if (tf === "1m") {
        aggs[tf] = raw1m;
        continue;
      }
      aggs[tf] = Aggregate.candles(raw1m, tf);
      if (COMPLETED_TF_KEYS.includes(tf)) {
        completedAggs[tf] = CompletedAgg.completed(raw1m, tf);
        completedBuckets[tf] = CompletedAgg.bucketMap(raw1m, tf);
      }
    }
    this._sessionCache = { rawRef: raw1m, rawLen: raw1m.length, rawHead: head, aggs, completedAggs, completedBuckets };
    this._anchorAggPassMemo = null;
  }

  reset() {
    this._sessionCache = {
      rawRef: null,
      rawLen: 0,
      rawHead: 0,
      aggs: {},
      completedAggs: {},
      completedBuckets: {},
    };
    this._anchorAggPassMemo = null;
  }

  /** @param {typeof this._sessionCache.rawRef} raw1m */
  isWarm(raw1m) {
    return Boolean(raw1m?.length && this._sessionCache.rawRef === raw1m && this._sessionCache.rawLen === raw1m.length);
  }

  /** @param {string} tfKey */
  getAggFull(tfKey) {
    return this._sessionCache.aggs[tfKey] ?? null;
  }

  beginAnchorAggPass() {
    this._anchorAggPassMemo = new Map();
  }

  endAnchorAggPass() {
    this._anchorAggPassMemo = null;
  }

  aggregateBarsThroughAnchor(bars1m, anchorUnix, tfKey) {
    if (!bars1m?.length || anchorUnix == null) return [];
    const key = `${tfKey}:${anchorUnix}`;
    if (this._anchorAggPassMemo?.has(key)) {
      if (profileOn() && tfKey === "15m") profileInc("fvgAgg15mMemoHits");
      return this._anchorAggPassMemo.get(key);
    }

    if (
      this._sessionCache.rawRef === bars1m &&
      COMPLETED_TF_KEYS.includes(tfKey) &&
      this._sessionCache.completedAggs[tfKey]?.length
    ) {
      const t0 = profileOn() && tfKey === "15m" ? performance.now() : 0;
      if (profileOn() && tfKey === "15m") profileInc("fvgAgg15mMemoMisses");
      const result = CompletedAgg.sliceThrough(
        this._sessionCache.completedAggs[tfKey],
        anchorUnix,
      );
      if (profileOn() && tfKey === "15m") profileAdd("fvgAgg15mMissWorkMs", performance.now() - t0);
      this._anchorAggPassMemo?.set(key, result);
      return result;
    }

    const t0 = profileOn() && tfKey === "15m" ? performance.now() : 0;
    if (profileOn() && tfKey === "15m") profileInc("fvgAgg15mMemoMisses");
    const slice = sliceBarsThroughAnchor(bars1m, anchorUnix);
    const result = Aggregate.candles(slice, tfKey);
    if (profileOn() && tfKey === "15m") profileAdd("fvgAgg15mMissWorkMs", performance.now() - t0);
    this._anchorAggPassMemo?.set(key, result);
    return result;
  }
}

const defaultCache = new SessionBarCache();

export const warmSessionBarCache = (...a) => defaultCache.warm(...a);
export const resetSessionBarCache = () => defaultCache.reset();
export const isSessionBarCacheWarm = (...a) => defaultCache.isWarm(...a);
export const getSessionAggFull = (...a) => defaultCache.getAggFull(...a);
export const beginAnchorAggPass = () => defaultCache.beginAnchorAggPass();
export const endAnchorAggPass = () => defaultCache.endAnchorAggPass();
export const aggregateBarsThroughAnchor = (...a) => defaultCache.aggregateBarsThroughAnchor(...a);
