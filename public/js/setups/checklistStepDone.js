import { CHECKLIST_STEP, isStepId, normalizeStepId } from "./setupStepTypes.js";
import { fvgTapStepSatisfied } from "./setupFvgTap.js";
import { isInternalSweepStep, sweepsMatchingAccept } from "./setupSweep.js";

/** @param {object} ctx */
function cycleInternalsFor(ctx) {
  const anchorTapTime = ctx.anchorTap?.time;
  return anchorTapTime != null && Number.isFinite(anchorTapTime)
    ? (ctx.internalSweeps ?? []).filter((s) => s.time >= anchorTapTime)
    : (ctx.internalSweeps ?? []);
}

/**
 * HTF-sweep backbone: step done from live/history ctx.
 * @param {import("./setupChecklist.js").ChecklistItemDef} item
 * @param {object} ctx
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 */
export function htfFlowStepDone(item, ctx, items) {
  const id = normalizeStepId(item.id);
  switch (id) {
    case CHECKLIST_STEP.SWEEP:
    case CHECKLIST_STEP.INTERNAL_SWEEP: {
      if (isInternalSweepStep(item, items)) {
        return cycleInternalsFor(ctx).length > 0;
      }
      return sweepsMatchingAccept(ctx.htfSweeps, item.accept).length > 0;
    }
    case CHECKLIST_STEP.FVG_TAP:
      return fvgTapStepSatisfied(ctx, items);
    case CHECKLIST_STEP.IFVG:
      return Boolean(ctx.ifvgDone);
    case CHECKLIST_STEP.CLOSE_TAPPED_FVG:
      return Boolean(ctx.closedAbove15m);
    default:
      return false;
  }
}

/**
 * Setup #3 — last HTF candle sweep + close above sweep candle extreme.
 * @param {import("./setupChecklist.js").ChecklistItemDef} item
 * @param {object} ctx
 */
export function lastCandleSweepStepDone(item, ctx) {
  const id = normalizeStepId(item.id);
  switch (id) {
    case CHECKLIST_STEP.LAST_CANDLE_SWEEP:
      return Boolean(ctx.lastCandleSweepDone);
    case CHECKLIST_STEP.CLOSE_ABOVE_SWEEP:
      return Boolean(ctx.closeAboveSweepDone);
    default:
      return false;
  }
}

/**
 * FVG-tap cycle backbone: step done from per-step state object.
 * @param {string} id
 * @param {{
 *   anchorTap: object | null;
 *   firstInternal: object | null;
 *   smtIfvgPair: object | null;
 *   recentSmt: object | null;
 *   recentIfvg: object | null;
 *   closeDone: boolean;
 * }} state
 */
export function cycleFlowStepDone(id, state) {
  switch (normalizeStepId(id)) {
    case CHECKLIST_STEP.FVG_TAP:
      return Boolean(state.anchorTap);
    case CHECKLIST_STEP.INTERNAL_SWEEP:
      return Boolean(state.firstInternal);
    case CHECKLIST_STEP.SMT:
      return Boolean(state.recentSmt);
    case CHECKLIST_STEP.IFVG:
      return Boolean(state.recentIfvg);
    case CHECKLIST_STEP.SMT_IFVG:
      return Boolean(state.smtIfvgPair);
    case CHECKLIST_STEP.CLOSE_TAPPED_FVG:
      return state.closeDone;
    default:
      return false;
  }
}

/** @param {string} id @param {string} step */
export { isStepId, normalizeStepId, CHECKLIST_STEP };
