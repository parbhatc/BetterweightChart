import { normalizeChecklist } from "./setupChecklist.js";
import { TF_MAP } from "../core/constants.js";
import { CHECKLIST_STEP, isStepId, normalizeStepId } from "./setupStepTypes.js";
import { resolveDurationSpecSec } from "./setupIfvg.js";
import { freshMaxFromRow } from "./setupStepFresh.js";
/** @param {string[] | undefined} accept */
export function normalizeSweepAccept(accept) {
  if (!accept?.length) return [];
  return accept.map((tag) => String(tag).toLowerCase());
}

/** @param {string} tag @param {string} plain */
function tagInLabel(tag, plain) {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^\d+h$/.test(tag)) {
    const num = tag.slice(0, -1);
    return new RegExp(`\\b${num}[hH]\\b`).test(plain);
  }
  if (/^\d+m$/.test(tag)) {
    return new RegExp(`(?<!\\d)${esc}\\b`, "i").test(plain);
  }
  return plain.toLowerCase().includes(tag);
}

/** @param {string | undefined} label @param {string[]} accept */
export function sweepLabelMatchesAccept(label, accept) {
  const plain = String(label ?? "");
  for (const tag of normalizeSweepAccept(accept)) {
    if (tagInLabel(tag, plain)) return true;
  }
  return false;
}

/**
 * @param {Array<{ label?: string }> | null | undefined} sweeps
 * @param {string[] | undefined} accept
 */
export function sweepsMatchingAccept(sweeps, accept) {
  const tags = normalizeSweepAccept(accept);
  if (!tags.length) return [];
  return (sweeps ?? []).filter((s) => sweepLabelMatchesAccept(s.label, tags));
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function sweepRows(items) {
  return normalizeChecklist(items).filter((item) => isStepId(item.id, CHECKLIST_STEP.SWEEP));
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function htfSweepRow(items) {
  return sweepRows(items)[0] ?? null;
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function internalSweepRow(items) {
  const dedicated = normalizeChecklist(items).find((item) =>
    isStepId(item.id, CHECKLIST_STEP.INTERNAL_SWEEP),
  );
  if (dedicated) return dedicated;
  const sweeps = sweepRows(items);
  return sweeps.length > 1 ? sweeps[1] : null;
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function usesChartTfInternalSweep(items) {
  return normalizeStepId(internalSweepRow(items)?.id) === CHECKLIST_STEP.INTERNAL_SWEEP;
}

/** @param {import("./setupChecklist.js").ChecklistItemDef} item @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function isInternalSweepStep(item, items) {
  if (isStepId(item.id, CHECKLIST_STEP.INTERNAL_SWEEP)) {
    return true;
  }
  const internal = internalSweepRow(items);
  if (!internal || !isStepId(item.id, CHECKLIST_STEP.SWEEP)) return false;
  return item.step === internal.step;
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function htfSweepAcceptFromChecklist(items) {
  return htfSweepRow(items)?.accept;
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {string | undefined} [chartTf]
 * @returns {number | null}
 */
export function htfSweepFreshMaxSec(items, chartTf) {
  const row = htfSweepRow(items);
  if (!row) return null;
  return resolveDurationSpecSec(freshMaxFromRow(row), chartTf);
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function internalSweepAcceptFromChecklist(items) {
  return internalSweepRow(items)?.accept;
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {string} [fallback]
 * @param {string} [chartTf]
 */
export function resolveInternalSweepTf(items, fallback, chartTf) {
  if (usesChartTfInternalSweep(items)) {
    const tf = chartTf && TF_MAP[chartTf] ? chartTf : fallback;
    return tf ?? "1m";
  }
  const accept = internalSweepAcceptFromChecklist(items);
  if (accept?.length) return accept[0];
  return fallback ?? "1m";
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items @param {string} [fallback] @param {string} [chartTf] */
export function primaryInternalSweepTf(items, fallback, chartTf) {
  return resolveInternalSweepTf(items, fallback, chartTf);
}

/** @param {string[]} accept */
export function formatSweepAccept(accept) {
  return normalizeSweepAccept(accept)
    .map((tag) => {
      if (tag === "1h") return "1H";
      if (tag === "4h") return "4H";
      return tag.toUpperCase();
    })
    .join(", ");
}
