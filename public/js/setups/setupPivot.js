import { list as listSetups } from "./registry/setupRegistry.js";
import { htfSweepRow, internalSweepRow } from "./setupSweep.js";

const DEFAULT_PIVOT = 1;

/** @param {unknown} value @param {number} fallback */
function clampPivot(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(10, Math.floor(n));
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef | null | undefined} item
 * @returns {{ pivotLeft: number; pivotRight: number } | null} null when step omits both fields
 */
export function stepPivotOverride(item) {
  if (!item) return null;
  const rawLeft = item.pivot_left ?? item.pivotLeft;
  const rawRight = item.pivot_right ?? item.pivotRight;
  const hasLeft = rawLeft != null;
  const hasRight = rawRight != null;
  if (!hasLeft && !hasRight) return null;
  return {
    pivotLeft: clampPivot(rawLeft, DEFAULT_PIVOT),
    pivotRight: clampPivot(rawRight, DEFAULT_PIVOT),
  };
}

/**
 * @param {import("./setupChecklist.js").ChecklistItemDef | null | undefined} item
 * @returns {{ pivotLeft: number; pivotRight: number }}
 */
export function pivotFromStepItem(item) {
  return stepPivotOverride(item) ?? { pivotLeft: DEFAULT_PIVOT, pivotRight: DEFAULT_PIVOT };
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function internalSweepPivotFromChecklist(items) {
  return pivotFromStepItem(internalSweepRow(items));
}

/**
 * HTF liquidity pivot — step JSON overrides chart pivot when set.
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {{ pivotLeftBars?: number; pivotRightBars?: number }} [chartPivot]
 */
export function htfSweepPivotForLiquidity(items, chartPivot = {}) {
  const override = stepPivotOverride(htfSweepRow(items));
  if (override) return override;
  return {
    pivotLeft: clampPivot(chartPivot.pivotLeftBars, DEFAULT_PIVOT),
    pivotRight: clampPivot(chartPivot.pivotRightBars, DEFAULT_PIVOT),
  };
}

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} checklist */
export function mergeHtfLiquidityPivotSettings(checklist, chartPivot) {
  const p = htfSweepPivotForLiquidity(checklist, chartPivot);
  return { ...chartPivot, pivotLeftBars: p.pivotLeft, pivotRightBars: p.pivotRight };
}

/** @returns {import("./setupChecklist.js").ChecklistItemDef[] | null} */
export function firstSweepChecklistFromRegistry() {
  for (const def of listSetups()) {
    if (htfSweepRow(def.checklist)) return def.checklist;
  }
  return null;
}

/** @param {Record<string, unknown>} chartPivot */
export function mergeLiquidityPivotFromSetups(chartPivot) {
  const checklist = firstSweepChecklistFromRegistry();
  if (!checklist) return chartPivot;
  return mergeHtfLiquidityPivotSettings(checklist, chartPivot);
}

export { DEFAULT_PIVOT };
