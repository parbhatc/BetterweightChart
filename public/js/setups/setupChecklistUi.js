import { normalizeChecklist, resolveChecklistLabel } from "./setupChecklist.js";
import { CHECKLIST_STEP, isStepId } from "./setupStepTypes.js";
import { stepLabel, textVars } from "./setupText.js";

/** UI feed keys → checklist step id */
export const FEED_STEP_ID = Object.freeze({
  htfSweeps: CHECKLIST_STEP.SWEEP,
  fvgTaps: CHECKLIST_STEP.FVG_TAP,
  internalSweeps: CHECKLIST_STEP.INTERNAL_SWEEP,
  smt: CHECKLIST_STEP.SMT,
  ifvg: CHECKLIST_STEP.IFVG,
  lastCandleSweep: CHECKLIST_STEP.LAST_CANDLE_SWEEP,
});

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items @param {string} feedKey */
export function checklistItemForFeedKey(items, feedKey) {
  const stepId = FEED_STEP_ID[/** @type {keyof typeof FEED_STEP_ID} */ (feedKey)];
  if (!stepId) return null;
  return normalizeChecklist(items).find((item) => isStepId(item.id, stepId)) ?? null;
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items @param {import("./setupStepTypes.js").ChecklistStepId} stepId */
export function checklistItemByStepId(items, stepId) {
  return normalizeChecklist(items).find((item) => isStepId(item.id, stepId)) ?? null;
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {import("./setupText.js").SetupTextConfig} text
 */
export function deriveFeedsFromChecklist(items, text) {
  /** @type {Record<string, string>} */
  const feeds = {};
  for (const [feedKey, stepId] of Object.entries(FEED_STEP_ID)) {
    const item = checklistItemByStepId(items, stepId);
    if (item) feeds[feedKey] = resolveChecklistLabel(item, text);
  }
  const lastStep = checklistItemByStepId(items, CHECKLIST_STEP.LAST_CANDLE_SWEEP);
  if (lastStep) {
    const { tf } = textVars(text);
    feeds.lastCandle = `CRT ${tf}`;
    feeds.sweepCandle = `Sweep ${tf} candle`;
  }
  return feeds;
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef | null | undefined} item
 * @param {import("./setupText.js").SetupTextConfig} text
 * @param {string} [prefix]
 */
export function waitingForStepLabel(item, text, prefix = "Waiting for ") {
  if (!item) return "Waiting…";
  const label = resolveChecklistLabel(item, text);
  return `${prefix}${label}…`;
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {import("./setupText.js").SetupTextConfig} text
 * @param {{ reset_on_opposite_fvg_tap?: boolean } | undefined} [cycle]
 */
export function deriveIdleHint(items, text, cycle) {
  const normalized = normalizeChecklist(items);
  const first = normalized[0];
  if (!first) return "Waiting…";
  if (isStepId(first.id, CHECKLIST_STEP.FVG_TAP)) {
    const { tf } = textVars(text);
    return `No ${tf} FVG tap yet`;
  }
  return waitingForStepLabel(first, text);
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {import("./setupText.js").SetupTextConfig} text
 * @param {{ reset_on_opposite_fvg_tap?: boolean } | undefined} [cycle]
 */
export function deriveCompleteIdleHint(items, text, cycle) {
  if (cycle?.reset_on_opposite_fvg_tap) {
    const { tf } = textVars(text);
    return `Setup complete — waiting for opposite ${tf} FVG tap`;
  }
  const sweep = checklistItemByStepId(items, CHECKLIST_STEP.SWEEP);
  if (sweep) {
    return `Setup complete — waiting for new ${resolveChecklistLabel(sweep, text)}`;
  }
  const lastCandle = checklistItemByStepId(items, CHECKLIST_STEP.LAST_CANDLE_SWEEP);
  if (lastCandle) {
    return `Setup complete — waiting for new ${resolveChecklistLabel(lastCandle, text)}`;
  }
  const first = normalizeChecklist(items)[0];
  return first ? `Setup complete — ${waitingForStepLabel(first, text, "")}`.trim() : "Setup complete";
}

/** @param {import("./setupText.js").SetupTextConfig} text */
export function deriveTapHints(text) {
  const { tf } = textVars(text);
  return {
    bull: `${tf} bull FVG tapped`,
    bear: `${tf} bear FVG tapped`,
    none: `No ${tf} FVG tap yet`,
  };
}

/**
 * @param {string} name
 * @param {number} id
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} checklist
 * @param {Partial<import("./setupText.js").SetupTextConfig>} [overrides]
 * @param {{ reset_on_opposite_fvg_tap?: boolean } | undefined} [cycle]
 */
export function buildSetupText(name, id, checklist, overrides = {}, cycle) {
  const partial = { ...overrides };
  const interim = {
    label: name || `Setup #${id}`,
    ...partial,
    fvgTapTf: partial.fvgTapTf ?? "15m",
    internalTf: partial.internalTf ?? "1m",
  };

  return {
    ...interim,
    checklist,
    feeds: { ...deriveFeedsFromChecklist(checklist, interim), ...partial.feeds },
    idleHint: partial.idleHint ?? deriveIdleHint(checklist, interim, cycle),
    completeIdleHint: partial.completeIdleHint ?? deriveCompleteIdleHint(checklist, interim, cycle),
    tapHints: partial.tapHints ?? deriveTapHints(interim),
  };
}

/** @param {string} feedKey @param {import("./setupText.js").SetupTextConfig} text */
export function feedTitleFromChecklist(feedKey, text) {
  const fromFeeds = text.feeds?.[feedKey];
  if (fromFeeds) return stepLabel(fromFeeds, text);
  const item = text.checklist ? checklistItemForFeedKey(text.checklist, feedKey) : null;
  if (item) return resolveChecklistLabel(item, text);
  return feedKey;
}

/** @param {import("./setupText.js").SetupTextConfig} text @param {import("./setupStepTypes.js").ChecklistStepId} stepId */
export function panelEmptyForStep(text, stepId) {
  const item = text.checklist ? checklistItemByStepId(text.checklist, stepId) : null;
  return waitingForStepLabel(item, text);
}

/** @param {import("./setupText.js").SetupTextConfig} text @param {import("./setupStepTypes.js").ChecklistStepId} stepId @param {string} prefix */
export function panelEmptyPrefixForStep(text, stepId, prefix) {
  const item = text.checklist ? checklistItemByStepId(text.checklist, stepId) : null;
  if (!item) return "Waiting…";
  return `${prefix}${resolveChecklistLabel(item, text)}…`;
}
