import { replayContextFromSweeps, sliceBarsThroughAnchor } from "../../levels/levelsCalc.js";
import {
  buildHtfFvgTapEvents,
  enrichWithFvgTaps,
  latestQualifyingFvgTap,
  fvgTapsForBias,
} from "../../confluence/fvgTapContext.js";
import { buildInternalSweepEvents, enrichWithInternalSweeps } from "../../confluence/internalSweepContext.js";
import { enrichWithIfvg } from "../../confluence/ifvgContext.js";
import { makeSetupState } from "../setupContext.js";
import {
  beginAnchorAggPass,
  endAnchorAggPass,
  isSessionBarCacheWarm,
  warmSessionBarCache,
} from "../../session/sessionBarCache.js";
import { Format } from "../../utils/format.js";
import {
  capAnchorForSetupWindow,
  filterConfluencesForSetupWindow,
  filterSweepsForSetupWindow,
  floorRegimeStartForSetupWindow,
  isSetupEntryAllowed,
  isWithinSetupTradingWindow,
  resolveSetupTradingWindowBounds,
  setupEntryPreviewHint,
  setupTradingWindowPhase,
} from "../setupTradingWindow.js";
import { ppiDayHtfRequirementMet, releaseDaySetupHint } from "../../confluence/ppiNews.js";
import {
  enableSetup1Profile,
  getSetup1Profile,
  profileAdd,
  profileInc,
  profileOn,
  profilePushEra,
  resetSetup1Profile,
} from "../../core/setupProfile.js";
import { config, checklist as checklistItems } from "./engineConfig.js";
import { buildChecklistRows, idleChecklistRows } from "../setupChecklist.js";
import { ifvgQualifyRulesMerged, resolveIfvgQualifyRules } from "../setupIfvgMerge.js";
import { internalSweepStepOpts } from "../setupInternalSweep.js";
import { applySetupConfluenceFreshness } from "../setupFreshness.js";
import { htfSweepFreshMaxSec, resolveInternalSweepTf } from "../setupSweep.js";
import { primaryFvgTapTf } from "../setupFvgTap.js";
import { htfFlowStepDone } from "../checklistStepDone.js";

const SLUG = "htfSweep";
const SETUP_ID = 1;

function buildChecklist(ctx) {
  const text = config(SLUG);
  const items = checklistItems(SLUG);
  const rows = buildChecklistRows(text, items, (step) => htfFlowStepDone(step, ctx, items), {
    bias: ctx.bias,
    closeLabel: ctx.closeLabel,
  });
  return makeSetupState(text.label, rows);
}

function buildIdle(biasHint) {
  const text = config(SLUG);
  const items = checklistItems(SLUG);
  const hint = biasHint ?? text.completeIdleHint;
  return {
    ...makeSetupState(text.label, idleChecklistRows(text, items, { bias: "—" })),
    bias: "—",
    biasHint: hint,
    completedAt: null,
    htfSweeps: [],
    fvgTaps: [],
    internalSweeps: [],
    recentIfvg: null,
  };
}

/**
 * Drop stale confluences before replay tip; recompute setup flags.
 * @param {object} ctx
 * @param {number | null | undefined} anchorUnix
 * @param {{ htfFreshMaxSec?: number | null }} [opts]
 */
function applyConfluenceFreshness(ctx, anchorUnix, opts = {}, chartTf) {
  return applySetupConfluenceFreshness(ctx, anchorUnix, SLUG, chartTf, opts);
}

/**
 * @param {{
 *   getSweepEvents: () => import("./levelsCalc.js").HtfSweepEvent[];
 *   getRaw1m: () => { time: number; high: number; low: number; close: number }[];
 *   getAnchorUnix: () => number | null | undefined;
 * }} opts
 * @param {import("./levelsCalc.js").HtfSweepEvent[]} sweepEvents
 * @param {number} [regimeStartOverride]
 * @param {number} [anchorOverride] — cap confluence scan (e.g. freeze completed setups at entry)
 * @param {{ skipFreshness?: boolean }} [options]
 */
function buildHtfFvgTapEventsMemo(raw1m, anchorUnix, regimeStart, tfKey, setupId = SETUP_ID) {
  const t0 = profileOn() ? performance.now() : 0;
  if (!engine._fvgTapBuildMemo) {
    const out = buildHtfFvgTapEvents(raw1m, anchorUnix, regimeStart, tfKey, setupId);
    if (profileOn()) {
      profileAdd("fvgTapMs", performance.now() - t0);
      profileInc("fvgTapMemoMisses");
    }
    return out;
  }
  const key = `${setupId}:${tfKey}:${regimeStart}:${anchorUnix}`;
  let hit = engine._fvgTapBuildMemo.get(key);
  if (!hit) {
    hit = buildHtfFvgTapEvents(raw1m, anchorUnix, regimeStart, tfKey, setupId);
    engine._fvgTapBuildMemo.set(key, hit);
    if (profileOn()) profileInc("fvgTapMemoMisses");
  } else if (profileOn()) {
    profileInc("fvgTapMemoHits");
  }
  if (profileOn()) profileAdd("fvgTapMs", performance.now() - t0);
  return hit;
}

/** Pivots may form on the FVG approach bar just before the qualifying tap (see setup JSON `pivot_lookback`). */
function internalSweepBuildOpts(items, hasQualifyingTap, chartTf) {
  return internalSweepStepOpts(items, chartTf, { hasQualifyingTap });
}

/** @param {{ anchorTap?: { time: number } | null; internalSweeps?: Array<{ time: number }> }} ctx */
function setup1CycleInternalSweeps(ctx) {
  const tapTime = ctx.anchorTap?.time;
  if (tapTime == null || !Number.isFinite(tapTime)) return ctx.internalSweeps ?? [];
  return (ctx.internalSweeps ?? []).filter((s) => s.time >= tapTime);
}

function buildInternalSweepEventsMemo(raw1m, anchorUnix, internalStart, bias, internalOpts, internalTf) {
  const t0 = profileOn() ? performance.now() : 0;
  if (!engine._internalSweepBuildMemo) {
    const out = buildInternalSweepEvents(raw1m, anchorUnix, internalTf, internalStart, bias, internalOpts);
    if (profileOn()) {
      profileAdd("internalSweepMs", performance.now() - t0);
      profileInc("internalSweepMemoMisses");
    }
    return out;
  }
  const key = `${internalTf}:${internalStart}:${anchorUnix}:${bias}:${internalOpts?.allowPivotLookbackSec ?? 0}:${internalOpts?.pivotLeft ?? 1}:${internalOpts?.pivotRight ?? 1}`;
  let hit = engine._internalSweepBuildMemo.get(key);
  if (!hit) {
    hit = buildInternalSweepEvents(raw1m, anchorUnix, internalTf, internalStart, bias, internalOpts);
    engine._internalSweepBuildMemo.set(key, hit);
    if (profileOn()) profileInc("internalSweepMemoMisses");
  } else if (profileOn()) {
    profileInc("internalSweepMemoHits");
  }
  if (profileOn()) profileAdd("internalSweepMs", performance.now() - t0);
  return hit;
}

function tradingWindowIdleHint(bounds, phase) {
  if (!bounds || !phase || phase === "in") return "Setup complete — waiting for new HTF sweep";
  if (phase === "before") {
    return `Setup window opens at ${bounds.startLabel} ET`;
  }
  return `Setup window closed (${bounds.startLabel}–${bounds.endLabel} ET)`;
}

/** @param {object} ctx @param {boolean} hasPpiNews @param {number | null | undefined} anchorUnix @param {string | undefined} dayYmd */
function applyPpiDayHtfGate(ctx, hasPpiNews, anchorUnix, dayYmd, releaseDayKind) {
  if (ppiDayHtfRequirementMet(hasPpiNews, ctx.htfSweeps, anchorUnix, dayYmd)) return ctx;
  return {
    ...ctx,
    bias: "—",
    biasHint: releaseDaySetupHint(releaseDayKind),
    recentSweep: null,
    htfSweeps: [],
    htfSweepDone: false,
    fvgTaps: [],
    fvgTapped: false,
    internalSweeps: [],
    recentIfvg: null,
    ifvgDone: false,
    closedAbove15m: false,
    closedAbove15mTime: null,
  };
}

function enrichSetupContext(opts, sweepEvents, regimeStartOverride, anchorOverride, options) {
  const t0 = profileOn() ? performance.now() : 0;
  const bounds = resolveSetupTradingWindowBounds(opts);
  const rawAnchor = anchorOverride ?? opts.getAnchorUnix();
  const previewBeforeWindow = options?.previewBeforeWindow === true;
  const anchorUnix = previewBeforeWindow
    ? rawAnchor
    : capAnchorForSetupWindow(rawAnchor, bounds);
  const items = checklistItems(SLUG);
  const htfFreshMaxSec = options?.skipFreshness ? null : htfSweepFreshMaxSec(items, opts.getTf?.());
  const sweepCtx = replayContextFromSweeps(sweepEvents, anchorUnix, {
    ...options,
    freshMaxSec: htfFreshMaxSec,
  });
  let regimeStart = regimeStartOverride ?? sweepCtx.htfSweeps[0]?.time ?? Infinity;
  if (bounds && !previewBeforeWindow) {
    regimeStart = floorRegimeStartForSetupWindow(regimeStart, bounds);
  }
  const raw1m = opts.getRaw1m();
  const text = config(SLUG);
  const fvgTapTf = primaryFvgTapTf(items, text.fvgTapTf);
  const internalTf = resolveInternalSweepTf(items, text.internalTf, opts.getTf?.());
  const fvgTapEvents = engine._fvgTapBuildMemo
    ? buildHtfFvgTapEventsMemo(raw1m, anchorUnix, regimeStart, fvgTapTf)
    : buildHtfFvgTapEvents(raw1m, anchorUnix, regimeStart, fvgTapTf);
  const tapCtx = enrichWithFvgTaps(sweepCtx, fvgTapEvents);
  const anchorTap = latestQualifyingFvgTap(tapCtx.fvgTaps, sweepCtx.bias);
  const tapTime = anchorTap?.time ?? Infinity;
  const hasQualifyingTap = anchorTap != null && Number.isFinite(tapTime);
  const internalStart = hasQualifyingTap ? tapTime : regimeStart;
  const internalOpts = internalSweepBuildOpts(items, hasQualifyingTap, opts.getTf?.());
  const internalEvents = engine._internalSweepBuildMemo
    ? buildInternalSweepEventsMemo(raw1m, anchorUnix, internalStart, sweepCtx.bias, internalOpts, internalTf)
    : buildInternalSweepEvents(raw1m, anchorUnix, internalTf, internalStart, sweepCtx.bias, internalOpts);

  let ctx = { ...tapCtx, anchorTap: anchorTap ?? null };
  ctx = enrichWithInternalSweeps(ctx, internalEvents);
  const tIfvg = profileOn() ? performance.now() : 0;
  const ifvgQualify = resolveIfvgQualifyRules(
    ifvgQualifyRulesMerged(items, SETUP_ID),
    opts.getTf?.(),
  );
  ctx = enrichWithIfvg(
    ctx,
    opts.getRaw1m(),
    anchorUnix,
    regimeStart,
    ifvgQualify,
    SETUP_ID,
    opts.getCompBars1m?.(),
  );
  if (profileOn()) profileAdd("ifvgEnrichMs", performance.now() - tIfvg);
  if (bounds && !previewBeforeWindow) {
    ctx = {
      ...ctx,
      htfSweeps: filterConfluencesForSetupWindow(ctx.htfSweeps, bounds),
      fvgTaps: filterConfluencesForSetupWindow(ctx.fvgTaps, bounds),
      internalSweeps: filterConfluencesForSetupWindow(ctx.internalSweeps, bounds),
    };
    if (ctx.recentIfvg && !isWithinSetupTradingWindow(ctx.recentIfvg.time, bounds)) {
      ctx = { ...ctx, recentIfvg: null, ifvgDone: false };
    }
  }
  const hasReleaseNews = opts.getHasPpiNews?.() === true;
  const releaseDayKind = opts.getReleaseDayKind?.() ?? null;
  const dayYmd = opts.getDayYmd?.();
  const freshCtx = options?.skipFreshness
    ? ctx
    : applyConfluenceFreshness(ctx, anchorUnix, { htfFreshMaxSec }, opts.getTf?.());
  if (previewBeforeWindow) {
    if (profileOn()) profileAdd("enrichSetupContextMs", performance.now() - t0);
    return freshCtx;
  }
  const out = applyPpiDayHtfGate(freshCtx, hasReleaseNews, anchorUnix, dayYmd, releaseDayKind);
  if (profileOn()) profileAdd("enrichSetupContextMs", performance.now() - t0);
  return out;
}

/**
 * @param {{
 *   getSweepEvents: () => import("./levelsCalc.js").HtfSweepEvent[];
 *   getRaw1m: () => { time: number; high: number; low: number; close: number }[];
 *   getAnchorUnix: () => number | null | undefined;
 * }} opts
 * @param {import("./levelsCalc.js").HtfSweepEvent[]} [sweepEvents]
 * @param {number} [regimeStartOverride]
 * @param {number} [anchorOverride]
 * @param {{ skipFreshness?: boolean }} [options]
 */
function computeSetup1StateImpl(
  opts,
  sweepEvents = opts.getSweepEvents(),
  regimeStartOverride,
  anchorOverride,
  options,
) {
  const bounds = resolveSetupTradingWindowBounds(opts);
  const rawAnchor = anchorOverride ?? opts.getAnchorUnix();
  const phase = setupTradingWindowPhase(rawAnchor, bounds);
  if (phase === "after") {
    const idle = buildIdle(tradingWindowIdleHint(bounds, phase));
    return { ctx: { bias: "—", biasHint: idle.biasHint, htfSweeps: [], fvgTaps: [], internalSweeps: [], recentIfvg: null }, setup1: idle };
  }

  const previewBeforeWindow = phase === "before";
  const sweepsForCtx = previewBeforeWindow
    ? sweepEvents.filter((s) => rawAnchor == null || s.time <= rawAnchor)
    : filterSweepsForSetupWindow(sweepEvents, bounds, rawAnchor);
  const ctx = enrichSetupContext(opts, sweepsForCtx, regimeStartOverride, anchorOverride, {
    ...options,
    previewBeforeWindow,
  });
  const ctxForBuild = previewBeforeWindow
    ? { ...ctx, closedAbove15m: false, closedAbove15mTime: null }
    : ctx;
  const setup1Base = buildChecklist(ctxForBuild);
  const entryAllowed = isSetupEntryAllowed(rawAnchor, bounds);
  const setup1 = {
    ...setup1Base,
    bias: ctx.bias,
    biasHint: previewBeforeWindow
      ? `${ctx.biasHint}${setupEntryPreviewHint(bounds)}`
      : ctx.biasHint,
    complete: entryAllowed && setup1Base.complete,
    completedAt:
      entryAllowed && setup1Base.complete ? ctx.closedAbove15mTime ?? null : null,
    htfSweeps: ctx.htfSweeps,
    fvgTaps: ctx.anchorTap
      ? fvgTapsForBias(ctx.fvgTaps, ctx.bias).filter((t) => t.time >= ctx.anchorTap.time)
      : fvgTapsForBias(ctx.fvgTaps, ctx.bias),
    internalSweeps: setup1CycleInternalSweeps(ctx),
    recentIfvg: ctx.recentIfvg,
    anchorTap: ctx.anchorTap ?? null,
  };
  return { ctx, setup1 };
}

/**
 * After completion, show neutral + empty checklist until a new HTF sweep starts the next cycle.
 * @param {{ setup1: ReturnType<typeof computeSetup1State>["setup1"] }} raw
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 */
function latestCompletedAtFromHistory(history) {
  const last = history.length ? history[history.length - 1] : null;
  return last?.completedAt ?? null;
}

function applySetupCycleReset(raw, opts, dayYmd, completedHistory) {
  const anchorUnix = opts.getAnchorUnix();
  const { setup1 } = raw;
  if (anchorUnix == null) return setup1;

  const completedAt =
    setup1.complete && setup1.completedAt != null
      ? setup1.completedAt
      : latestCompletedAtFromHistory(
          completedHistory ?? buildCompletedSetupsThroughAnchorImpl(opts, anchorUnix, dayYmd),
        );

  if (completedAt == null) return setup1;
  if (anchorUnix < completedAt) return setup1;

  const newSweeps = opts.getSweepEvents().filter((s) => s.time > completedAt);
  if (!newSweeps.length) return buildIdle();

  return computeSetup1StateImpl(opts, newSweeps).setup1;
}

/**
 * @param {import("./levelsCalc.js").HtfSweepEvent[]} sweeps chronological through anchor
 * @returns {{ start: number; sweeps: import("./levelsCalc.js").HtfSweepEvent[] }[]}
 */
function splitBiasErasImpl(sweeps) {
  if (!sweeps.length) return [];
  /** @type {{ start: number; sweeps: import("./levelsCalc.js").HtfSweepEvent[] }[]} */
  const eras = [];
  let eraStart = 0;
  for (let i = 1; i <= sweeps.length; i++) {
    const nextKind = i < sweeps.length ? sweeps[i].kind : null;
    const curKind = sweeps[i - 1].kind;
    if (nextKind !== curKind || i === sweeps.length) {
      eras.push({
        start: sweeps[eraStart].time,
        sweeps: sweeps.slice(eraStart, i),
      });
      eraStart = i;
    }
  }
  return eras;
}

/** @typedef {ReturnType<typeof computeSetup1State>["setup1"]} HtfSweepSnapshot */

export class HtfSweepEngine {
  constructor() {
    /** @type {{ dayKey: string; anchorUnix: number; sweepCount: number; closedEras: Map<number, HtfSweepSnapshot[] | null>; byEntry: Map<string, HtfSweepSnapshot>; sorted: HtfSweepSnapshot[] | null; activeEraScan: { eraStart: number; hits: HtfSweepSnapshot[]; scannedThrough: number } | null }} */
    this._completedCache = {
      dayKey: "",
      anchorUnix: -Infinity,
      sweepCount: 0,
      closedEras: new Map(),
      byEntry: new Map(),
      sorted: null,
      activeEraScan: null,
    };
    /** @type {Map<string, ReturnType<typeof computeSetup1State>> | null} */
    this._setup1AtAnchorMemo = null;
    /** @type {Map<string, ReturnType<typeof buildHtfFvgTapEvents>> | null} */
    this._fvgTapBuildMemo = null;
    /** @type {Map<string, ReturnType<typeof buildInternalSweepEvents>> | null} */
    this._internalSweepBuildMemo = null;
  }

  resetHistoryCache() {
    const c = this._completedCache;
    c.dayKey = "";
    c.anchorUnix = -Infinity;
    c.sweepCount = 0;
    c.closedEras.clear();
    c.byEntry.clear();
    c.sorted = null;
    c.activeEraScan = null;
  }

  computeSetup1State(...a) {
    return computeSetup1StateImpl(...a);
  }
  splitBiasEras(...a) {
    return splitBiasErasImpl(...a);
  }
  peekCompletedSetupsCache(...a) {
    return peekCompletedSetupsCacheImpl(...a);
  }
  hasSetupHistoryWarmCache(...a) {
    return hasSetupHistoryWarmCacheImpl(...a);
  }
  buildCompletedSetupsThroughAnchor(...a) {
    return buildCompletedSetupsThroughAnchorImpl(...a);
  }
  buildReplayContextState(...a) {
    return buildReplayContextStateImpl(...a);
  }
}

const engine = new HtfSweepEngine();
const completedCache = engine._completedCache;

/**
 * @param {number | null | undefined} anchorUnix
 * @param {string} [dayYmd]
 * @param {number} [sweepCount] — when provided, cache must match current HTF sweep count
 */
function peekCompletedSetupsCacheImpl(anchorUnix, dayYmd, sweepCount) {
  ensureCompletedCacheDay(dayYmd);
  if (
    anchorUnix != null &&
    anchorUnix === completedCache.anchorUnix &&
    completedCache.sorted &&
    (sweepCount == null || sweepCount === completedCache.sweepCount)
  ) {
    return completedCache.sorted;
  }
  return null;
}

/** @param {string} [dayYmd] */
function hasSetupHistoryWarmCacheImpl(dayYmd) {
  ensureCompletedCacheDay(dayYmd);
  return completedCache.sorted != null;
}

function resetSetupHistoryCacheImpl() {
  engine.resetHistoryCache();
}

/**
 * @param {string} [dayYmd]
 */
function ensureCompletedCacheDay(dayYmd) {
  const key = dayYmd || "";
  if (!key || key === completedCache.dayKey) return;
  resetSetupHistoryCacheImpl();
  completedCache.dayKey = key;
}

/**
 * @param {HtfSweepSnapshot} setup1
 * @param {number} eraStart
 * @param {number} eraEnd
 * @param {number} anchorUnix
 */
function eraCompletionInWindow(setup1, eraStart, eraEnd, anchorUnix, sessionYmd, tradingBounds, hasPpiNews) {
  const at = setup1.completedAt;
  if (!setup1.complete || at == null) return null;
  if (at > anchorUnix || at < eraStart || at >= eraEnd) return null;
  if (sessionYmd && !Format.isSessionDay(at, sessionYmd)) return null;
  if (tradingBounds && !isWithinSetupTradingWindow(at, tradingBounds)) return null;
  if (!ppiDayHtfRequirementMet(hasPpiNews, setup1.htfSweeps, at, sessionYmd)) return null;
  return setup1;
}

/**
 * @param {HtfSweepSnapshot} setup1
 * @param {string} [sessionYmd]
 */
function historyKey(setup1) {
  return `${setup1.bias}:${setup1.completedAt}:${setup1.anchorTap?.time ?? ""}`;
}

function rememberCompletedSetup(setup1, sessionYmd, tradingBounds, hasPpiNews) {
  const at = setup1.completedAt;
  if (at == null) return;
  if (sessionYmd && !Format.isSessionDay(at, sessionYmd)) return;
  if (tradingBounds && !isWithinSetupTradingWindow(at, tradingBounds)) return;
  if (!ppiDayHtfRequirementMet(hasPpiNews, setup1.htfSweeps, at, sessionYmd)) return;
  completedCache.byEntry.set(historyKey(setup1), setup1);
}

/**
 * Completed setups must not pick up confluences that fired after entry.
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 * @param {import("./levelsCalc.js").HtfSweepEvent[]} eraSweeps
 * @param {number} regimeStart
 * @param {HtfSweepSnapshot} liveSetup
 * @param {number} anchorUnix
 */
function freezeCompletedSetupSnapshot(opts, eraSweeps, regimeStart, liveSetup, anchorUnix) {
  const at = liveSetup.completedAt;
  if (at == null) return liveSetup;
  if (anchorUnix <= at) return liveSetup;
  return computeSetup1StateImpl(opts, eraSweeps, regimeStart, at, { skipFreshness: true }).setup1;
}

/** @param {number} unix */
function historyDbgTime(unix) {
  if (unix == null || !Number.isFinite(unix)) return String(unix);
  try {
    return new Date(unix * 1000).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(unix);
  }
}

function historyDebugEnabled() {
  return typeof globalThis !== "undefined" && globalThis.__SETUP_HISTORY_DEBUG__ !== false;
}

/**
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 * @param {import("./levelsCalc.js").HtfSweepEvent[]} sweeps
 * @param {number} regimeStart
 * @param {number} barTime
 */
function computeSetup1StateMemo(opts, sweeps, regimeStart, barTime) {
  if (!engine._setup1AtAnchorMemo) engine._setup1AtAnchorMemo = new Map();
  const key = `${regimeStart}:${barTime}:${sweeps.length}`;
  let hit = engine._setup1AtAnchorMemo.get(key);
  if (hit) {
    if (profileOn()) profileInc("setup1MemoHits");
    return hit;
  }
  const t0 = profileOn() ? performance.now() : 0;
  hit = computeSetup1StateImpl(opts, sweeps, regimeStart, barTime, { skipFreshness: true });
  if (profileOn()) {
    profileInc("setup1MemoMisses");
    profileInc("computeSetup1StateCalls");
    profileAdd("computeSetup1StateMs", performance.now() - t0);
  }
  engine._setup1AtAnchorMemo.set(key, hit);
  return hit;
}

/**
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 * @param {{ start: number; sweeps: import("./levelsCalc.js").HtfSweepEvent[] }} era
 * @param {number} barTime
 * @param {number} eraEnd
 * @param {number} anchorUnix
 */
function setup1CompleteAtBar(opts, era, barTime, eraEnd, anchorUnix, sessionYmd, tradingBounds, hasPpiNews) {
  const t0 = profileOn() ? performance.now() : 0;
  if (profileOn()) profileInc("setup1CompleteAtBarCalls");
  const { setup1 } = computeSetup1StateMemo(opts, era.sweeps, era.start, barTime);
  const out = eraCompletionInWindow(setup1, era.start, eraEnd, anchorUnix, sessionYmd, tradingBounds, hasPpiNews);
  if (profileOn()) profileAdd("setup1CompleteAtBarMs", performance.now() - t0);
  return out;
}

/**
 * @param {HtfSweepSnapshot[]} hits
 * @param {HtfSweepSnapshot} hit
 */
function mergeSetup1Hit(hits, hit) {
  if (hit.completedAt == null) return hits;
  const key = historyKey(hit);
  if (hits.some((h) => historyKey(h) === key)) return hits;
  return [...hits, hit];
}

/**
 * HTF sweeps that may open a Setup #1 cycle after a prior entry.
 * @param {import("./levelsCalc.js").HtfSweepEvent[]} eraSweeps
 * @param {number | null} priorCompletedAt
 */
function setup1CycleSweepsAfter(eraSweeps, priorCompletedAt) {
  const after = priorCompletedAt ?? -Infinity;
  return eraSweeps.filter((s) => s.time > after);
}

/**
 * All Setup #1 completions in era — one row per HTF-sweep cycle (new sweep required after each entry).
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 * @param {{ start: number; sweeps: import("./levelsCalc.js").HtfSweepEvent[] }} era
 * @param {number} eraEnd
 * @param {number} anchorUnix
 * @param {number} [scanFrom] — resume incremental scan (active era only)
 * @param {{ cycleSweeps?: import("./levelsCalc.js").HtfSweepEvent[]; priorCompletedAt?: number | null }} [resume]
 */
function findAllEraCompletions(
  opts,
  era,
  eraEnd,
  anchorUnix,
  sessionYmd,
  tradingBounds,
  scanFrom = era.start,
  resume,
  eraIndex = -1,
) {
  const tEra0 = profileOn() ? performance.now() : 0;
  const cappedAnchor = capAnchorForSetupWindow(anchorUnix, tradingBounds);
  const end = Math.min(
    cappedAnchor,
    Number.isFinite(eraEnd) ? eraEnd - 60 : cappedAnchor,
  );

  let lastCompletedAt = resume?.priorCompletedAt ?? null;
  let cycleSweeps = resume?.cycleSweeps ?? setup1CycleSweepsAfter(era.sweeps, lastCompletedAt);

  let cycleStart = cycleSweeps[0]?.time ?? era.start;
  let regimeStart = tradingBounds
    ? floorRegimeStartForSetupWindow(cycleStart, tradingBounds)
    : cycleStart;
  let from = Math.max(regimeStart, scanFrom);

  const bars = sliceBarsThroughAnchor(opts.getRaw1m(), end).filter(
    (b) => b.time >= from && b.time <= end,
  );

  /** @type {HtfSweepSnapshot[]} */
  let hits = [];
  for (const bar of bars) {
    if (profileOn()) profileInc("barIterations");
    if (bar.time < from) continue;
    if (!cycleSweeps.length) break;

    const cycleEra = { start: cycleStart, sweeps: cycleSweeps };
    const hit = setup1CompleteAtBar(
      opts,
      cycleEra,
      bar.time,
      eraEnd,
      cappedAnchor,
      sessionYmd,
      tradingBounds,
      opts.getHasPpiNews?.() === true,
    );
    if (!hit) continue;

    hits = mergeSetup1Hit(hits, hit);
    lastCompletedAt = hit.completedAt ?? lastCompletedAt;
    cycleSweeps = setup1CycleSweepsAfter(era.sweeps, lastCompletedAt);
    if (!cycleSweeps.length) break;

    cycleStart = cycleSweeps[0].time;
    regimeStart = tradingBounds
      ? floorRegimeStartForSetupWindow(cycleStart, tradingBounds)
      : cycleStart;
    from = (hit.completedAt ?? bar.time) + 60;
  }

  if (profileOn()) {
    const eraMs = performance.now() - tEra0;
    profileAdd("findAllEraMs", eraMs);
    profilePushEra({ era: eraIndex, bars: bars.length, hits: hits.length, ms: eraMs });
  }

  return {
    hits,
    cycleSweeps,
    priorCompletedAt: lastCompletedAt,
    scannedThrough: end,
  };
}

/**
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 * @param {{ start: number; sweeps: import("./levelsCalc.js").HtfSweepEvent[] }} era
 * @param {HtfSweepSnapshot[]} hits
 * @param {number} anchorUnix
 */
function freezeEraSetupHits(opts, era, hits, anchorUnix) {
  /** @type {number | null} */
  let prevCompleted = null;
  return hits.map((hit) => {
    const cycleSweeps = setup1CycleSweepsAfter(era.sweeps, prevCompleted);
    const regimeStart = cycleSweeps[0]?.time ?? era.start;
    prevCompleted = hit.completedAt ?? prevCompleted;
    return freezeCompletedSetupSnapshot(opts, cycleSweeps, regimeStart, hit, anchorUnix);
  });
}

/**
 * All Setup #1 completions visible through replay anchor — one row per entry candle.
 * Closed bias eras are cached; only the active era is recomputed on each forward step.
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 * @param {number} anchorUnix
 * @param {string} [dayYmd]
 */
function buildCompletedSetupsThroughAnchorImpl(opts, anchorUnix, dayYmd) {
  ensureCompletedCacheDay(dayYmd);
  engine._setup1AtAnchorMemo = new Map();
  engine._fvgTapBuildMemo = new Map();
  engine._internalSweepBuildMemo = new Map();

  const sweeps = opts.getSweepEvents().filter((s) => s.time <= anchorUnix);

  if (
    anchorUnix === completedCache.anchorUnix &&
    sweeps.length === completedCache.sweepCount &&
    completedCache.sorted
  ) {
    return completedCache.sorted;
  }

  const raw1m = opts.getRaw1m();
  if (raw1m?.length && !isSessionBarCacheWarm(raw1m)) {
    const tWarm = profileOn() ? performance.now() : 0;
    warmSessionBarCache(raw1m);
    if (profileOn()) profileAdd("warmCacheMs", performance.now() - tWarm);
  }
  const { start: sessionDayStart } = Format.dayBounds(dayYmd);
  const hasPpiNews = opts.getHasPpiNews?.() === true;
  const tradingBounds = resolveSetupTradingWindowBounds({
    getDayYmd: () => dayYmd,
    getHasPpiNews: opts.getHasPpiNews,
    getCalendarEvents: opts.getCalendarEvents,
    getSetupTradingWindow: opts.getSetupTradingWindow,
  });
  const scanAnchor = capAnchorForSetupWindow(anchorUnix, tradingBounds);
  beginAnchorAggPass();
  try {
  const eras = splitBiasErasImpl(sweeps);

  const rewound = anchorUnix < completedCache.anchorUnix || sweeps.length < completedCache.sweepCount;
  const steppedForward =
    !rewound &&
    anchorUnix > completedCache.anchorUnix &&
    sweeps.length === completedCache.sweepCount &&
    completedCache.sorted != null;

  if (rewound) {
    completedCache.closedEras.clear();
    completedCache.byEntry.clear();
    completedCache.sorted = null;
    completedCache.activeEraScan = null;
  }

  if (historyDebugEnabled()) {
    console.log("[setupHistory] scan", {
      anchor: historyDbgTime(anchorUnix),
      sweepCount: sweeps.length,
      eras: eras.map((e, i) => ({
        i,
        start: historyDbgTime(e.start),
        end: i + 1 < eras.length ? historyDbgTime(eras[i + 1].start) : "∞",
        sweeps: e.sweeps.length,
        kinds: e.sweeps.map((s) => s.label).join(" | "),
      })),
    });
  }

  for (let i = 0; i < eras.length; i++) {
    const era = eras[i];
    const eraEnd = i + 1 < eras.length ? eras[i + 1].start : Infinity;
    const isActiveEra = i === eras.length - 1;
    if (profileOn()) profileInc("eraCount");

    if (dayYmd && eraEnd <= sessionDayStart) continue;
    if (tradingBounds && eraEnd <= tradingBounds.startUnix) continue;

    const eraClosed = Number.isFinite(eraEnd) && scanAnchor >= eraEnd - 60;

    if (steppedForward && !isActiveEra) {
      if (completedCache.closedEras.has(era.start)) {
        const cached = completedCache.closedEras.get(era.start);
        if (Array.isArray(cached)) {
          for (const hit of cached) rememberCompletedSetup(hit, dayYmd, tradingBounds, hasPpiNews);
          continue;
        }
      }
    }

    if (!isActiveEra && completedCache.closedEras.has(era.start)) {
      const cached = completedCache.closedEras.get(era.start);
      if (Array.isArray(cached)) {
        for (const hit of cached) rememberCompletedSetup(hit, dayYmd, tradingBounds, hasPpiNews);
        if (historyDebugEnabled()) {
          console.log("[setupHistory] era cache hit", {
            era: historyDbgTime(era.start),
            entries: cached.map((h) => historyDbgTime(h.completedAt)),
          });
        }
        continue;
      }
    }

    const prevScan =
      steppedForward && isActiveEra
        ? null
        : isActiveEra && completedCache.activeEraScan?.eraStart === era.start
          ? completedCache.activeEraScan
          : null;
    const scanFrom = prevScan ? prevScan.scannedThrough + 60 : era.start;
    /** @type {HtfSweepSnapshot[]} */
    let hits = prevScan ? [...(prevScan.hits ?? [])] : [];
    const lastHit = hits.length ? hits[hits.length - 1] : null;
    const eraScan = findAllEraCompletions(
      opts,
      era,
      eraEnd,
      scanAnchor,
      dayYmd,
      tradingBounds,
      scanFrom,
      prevScan
        ? {
            cycleSweeps: prevScan.cycleSweeps,
            priorCompletedAt: lastHit?.completedAt ?? null,
          }
        : undefined,
      i,
    );
    for (const hit of eraScan.hits) hits = mergeSetup1Hit(hits, hit);

    if (isActiveEra) {
      completedCache.activeEraScan = {
        eraStart: era.start,
        hits,
        scannedThrough: eraScan.scannedThrough,
        cycleSweeps: eraScan.cycleSweeps,
        priorCompletedAt: eraScan.priorCompletedAt,
      };
    }

    if (historyDebugEnabled()) {
      console.log("[setupHistory] era compute", {
        era: historyDbgTime(era.start),
        hits: hits.map((h) => historyDbgTime(h.completedAt)),
      });
    }

    if (hits.length) {
      const tFreeze = profileOn() ? performance.now() : 0;
      const frozenHits = freezeEraSetupHits(opts, era, hits, anchorUnix);
      if (profileOn()) profileAdd("freezeEraMs", performance.now() - tFreeze);
      for (const frozen of frozenHits) {
        rememberCompletedSetup(frozen, dayYmd, tradingBounds, hasPpiNews);
      }
      if (!isActiveEra && eraClosed) {
        completedCache.closedEras.set(era.start, frozenHits);
      }
    } else if (!isActiveEra && eraClosed) {
      completedCache.closedEras.set(era.start, []);
    }
  }

  completedCache.anchorUnix = anchorUnix;
  completedCache.sweepCount = sweeps.length;
  completedCache.sorted = [...completedCache.byEntry.values()].sort(
    (a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0),
  );

  if (historyDebugEnabled()) {
    console.log("[setupHistory] result", completedCache.sorted.map((s) => ({
      entry: historyDbgTime(s.completedAt),
      bias: s.bias,
      htf: s.htfSweeps?.[0]?.label,
    })));
  }

  return completedCache.sorted;
  } finally {
    engine._fvgTapBuildMemo = null;
    engine._internalSweepBuildMemo = null;
    engine._setup1AtAnchorMemo = null;
    endAnchorAggPass();
  }
}

if (typeof globalThis !== "undefined") {
  globalThis.__SETUP_HISTORY_DEBUG__ = globalThis.__SETUP_HISTORY_DEBUG__ ?? false;
  globalThis.debugSetupHistory = () => {
    globalThis.__SETUP_HISTORY_DEBUG__ = true;
    return "Reload or step replay — watch [setupHistory] logs";
  };
}

/**
 * Shared replay right-panel state through current anchor (resets after setup completes).
 * @param {Parameters<typeof computeSetup1State>[0]} opts
 * @param {string} [dayYmd]
 */
function buildReplayContextStateImpl(opts, dayYmd, completedHistory) {
  const anchorUnix = opts.getAnchorUnix();
  const history =
    completedHistory ??
    (anchorUnix != null ? buildCompletedSetupsThroughAnchorImpl(opts, anchorUnix, dayYmd) : []);
  const lastCompleted = latestCompletedAtFromHistory(history);

  let sweepEvents = opts.getSweepEvents();
  if (lastCompleted != null && anchorUnix != null && anchorUnix > lastCompleted) {
    sweepEvents = sweepEvents.filter((s) => s.time > lastCompleted);
    if (!sweepEvents.length) {
      const idle = buildIdle();
      return {
        ctx: {
          bias: "—",
          biasHint: idle.biasHint,
          htfSweeps: [],
          fvgTaps: [],
          internalSweeps: [],
          recentIfvg: null,
        },
        setup1: idle,
      };
    }
  }

  const raw = computeSetup1StateImpl(opts, sweepEvents);
  const setup1 = applySetupCycleReset(raw, opts, dayYmd, history);
  return { ctx: raw.ctx, setup1 };
}

export { enableProfile, getProfile, resetProfile, getEraDetails, enableSetup1Profile, getSetup1Profile, resetSetup1Profile, getSetup1EraDetails } from "../../core/setupProfile.js";

export const peek = (...a) => engine.peekCompletedSetupsCache(...a);
export const warm = (...a) => engine.hasSetupHistoryWarmCache(...a);
export const reset = () => engine.resetHistoryCache();
export const through = (...a) => engine.buildCompletedSetupsThroughAnchor(...a);
export const live = (opts, dayYmd, completed) =>
  engine.buildReplayContextState(opts, dayYmd, completed).setup1;
export const replayState = (...a) => engine.buildReplayContextState(...a);

export const computeSetup1State = (...a) => engine.computeSetup1State(...a);
export const splitBiasEras = (...a) => engine.splitBiasEras(...a);
export const peekCompletedSetupsCache = peek;
export const hasSetupHistoryWarmCache = warm;
export const resetSetupHistoryCache = reset;
export const resetSetup1HistoryCache = reset;
export const buildCompletedSetupsThroughAnchor = through;
export const buildReplayContextState = replayState;
