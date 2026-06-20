import {
  closeThroughLabel,
  internalSweepLabel,
  stepLabel,
} from "./setupText.js";
import { CHECKLIST_STEP, isStepId } from "./setupStepTypes.js";

/**
 * @typedef {object} ChecklistItemDef
 * @property {number} [step] — sequence (1 = first); sorted by this when present
 * @property {string} id — checklist step id (see `setupStepTypes.js`)
 * @property {string} [label] — display template; `{tf}` / `{internalTf}` tokens
 * @property {"close_tapped_fvg"|"internalSweep"} [labelFrom] — bias-dependent label (overrides label)
 * @property {string[]} [accept] — per-step allowlist from JSON (`sweep`, `fvg_tap`, …)
 * @property {{ type: "time" | "candles"; value: number }} [freshMax] — max confluence age; `candles` × chart TF
 * @property {number} [freshMaxSec] — legacy max age in seconds
 * @property {boolean | object} [qualify] — IFVG step: regime rules; omit = off. `maxAfterSameSide`: `{ "type": "time", "value": 2100 }` (seconds) or `{ "type": "candles", "value": 35 }` (× active chart TF bar length)
 * @property {number} [pivot_left] — pivot left bars (`sweep`, `internal_sweep`, `smt`); default 1, omit = default
 * @property {number} [pivot_right] — pivot right bars; default 1, omit = default
 * @property {{ type: "time" | "candles"; value: number }} [pivot_lookback] — `internal_sweep`: allow pivots confirmed up to N before FVG tap (Setup #1)
 * @property {boolean} [pivots_after_start] — `internal_sweep`: pivots must confirm after tap/regime start (Setup #2)
 */

/**
 * @typedef {object} ChecklistLabelCtx
 * @property {string} [bias]
 * @property {string} [closeLabel]
 */

/** @param {ChecklistItemDef[]} items @returns {ChecklistItemDef[]} */
export function normalizeChecklist(items) {
  if (!items.length) return items;
  if (items.every((item) => item.step != null)) {
    return [...items].sort((a, b) => a.step - b.step);
  }
  return items;
}

/** @param {ChecklistItemDef} item @param {import("./setupText.js").SetupTextConfig} text @param {ChecklistLabelCtx} ctx */
export function resolveChecklistLabel(item, text, ctx = {}) {
  if (item.labelFrom === "close_tapped_fvg" || isStepId(item.id, CHECKLIST_STEP.CLOSE_TAPPED_FVG)) {
    return ctx.closeLabel ?? closeThroughLabel(ctx.bias ?? "—", text);
  }
  if (item.labelFrom === "internalSweep") {
    return internalSweepLabel(ctx.bias ?? "—", text);
  }
  const template = item.label ?? item.id;
  if (item.accept?.length && isStepId(item.id, CHECKLIST_STEP.FVG_TAP)) {
    const tf = item.accept[0];
    return stepLabel(template, { ...text, fvgTapTf: tf });
  }
  return stepLabel(template, text);
}

/**
 * @param {import("./setupText.js").SetupTextConfig} text
 * @param {ChecklistItemDef[]} items
 * @param {(item: ChecklistItemDef) => boolean} getDone
 * @param {ChecklistLabelCtx} [labelCtx]
 * @returns {Array<[string, boolean]>}
 */
export function buildChecklistRows(text, items, getDone, labelCtx = {}) {
  return items.map((item) => [resolveChecklistLabel(item, text, labelCtx), getDone(item)]);
}

/** @param {ChecklistItemDef[]} items @param {ChecklistLabelCtx} [labelCtx] @returns {Array<[string, boolean]>} */
export function idleChecklistRows(text, items, labelCtx = {}) {
  return buildChecklistRows(
    text,
    items,
    () => false,
    labelCtx,
  );
}
