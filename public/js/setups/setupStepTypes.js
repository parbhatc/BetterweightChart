/**
 * Canonical checklist step ids used in setup JSON (`setups/*.json`).
 */

/** @typedef {typeof CHECKLIST_STEP[keyof typeof CHECKLIST_STEP]} ChecklistStepId */

export const CHECKLIST_STEP = Object.freeze({
  SWEEP: "sweep",
  HTF_SWEEP: "htfSweep",
  FVG_TAP: "fvg_tap",
  INTERNAL_SWEEP: "internal_sweep",
  INTERNAL: "internal",
  IFVG: "ifvg",
  SMT: "smt",
  SMT_IFVG: "smt_ifvg",
  CLOSE_TAPPED_FVG: "close_tapped_fvg",
  LAST_CANDLE_SWEEP: "last_candle_sweep",
  CLOSE_ABOVE_SWEEP: "close_above_sweep",
});

/** All ids accepted in checklist JSON. */
export const KNOWN_STEP_IDS = new Set(Object.values(CHECKLIST_STEP));

/** @type {Record<string, ChecklistStepId>} */
const STEP_ALIASES = Object.freeze({
  [CHECKLIST_STEP.HTF_SWEEP]: CHECKLIST_STEP.SWEEP,
  [CHECKLIST_STEP.INTERNAL]: CHECKLIST_STEP.INTERNAL_SWEEP,
});

/** @param {string} id */
export function normalizeStepId(id) {
  return STEP_ALIASES[id] ?? id;
}

/** @param {string} id @param {ChecklistStepId} canonical */
export function isStepId(id, canonical) {
  return normalizeStepId(id) === canonical;
}
