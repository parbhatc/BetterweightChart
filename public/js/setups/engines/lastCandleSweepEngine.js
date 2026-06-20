import { sliceBarsThroughAnchor } from "../../levels/levelsCalc.js";
import { buildLastCandleSweepCtx } from "../../confluence/lastCandleSweepContext.js";
import { makeSetupState } from "../setupContext.js";
import { buildChecklistRows, idleChecklistRows } from "../setupChecklist.js";
import { lastCandleSweepStepDone } from "../checklistStepDone.js";
import { config, checklist as checklistItems } from "./engineConfig.js";
import {
  capAnchorForSetupWindow,
  isSetupEntryAllowed,
  isWithinSetupTradingWindow,
  resolveSetupTradingWindowBounds,
  setupEntryPreviewHint,
  setupTradingWindowPhase,
} from "../setupTradingWindow.js";
import { Format } from "../../utils/format.js";
import { stepFreshMaxSec } from "../setupStepFresh.js";
import { CHECKLIST_STEP } from "../setupStepTypes.js";
import { lastCandleSweepTf } from "../setupLastCandleSweep.js";

const SLUG = "lastCandleSweep";

function buildChecklist(ctx) {
  const text = config(SLUG);
  const items = checklistItems(SLUG);
  const rows = buildChecklistRows(text, items, (step) => lastCandleSweepStepDone(step, ctx, items), {
    bias: ctx.bias,
    closeLabel: ctx.closeLabel,
  });
  return makeSetupState(text.label, rows);
}

function buildIdle(biasHint) {
  const text = config(SLUG);
  const items = checklistItems(SLUG);
  return {
    ...makeSetupState(text.label, idleChecklistRows(text, items, { bias: "—" })),
    bias: "—",
    biasHint: biasHint ?? text.idleHint,
    completedAt: null,
    lastCandleSweep: null,
    lastBar: null,
    sweepBar: null,
    entry: null,
  };
}

function tradingWindowIdleHint(bounds, phase) {
  if (phase === "before" && bounds) {
    return `Before ${bounds.startLabel} ET — preview only${setupEntryPreviewHint(bounds)}`;
  }
  if (phase === "after" && bounds) {
    return `After ${bounds.endLabel} ET — window closed`;
  }
  return null;
}

/**
 * @param {object} opts
 * @param {number | null | undefined} anchorUnix
 * @param {{ previewBeforeWindow?: boolean }} [options]
 */
function enrichCtx(opts, anchorUnix, options = {}) {
  const dayYmd = opts.getDayYmd?.();
  const chartTf = opts.getTf?.() ?? "1m";
  const raw1m = opts.getRaw1m?.() ?? [];
  const items = checklistItems(SLUG);
  const sweepTf = lastCandleSweepTf(items);
  const sweepAfterUnix = options.sweepAfterUnix ?? -Infinity;
  const ctx = buildLastCandleSweepCtx(raw1m, anchorUnix, dayYmd, sweepTf, chartTf, sweepAfterUnix);

  if (options.previewBeforeWindow) {
    return { ...ctx, closeAboveSweepDone: false, closeAboveSweepTime: null, entry: null };
  }

  const sweepMax = stepFreshMaxSec(items, CHECKLIST_STEP.LAST_CANDLE_SWEEP, chartTf);
  const entryMax = stepFreshMaxSec(items, CHECKLIST_STEP.CLOSE_ABOVE_SWEEP, chartTf);

  let lastCandleSweep = ctx.lastCandleSweep;
  if (lastCandleSweep && sweepMax != null && anchorUnix != null && anchorUnix - lastCandleSweep.time > sweepMax) {
    lastCandleSweep = null;
  }

  let entry = ctx.entry;
  if (entry && entryMax != null && anchorUnix != null && anchorUnix - entry.time > entryMax) {
    entry = null;
  }

  const closeAboveSweepDone = Boolean(entry);
  const closeAboveSweepTime = entry?.time ?? null;

  return {
    ...ctx,
    lastCandleSweep,
    lastCandleSweepDone: Boolean(lastCandleSweep),
    closeAboveSweepDone,
    closeAboveSweepTime,
    entry,
    lastBar: lastCandleSweep?.lastBar ?? ctx.lastBar ?? null,
    sweepBar: lastCandleSweep?.sweepBar ?? null,
    bias: lastCandleSweep ? ctx.bias : "—",
    biasHint: lastCandleSweep || ctx.lastBar ? ctx.biasHint : config(SLUG).idleHint,
  };
}

/**
 * @param {object} opts
 * @param {number | null | undefined} [anchorOverride]
 */
function computeState(opts, anchorOverride, options = {}) {
  const bounds = resolveSetupTradingWindowBounds(opts);
  const rawAnchor = anchorOverride ?? opts.getAnchorUnix?.();
  const phase = setupTradingWindowPhase(rawAnchor, bounds);

  if (phase === "after") {
    const idle = buildIdle(tradingWindowIdleHint(bounds, phase));
    return { ctx: idle, setup: idle };
  }

  const previewBeforeWindow = phase === "before";
  const ctx = enrichCtx(opts, rawAnchor, { previewBeforeWindow, sweepAfterUnix: options.sweepAfterUnix });
  const setupBase = buildChecklist(ctx);
  const entryAllowed = isSetupEntryAllowed(rawAnchor, bounds);

  const setup = {
    ...setupBase,
    bias: ctx.bias,
    biasHint: previewBeforeWindow ? `${ctx.biasHint}${setupEntryPreviewHint(bounds)}` : ctx.biasHint,
    complete: entryAllowed && setupBase.complete,
    completedAt: entryAllowed && setupBase.complete ? ctx.closeAboveSweepTime ?? null : null,
    lastCandleSweep: ctx.lastCandleSweep,
    lastBar: ctx.lastBar,
    sweepBar: ctx.sweepBar,
    entry: ctx.entry,
  };

  return { ctx, setup };
}

/** @typedef {ReturnType<typeof computeState>["setup"]} LastCandleSweepSnapshot */

function completionInWindow(setup, anchorUnix, sessionYmd, tradingBounds) {
  const at = setup.completedAt;
  if (!setup.complete || at == null) return null;
  if (at > anchorUnix) return null;
  if (sessionYmd && !Format.isSessionDay(at, sessionYmd)) return null;
  if (tradingBounds && !isWithinSetupTradingWindow(at, tradingBounds)) return null;
  return setup;
}

/** @param {LastCandleSweepSnapshot} setup */
function historyKey(setup) {
  return `${setup.bias}:${setup.completedAt}:${setup.sweepBar?.time ?? ""}`;
}

/**
 * @param {object} opts
 * @param {number} anchorUnix
 * @param {string} [dayYmd]
 */
function buildCompletedThroughAnchor(opts, anchorUnix, dayYmd) {
  const bounds = resolveSetupTradingWindowBounds(opts);
  const cappedAnchor = capAnchorForSetupWindow(anchorUnix, bounds);
  const end = cappedAnchor;
  const bars = sliceBarsThroughAnchor(opts.getRaw1m?.() ?? [], end);

  /** @type {LastCandleSweepSnapshot[]} */
  const hits = [];
  let sweepAfterUnix = -Infinity;
  let scanFrom = bars[0]?.time ?? 0;

  for (const bar of bars) {
    if (bar.time < scanFrom) continue;
    const { setup } = computeState(
      { ...opts, getAnchorUnix: () => bar.time },
      bar.time,
      { sweepAfterUnix },
    );
    const hit = completionInWindow(setup, end, dayYmd, bounds);
    if (!hit?.completedAt) continue;

    const at = hit.completedAt;
    if (bar.time !== at) continue;
    if (hits.some((h) => historyKey(h) === historyKey(hit))) continue;

    hits.push(hit);
    sweepAfterUnix = at;
    scanFrom = at + 60;
  }

  return hits;
}

export class LastCandleSweepEngine {
  constructor() {
    /** @type {{ dayKey: string; anchorUnix: number; sorted: LastCandleSweepSnapshot[] | null }} */
    this._cache = { dayKey: "", anchorUnix: -Infinity, sorted: null };
  }

  reset() {
    this._cache = { dayKey: "", anchorUnix: -Infinity, sorted: null };
  }

  warm(dayYmd) {
    if (dayYmd) this._cache.dayKey = dayYmd;
  }

  peek(anchorUnix, dayYmd) {
    if (dayYmd && this._cache.dayKey !== dayYmd) return null;
    if (anchorUnix != null && anchorUnix === this._cache.anchorUnix && this._cache.sorted) {
      return this._cache.sorted;
    }
    return null;
  }

  through(opts, anchorUnix, dayYmd) {
    if (anchorUnix == null) return [];
    if (dayYmd && this._cache.dayKey !== dayYmd) {
      this._cache = { dayKey: dayYmd, anchorUnix: -Infinity, sorted: null };
    }
    const cached = this.peek(anchorUnix, dayYmd);
    if (cached) return cached.filter((s) => s.completedAt != null && s.completedAt <= anchorUnix);

    const sorted = buildCompletedThroughAnchor(opts, anchorUnix, dayYmd);
    this._cache = { dayKey: dayYmd ?? "", anchorUnix, sorted };
    return sorted.filter((s) => s.completedAt != null && s.completedAt <= anchorUnix);
  }
}

const engine = new LastCandleSweepEngine();

export function lastCandleSweepLive(opts, _dayYmd, completed) {
  const anchorUnix = opts.getAnchorUnix?.();
  const lastAt = completed?.length ? completed[completed.length - 1]?.completedAt : null;
  const sweepAfterUnix = lastAt ?? -Infinity;
  const { setup } = computeState(opts, anchorUnix, { sweepAfterUnix });
  return setup;
}

export function lastCandleScanOpts(ctx) {
  return {
    getRaw1m: ctx.getRaw1m,
    getAnchorUnix: ctx.getAnchorUnix,
    getDayYmd: ctx.getDayYmd,
    getTf: ctx.getTf,
    getHasPpiNews: ctx.getHasPpiNews,
    getCalendarEvents: ctx.getCalendarEvents,
    getSetupTradingWindow: ctx.getSetupTradingWindow,
  };
}

export const through = (...a) => engine.through(...a);
export const peek = (...a) => engine.peek(...a);
export const warm = (...a) => engine.warm(...a);
export const reset = () => engine.reset();
export const live = lastCandleSweepLive;
