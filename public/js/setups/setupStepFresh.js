import { normalizeChecklist } from "./setupChecklist.js";
import { isStepId } from "./setupStepTypes.js";
import { parseDurationSpec, resolveDurationSpecSec } from "./setupIfvg.js";

/** @param {import("./setupChecklist.js").ChecklistItemDef | null | undefined} row */
export function freshMaxFromRow(row) {
  if (!row) return null;
  if (row.freshMax != null) return parseDurationSpec(row.freshMax);
  if (row.freshMaxSec != null) {
    const v = Number(row.freshMaxSec);
    if (Number.isFinite(v) && v > 0) return { type: "time", value: v };
  }
  return null;
}

/**
 * Max age in seconds for a checklist step (`freshMax` / legacy `freshMaxSec`); null = off.
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {import("./setupStepTypes.js").ChecklistStepId | string} stepId
 * @param {string | undefined} [chartTf]
 */
export function stepFreshMaxSec(items, stepId, chartTf) {
  const row = normalizeChecklist(items).find((item) => isStepId(item.id, stepId)) ?? null;
  return resolveDurationSpecSec(freshMaxFromRow(row), chartTf);
}
