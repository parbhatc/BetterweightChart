import { SetupRegistry } from "./setupRegistry.js";
import { DaySetupsStore } from "../history/daySetupsStore.js";

/** @typedef {import("./setupRegistry.js").SetupRuntimeContext} SetupRuntimeContext */
/** @typedef {import("./setupRegistry.js").SetupDefinition} SetupDefinition */

/** @param {SetupDefinition} def @param {SetupRuntimeContext} ctx @param {number} anchorUnix */
function sweepCountForSetup(def, ctx, anchorUnix) {
  return ctx.getSweepEvents?.().filter((s) => s.time <= anchorUnix).length ?? 0;
}

/** @param {SetupDefinition} def @param {SetupRuntimeContext} ctx @param {number | null | undefined} anchorUnix @param {string} [dayYmd] */
function peekSetupHistory(def, ctx, anchorUnix, dayYmd) {
  if (anchorUnix == null) return null;
  if (def.slug === "htfSweep") {
    return def.history.peek(anchorUnix, dayYmd, sweepCountForSetup(def, ctx, anchorUnix));
  }
  if (def.slug === "fvgTap") {
    const compBarsLen = ctx.getCompBars1m?.().length ?? 0;
    return def.history.peek(anchorUnix, dayYmd, compBarsLen, sweepCountForSetup(def, ctx, anchorUnix));
  }
  if (def.slug === "lastCandleSweep") {
    return def.history.peek(anchorUnix, dayYmd);
  }
  return def.history.peek(anchorUnix, dayYmd);
}

function resetAllFn() {
  for (const def of SetupRegistry.list()) {
    def.history.reset();
  }
}

/** @param {string} [dayYmd] @returns {boolean} */
function anyWarmFn(dayYmd) {
  return SetupRegistry.list().some((def) => def.history.warm(dayYmd));
}

/**
 * @param {SetupRuntimeContext} ctx
 * @param {number | null | undefined} anchorUnix
 * @param {string} [dayYmd]
 * @returns {Map<number, object[]>}
 */
function resolveFn(ctx, anchorUnix, dayYmd) {
  /** @type {Map<number, object[]>} */
  const result = new Map();
  for (const def of SetupRegistry.list()) {
    result.set(def.id, []);
  }
  if (anchorUnix == null) return result;

  if (DaySetupsStore.has(dayYmd)) {
    const fromStore = DaySetupsStore.through(anchorUnix, dayYmd);
    for (const def of SetupRegistry.list()) {
      result.set(def.id, fromStore.byId.get(def.id) ?? []);
    }
    return result;
  }

  for (const def of SetupRegistry.list()) {
    const opts = def.opts(ctx);
    result.set(def.id, def.history.through(opts, anchorUnix, dayYmd));
  }
  return result;
}

/** @param {Map<number, object[]>} bySetup @returns {string} */
function signatureFn(bySetup) {
  return SetupRegistry.list()
    .map((def) => {
      const list = bySetup.get(def.id) ?? [];
      return `${def.id}:${list.map((s) => `${s.completedAt}:${s.bias}`).join(",")}`;
    })
    .join("|");
}

/** @param {Map<number, object[]>} bySetup @returns {number[]} */
function countsFn(bySetup) {
  return SetupRegistry.list().map((def) => bySetup.get(def.id)?.length ?? 0);
}

/** @param {Map<number, object[]>} bySetup @param {number} recordAfterUnix */
function countNewAfterFn(bySetup, recordAfterUnix) {
  let total = 0;
  for (const list of bySetup.values()) {
    total += list.filter((s) => s.completedAt > recordAfterUnix).length;
  }
  return total;
}

/** @param {SetupRuntimeContext} ctx @param {number} endUnix @param {string} dayYmd */
function buildAllFn(ctx, endUnix, dayYmd) {
  /** @type {Map<number, object[]>} */
  const bySetup = new Map();
  for (const def of SetupRegistry.list()) {
    bySetup.set(def.id, def.history.through(def.opts(ctx), endUnix, dayYmd));
  }
  return bySetup;
}

/** @param {Map<number, object[]>} bySetup */
function toPayloadFn(bySetup) {
  /** @type {Record<string, object[]>} */
  const setups = {};
  /** @type {Record<string, number>} */
  const counts = {};
  for (const def of SetupRegistry.list()) {
    const items = bySetup.get(def.id) ?? [];
    setups[def.apiKey] = items;
    counts[`count${def.id}`] = items.length;
  }
  return { setups, counts };
}

export class SetupHistory {
  static resetAll = resetAllFn;
  static anyWarm = anyWarmFn;
  static resolve = resolveFn;
  static counts = countsFn;
  static signature = signatureFn;
  static countNewAfter = countNewAfterFn;
  static buildAll = buildAllFn;
  static toPayload = toPayloadFn;
}

export const resetAll = (...a) => SetupHistory.resetAll(...a);
export const anyWarm = (...a) => SetupHistory.anyWarm(...a);
export const resolve = (...a) => SetupHistory.resolve(...a);
export const counts = (...a) => SetupHistory.counts(...a);
export const signature = (...a) => SetupHistory.signature(...a);
export const countNewAfter = (...a) => SetupHistory.countNewAfter(...a);
export const buildAll = (...a) => SetupHistory.buildAll(...a);
export const toPayload = (...a) => SetupHistory.toPayload(...a);
