import { filterFreshConfluences, isConfluenceFresh } from "../confluence/confluenceFresh.js";
import { checklist as checklistItems } from "./engines/engineConfig.js";
import { CHECKLIST_STEP } from "./setupStepTypes.js";
import { stepFreshMaxSec } from "./setupStepFresh.js";

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {import("./setupStepTypes.js").ChecklistStepId | string} stepId
 * @param {string | undefined} chartTf
 */
function freshMax(items, stepId, chartTf) {
  return stepFreshMaxSec(items, stepId, chartTf);
}

/**
 * Apply per-step confluence freshness from checklist `freshMax`.
 * @param {object} ctx
 * @param {number | null | undefined} anchorUnix
 * @param {string} slug
 * @param {string | undefined} [chartTf]
 * @param {{ htfFreshMaxSec?: number | null }} [opts]
 */
export function applySetupConfluenceFreshness(ctx, anchorUnix, slug, chartTf, opts = {}) {
  if (anchorUnix == null) return ctx;

  const items = checklistItems(slug);
  const htfFreshMaxSec = opts.htfFreshMaxSec ?? null;
  const htfSweeps =
    htfFreshMaxSec == null
      ? ctx.htfSweeps
      : filterFreshConfluences(ctx.htfSweeps ?? [], anchorUnix, htfFreshMaxSec);

  const fvgMax = freshMax(items, CHECKLIST_STEP.FVG_TAP, chartTf);
  const internalMax = freshMax(items, CHECKLIST_STEP.INTERNAL_SWEEP, chartTf);
  const ifvgMax = freshMax(items, CHECKLIST_STEP.IFVG, chartTf);
  const closeMax = freshMax(items, CHECKLIST_STEP.CLOSE_TAPPED_FVG, chartTf);

  const fvgTaps =
    fvgMax == null ? (ctx.fvgTaps ?? []) : filterFreshConfluences(ctx.fvgTaps ?? [], anchorUnix, fvgMax);
  const internalSweeps =
    internalMax == null
      ? (ctx.internalSweeps ?? [])
      : filterFreshConfluences(ctx.internalSweeps ?? [], anchorUnix, internalMax);
  const recentIfvg =
    ctx.recentIfvg &&
    (ifvgMax == null || isConfluenceFresh(ctx.recentIfvg.time, anchorUnix, ifvgMax))
      ? ctx.recentIfvg
      : null;

  const fvgTapped =
    ctx.bias === "Bullish"
      ? fvgTaps.some((t) => t.direction === "bull")
      : ctx.bias === "Bearish"
        ? fvgTaps.some((t) => t.direction === "bear")
        : Boolean(ctx.fvgTapped);

  const ifvgDone = recentIfvg != null && Boolean(ctx.ifvgDone);
  const closedAbove15m =
    Boolean(ctx.closedAbove15m) &&
    ctx.closedAbove15mTime != null &&
    (closeMax == null || isConfluenceFresh(ctx.closedAbove15mTime, anchorUnix, closeMax)) &&
    fvgTapped &&
    ifvgDone;

  return {
    ...ctx,
    htfSweeps,
    htfSweepDone: htfSweeps.length > 0,
    fvgTaps,
    fvgTapped,
    internalSweeps,
    recentIfvg,
    ifvgDone,
    closedAbove15m,
    closedAbove15mTime: closedAbove15m ? ctx.closedAbove15mTime : null,
  };
}

/** @deprecated alias */
export const applyGlobalConfluenceFreshness = (ctx, anchorUnix, opts = {}) =>
  applySetupConfluenceFreshness(ctx, anchorUnix, "htfSweep", undefined, opts);

/**
 * Lighter freshness pass for FVG-tap cycle live state.
 * @param {object} state
 * @param {number} anchorUnix
 * @param {string} [slug]
 * @param {string | undefined} [chartTf]
 */
export function applyCycleLiveFreshness(state, anchorUnix, slug = "fvgTap", chartTf) {
  if (anchorUnix == null) return state;

  const items = checklistItems(slug);
  const fvgMax = freshMax(items, CHECKLIST_STEP.FVG_TAP, chartTf);
  const internalMax = freshMax(items, CHECKLIST_STEP.INTERNAL_SWEEP, chartTf);
  const ifvgMax = freshMax(items, CHECKLIST_STEP.IFVG, chartTf);
  const smtMax = freshMax(items, CHECKLIST_STEP.SMT, chartTf) ?? ifvgMax;
  const closeMax = freshMax(items, CHECKLIST_STEP.CLOSE_TAPPED_FVG, chartTf);

  const fvgTaps =
    fvgMax == null ? state.fvgTaps : filterFreshConfluences(state.fvgTaps ?? [], anchorUnix, fvgMax);
  const internalSweeps =
    internalMax == null
      ? state.internalSweeps
      : filterFreshConfluences(state.internalSweeps ?? [], anchorUnix, internalMax);
  const recentIfvg =
    state.recentIfvg &&
    (ifvgMax == null || isConfluenceFresh(state.recentIfvg.time, anchorUnix, ifvgMax))
      ? state.recentIfvg
      : null;
  const recentSmt =
    state.recentSmt &&
    (smtMax == null || isConfluenceFresh(state.recentSmt.endTime, anchorUnix, smtMax))
      ? state.recentSmt
      : recentIfvg
        ? state.recentSmt
        : null;

  let closedAbove15m = state.closedAbove15m;
  let closedAbove15mTime = state.closedAbove15mTime;
  if (closeMax != null && closedAbove15mTime != null && !isConfluenceFresh(closedAbove15mTime, anchorUnix, closeMax)) {
    closedAbove15m = false;
    closedAbove15mTime = null;
  }
  if (!recentIfvg) {
    closedAbove15m = false;
    closedAbove15mTime = null;
  }

  const complete = Boolean(closedAbove15m && state.complete);
  return {
    ...state,
    fvgTaps,
    internalSweeps,
    recentIfvg,
    recentSmt,
    closedAbove15m,
    closedAbove15mTime,
    complete,
    completedAt: complete ? closedAbove15mTime : null,
  };
}
