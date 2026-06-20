import { splitSetup2Cycles } from "../../confluence/fvgTapContext.js";
import {
  buildLive,
  collectEntryCandidates,
} from "./checklistCycleLive.js";
import { config, checklist as checklistItems } from "./engineConfig.js";
import { primaryFvgTapTf } from "../setupFvgTap.js";
import {
  beginAnchorAggPass,
  endAnchorAggPass,
  isSessionBarCacheWarm,
  warmSessionBarCache,
} from "../../session/sessionBarCache.js";
import { Format } from "../../utils/format.js";
import {
  capAnchorForSetupWindow,
  floorRegimeStartForSetupWindow,
  isWithinSetupTradingWindow,
  resolveSetupTradingWindowBounds,
} from "../setupTradingWindow.js";
import { ppiHtfSweepBeforeAnchor } from "../../confluence/ppiNews.js";

/** @typedef {import("./checklistCycleLive.js").FvgTapSnapshot} FvgTapSnapshot */

/**
 * @param {FvgTapSnapshot} setup
 * @param {number} cycleStart
 * @param {number} cycleEnd
 * @param {number} anchorUnix
 */
function completionInCycle(setup, cycleStart, cycleEnd, anchorUnix, sessionYmd, tradingBounds, opts) {
  const at = setup.completedAt;
  if (!setup.complete || at == null) return null;
  if (at > anchorUnix || at < cycleStart) return null;
  if (Number.isFinite(cycleEnd) && at >= cycleEnd) return null;
  if (sessionYmd && !Format.isSessionDay(at, sessionYmd)) return null;
  if (tradingBounds && !isWithinSetupTradingWindow(at, tradingBounds)) return null;
  if (
    opts.getHasPpiNews?.() === true &&
    !ppiHtfSweepBeforeAnchor(opts.getSweepEvents?.() ?? [], at, sessionYmd)
  ) {
    return null;
  }
  return setup;
}

/**
 * @param {Parameters<typeof buildLive>[0]} opts
 * @param {{ start: number; end: number }} cycle
 * @param {number} anchorUnix
 * @param {number} sessionStart
 * @param {{ forwardOnly?: boolean }} [scanOpts]
 */
function findCycleCompletion(opts, cycle, anchorUnix, sessionStart, sessionYmd, tradingBounds, scanOpts) {
  const end = Math.min(
    anchorUnix,
    Number.isFinite(cycle.end) ? cycle.end - 60 : anchorUnix,
  );
  const regimeStart = floorRegimeStartForSetupWindow(sessionStart, tradingBounds);

  if (scanOpts?.forwardOnly) {
    const setup = buildLive({ ...opts, anchorUnix: end, tradingBounds });
    return completionInCycle(setup, cycle.start, cycle.end, anchorUnix, sessionYmd, tradingBounds, opts);
  }

  const candidates = collectEntryCandidates(opts, end, regimeStart).filter(
    (t) => t >= Math.max(cycle.start, regimeStart) && t <= end,
  );

  for (const t of candidates) {
    const setup = buildLive({ ...opts, anchorUnix: t, tradingBounds });
    const hit = completionInCycle(setup, cycle.start, cycle.end, anchorUnix, sessionYmd, tradingBounds, opts);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {FvgTapSnapshot} live
 * @param {Parameters<typeof buildLive>[0]} opts
 * @param {number} anchorUnix
 */
function freezeFvgTapSnapshot(live, opts, anchorUnix) {
  const at = live.completedAt;
  if (at == null) return live;
  if (anchorUnix <= at) return live;
  return buildLive({ ...opts, anchorUnix: at });
}

export class FvgTapHistory {
  constructor() {
    /** @type {{ dayKey: string; anchorUnix: number; sorted: FvgTapSnapshot[] | null; closedCycles: Map<number, FvgTapSnapshot | null>; compBarsLen: number; sweepCount: number }} */
    this._cache = {
      dayKey: "",
      anchorUnix: -Infinity,
      sorted: null,
      closedCycles: new Map(),
      compBarsLen: 0,
      sweepCount: 0,
    };
  }

  resetCache() {
    this._cache = {
      dayKey: "",
      anchorUnix: -Infinity,
      sorted: null,
      closedCycles: new Map(),
      compBarsLen: 0,
      sweepCount: 0,
    };
  }

  /** @param {string} [dayYmd] */
  ensureDay(dayYmd) {
    const key = dayYmd || "";
    if (!key || key === this._cache.dayKey) return;
    this.resetCache();
    this._cache.dayKey = key;
  }

  /**
   * @param {number | null | undefined} anchorUnix
   * @param {string} [dayYmd]
   */
  peekCache(anchorUnix, dayYmd, compBarsLen, sweepCount) {
    this.ensureDay(dayYmd);
    if (
      anchorUnix != null &&
      anchorUnix === this._cache.anchorUnix &&
      this._cache.sorted &&
      (compBarsLen == null || compBarsLen === this._cache.compBarsLen) &&
      (sweepCount == null || sweepCount === this._cache.sweepCount)
    ) {
      return this._cache.sorted;
    }
    return null;
  }

  /** @param {string} [dayYmd] */
  hasWarmCache(dayYmd) {
    this.ensureDay(dayYmd);
    return this._cache.sorted != null;
  }

  /**
   * All Setup #2 completions through replay anchor — one row per 15m tap cycle.
   * @param {Parameters<typeof buildLive>[0]} opts
   * @param {number} anchorUnix
   * @param {string} [dayYmd]
   */
  buildCompletedThroughAnchor(opts, anchorUnix, dayYmd) {
    this.ensureDay(dayYmd);

    const compBarsLen = opts.compBars1m?.length ?? 0;
    const sweepCount =
      opts.getSweepEvents?.().filter((s) => anchorUnix != null && s.time <= anchorUnix).length ?? 0;

    if (
      anchorUnix === this._cache.anchorUnix &&
      this._cache.sorted &&
      compBarsLen === this._cache.compBarsLen &&
      sweepCount === this._cache.sweepCount
    ) {
      return this._cache.sorted;
    }

    const bars1m = opts.bars1m ?? [];
    if (!bars1m.length || anchorUnix == null) {
      this._cache.anchorUnix = anchorUnix ?? -Infinity;
      this._cache.sorted = [];
      this._cache.compBarsLen = compBarsLen;
      this._cache.sweepCount = sweepCount;
      return [];
    }

    if (bars1m.length && !isSessionBarCacheWarm(bars1m)) warmSessionBarCache(bars1m);
    const { start: sessionDayStart } = Format.dayBounds(dayYmd);
    const tradingBounds = resolveSetupTradingWindowBounds({
      getDayYmd: () => dayYmd,
      getHasPpiNews: opts.getHasPpiNews,
      getCalendarEvents: opts.getCalendarEvents,
      getSetupTradingWindow: opts.getSetupTradingWindow,
    });
    const scanAnchor = capAnchorForSetupWindow(anchorUnix, tradingBounds);
    const rewound = anchorUnix < this._cache.anchorUnix;

    if (rewound) {
      this._cache.closedCycles.clear();
      this._cache.sorted = null;
    }

    beginAnchorAggPass();
    try {
      const sessionStart = bars1m[0]?.time ?? 0;
      const text = config("fvgTap");
      const fvgTapTf = primaryFvgTapTf(checklistItems("fvgTap"), text.fvgTapTf);
      const cycles = splitSetup2Cycles(bars1m, scanAnchor, sessionStart, fvgTapTf);
      /** @type {FvgTapSnapshot[]} */
      const hits = [];

      for (let i = 0; i < cycles.length; i++) {
        const cycle = cycles[i];
        const isActiveCycle = i === cycles.length - 1;
        const cycleEnd = Number.isFinite(cycle.end) ? cycle.end : anchorUnix + 60;
        const cycleClosed = Number.isFinite(cycle.end) && scanAnchor >= cycle.end - 60;
        if (dayYmd && cycleEnd <= sessionDayStart) continue;
        if (tradingBounds && cycleEnd <= tradingBounds.startUnix) continue;

        if (!isActiveCycle && this._cache.closedCycles.has(cycle.start)) {
          const cached = this._cache.closedCycles.get(cycle.start);
          if (cached) hits.push(cached);
          continue;
        }

        const hit = findCycleCompletion(
          opts,
          cycle,
          scanAnchor,
          sessionStart,
          dayYmd,
          tradingBounds,
        );
        if (hit) {
          const frozen = freezeFvgTapSnapshot(hit, { ...opts, tradingBounds }, scanAnchor);
          hits.push(frozen);
          if (!isActiveCycle && cycleClosed) this._cache.closedCycles.set(cycle.start, frozen);
        } else if (!isActiveCycle && cycleClosed) {
          this._cache.closedCycles.set(cycle.start, null);
        }
      }

      this._cache.anchorUnix = anchorUnix;
      this._cache.compBarsLen = compBarsLen;
      this._cache.sweepCount = sweepCount;
      this._cache.sorted = hits.sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
      return this._cache.sorted;
    } finally {
      endAnchorAggPass();
    }
  }
}

const defaultFvgTapHistory = new FvgTapHistory();

export const resetHistoryCache = () => defaultFvgTapHistory.resetCache();
export const peek = (...a) => defaultFvgTapHistory.peekCache(...a);
export const peekCache = peek;
export const warm = (...a) => defaultFvgTapHistory.hasWarmCache(...a);
export const through = (...a) => defaultFvgTapHistory.buildCompletedThroughAnchor(...a);

/** @deprecated */
export const resetSetup2HistoryCache = resetHistoryCache;
export const peekCompletedSetups2Cache = peek;
export const hasSetup2HistoryWarmCache = warm;
export const buildCompletedSetups2ThroughAnchor = through;
