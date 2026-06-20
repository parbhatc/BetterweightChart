import { normalizeChecklist } from "./setupChecklist.js";
import { CHECKLIST_STEP, isStepId } from "./setupStepTypes.js";
import { stepPivotOverride } from "./setupPivot.js";

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function smtRow(items) {
  return normalizeChecklist(items).find((item) => isStepId(item.id, CHECKLIST_STEP.SMT)) ?? null;
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function smtPivotFromChecklist(items) {
  return stepPivotOverride(smtRow(items)) ?? { pivotLeft: 1, pivotRight: 1 };
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {{ pivotLeft?: number; pivotRight?: number }} [chartOverride]
 */
export function resolveSmtPivot(items, chartOverride = {}) {
  const fromChecklist = smtPivotFromChecklist(items);
  return {
    pivotLeft: chartOverride.pivotLeft ?? fromChecklist.pivotLeft,
    pivotRight: chartOverride.pivotRight ?? fromChecklist.pivotRight,
  };
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function smtRequiredBeforeIfvg(items) {
  const row = smtRow(items);
  if (!row) return false;
  if (row.require_before_ifvg === false) return false;
  return normalizeChecklist(items).some((item) => isStepId(item.id, CHECKLIST_STEP.IFVG));
}

/** @param {{ reset_on_opposite_fvg_tap?: boolean } | undefined} cycle */
export function cycleResetsOnOppositeTap(cycle) {
  return cycle?.reset_on_opposite_fvg_tap !== false;
}
