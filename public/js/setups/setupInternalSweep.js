import { internalSweepRow } from "./setupSweep.js";
import { internalSweepPivotFromChecklist } from "./setupPivot.js";
import { parseDurationSpec, resolveDurationSpecSec } from "./setupIfvg.js";

/**
 * Internal sweep build options from checklist step JSON.
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {string | undefined} chartTf
 * @param {{ hasQualifyingTap?: boolean }} [ctx]
 * @returns {{ pivotLeft: number; pivotRight: number; pivotsConfirmedAfterStart?: boolean; allowPivotLookbackSec?: number }}
 */
export function internalSweepStepOpts(items, chartTf, ctx = {}) {
  const row = internalSweepRow(items);
  const pivot = internalSweepPivotFromChecklist(items);
  const opts = {
    pivotLeft: pivot.pivotLeft,
    pivotRight: pivot.pivotRight,
  };

  if (row?.pivots_after_start === true) {
    opts.pivotsConfirmedAfterStart = true;
    return opts;
  }

  const lookbackSec = resolveDurationSpecSec(parseDurationSpec(row?.pivot_lookback), chartTf);
  if (ctx.hasQualifyingTap && lookbackSec != null && lookbackSec > 0) {
    opts.allowPivotLookbackSec = lookbackSec;
  }
  return opts;
}
