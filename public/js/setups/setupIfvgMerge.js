import { ifvgQualifyForSetup } from "./setupGlobal.js";
import { ifvgQualifyRulesFromChecklist, resolveIfvgQualifyRules } from "./setupIfvg.js";

export { resolveIfvgQualifyRules };

/**
 * Checklist qualify rules merged with global / per-setup settings from settings.json.
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @param {number | string | null | undefined} [setupId]
 * @returns {import("./setupIfvg.js").IfvgQualifyRules | null}
 */
export function ifvgQualifyRulesMerged(items, setupId) {
  const fromChecklist = ifvgQualifyRulesFromChecklist(items);
  const settingsQualify = ifvgQualifyForSetup(setupId);

  /** @type {import("./setupIfvg.js").IfvgQualifyRules} */
  const merged = {
    floorAfterOppositeTap: fromChecklist?.floorAfterOppositeTap === true,
    requireInternalBetween: fromChecklist?.requireInternalBetween === true,
    maxAfterSameSide: fromChecklist?.maxAfterSameSide ?? null,
    maxFormationCandles:
      settingsQualify?.enabled && settingsQualify.maxFormationCandles > 0
        ? settingsQualify.maxFormationCandles
        : null,
  };

  const active =
    merged.floorAfterOppositeTap ||
    merged.requireInternalBetween ||
    merged.maxAfterSameSide != null ||
    merged.maxFormationCandles != null;
  return active ? merged : null;
}
