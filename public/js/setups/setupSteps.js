import { normalizeChecklist } from "./setupChecklist.js";
import { CHECKLIST_STEP, KNOWN_STEP_IDS, normalizeStepId } from "./setupStepTypes.js";

export { CHECKLIST_STEP, KNOWN_STEP_IDS, normalizeStepId } from "./setupStepTypes.js";

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} checklist */
export function checklistStepIds(checklist) {
  return new Set(normalizeChecklist(checklist).map((item) => normalizeStepId(item.id)));
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} checklist */
export function validateChecklistSteps(checklist) {
  for (const item of normalizeChecklist(checklist)) {
    if (!KNOWN_STEP_IDS.has(item.id)) {
      throw new Error(
        `Unknown checklist step id "${item.id}" (step ${item.step ?? "?"}). ` +
          `Known: ${[...KNOWN_STEP_IDS].sort().join(", ")}`,
      );
    }
  }
}

/**
 * Pick runtime backbone from checklist step ids (not setup number).
 *
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} checklist
 * @returns {"htfSweep"|"fvgTap"|"lastCandleSweep"}
 */
export function resolveBackboneFromChecklist(checklist) {
  validateChecklistSteps(checklist);
  const ids = checklistStepIds(checklist);

  const hasFvgTap = ids.has(CHECKLIST_STEP.FVG_TAP);
  const hasInternal = ids.has(CHECKLIST_STEP.INTERNAL_SWEEP);

  if (ids.has(CHECKLIST_STEP.LAST_CANDLE_SWEEP)) return "lastCandleSweep";
  if (ids.has(CHECKLIST_STEP.SWEEP)) return "htfSweep";
  if (ids.has(CHECKLIST_STEP.SMT_IFVG) || ids.has(CHECKLIST_STEP.SMT)) return "fvgTap";
  if (ids.has(CHECKLIST_STEP.IFVG) && hasFvgTap && hasInternal) return "fvgTap";
  if (hasFvgTap && hasInternal) return "fvgTap";
  if (ids.has(CHECKLIST_STEP.IFVG)) return "htfSweep";
  if (hasFvgTap) return "htfSweep";

  throw new Error(
    `Cannot resolve setup backbone from checklist [${[...ids].join(", ")}]. ` +
      `Add known steps (sweep, fvg_tap, internal_sweep, smt, ifvg, close_tapped_fvg, …).`,
  );
}
