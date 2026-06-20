import { TF_MAP } from "../core/constants.js";
import { CHECKLIST_STEP, isStepId } from "./setupStepTypes.js";

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function fvgTapAcceptFromChecklist(items) {
  const row = items.find((item) => isStepId(item.id, CHECKLIST_STEP.FVG_TAP));
  return row?.accept;
}

/**
 * @param {string[] | undefined} accept
 * @param {string} [fallback]
 */
export function normalizeFvgTapAccept(accept, fallback = "15m") {
  if (!accept?.length) return [fallback];
  const tags = accept.map((t) => String(t).toLowerCase()).filter((t) => TF_MAP[t]);
  return tags.length ? tags : [fallback];
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {string} [fallback]
 */
export function primaryFvgTapTf(items, fallback = "15m") {
  return normalizeFvgTapAccept(fvgTapAcceptFromChecklist(items), fallback)[0];
}

/** @param {object} ctx @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function fvgTapStepSatisfied(ctx, items) {
  const accept = normalizeFvgTapAccept(fvgTapAcceptFromChecklist(items));
  if (!accept.length) return false;
  return Boolean(ctx.fvgTapped);
}
