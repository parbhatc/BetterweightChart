import { normalizeChecklist } from "./setupChecklist.js";
import { CHECKLIST_STEP, isStepId } from "./setupStepTypes.js";
import { TF_MAP } from "../core/constants.js";

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function lastCandleSweepRow(items) {
  return (
    normalizeChecklist(items).find((item) => isStepId(item.id, CHECKLIST_STEP.LAST_CANDLE_SWEEP)) ?? null
  );
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items @param {string} [fallback] */
export function lastCandleSweepTf(items, fallback = "15m") {
  const accept = lastCandleSweepRow(items)?.accept;
  const tf = accept?.find((tag) => TF_MAP[tag]) ?? accept?.[0];
  return tf && TF_MAP[tf] ? tf : fallback;
}
