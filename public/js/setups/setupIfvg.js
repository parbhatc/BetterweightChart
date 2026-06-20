import { normalizeChecklist } from "./setupChecklist.js";
import { CHECKLIST_STEP, isStepId } from "./setupStepTypes.js";
import { TF_MAP } from "../core/constants.js";

/**
 * @typedef {{ type: "time" | "candles"; value: number }} MaxAfterSameSideSpec
 * @typedef {object} IfvgQualifyRules
 * @property {boolean} [floorAfterOppositeTap]
 * @property {boolean} [requireInternalBetween]
 * @property {MaxAfterSameSideSpec | null} [maxAfterSameSide]
 * @property {number | null} [maxFormationCandles]
 * @typedef {IfvgQualifyRules & { maxAfterSameSideTapSec: number | null; maxFormationCandles: number | null }} ResolvedIfvgQualifyRules
 */

/** @param {import("./setupChecklist.js").ChecklistItemDef[]} items */
export function ifvgRow(items) {
  return normalizeChecklist(items).find((item) => isStepId(item.id, CHECKLIST_STEP.IFVG)) ?? null;
}

/** @param {unknown} raw */
export function parseDurationSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const spec = /** @type {Record<string, unknown>} */ (raw);
  const type = spec.type === "candles" ? "candles" : spec.type === "time" ? "time" : null;
  const value = Number(spec.value);
  if (!type || !Number.isFinite(value) || value <= 0) return null;
  return { type, value };
}

/** @param {Record<string, unknown>} q */
function maxAfterSameSideFromLegacy(q) {
  if (q.maxAfterSameSide != null) return parseDurationSpec(q.maxAfterSameSide);
  if (q.maxAfterSameSideTapSec != null) {
    const v = Number(q.maxAfterSameSideTapSec);
    if (Number.isFinite(v) && v > 0) return { type: "time", value: v };
  }
  if (q.maxAfterSameSideTapMin != null) {
    const v = Number(q.maxAfterSameSideTapMin) * 60;
    if (Number.isFinite(v) && v > 0) return { type: "time", value: v };
  }
  return null;
}

/** @param {unknown} qualify */
function normalizeQualify(qualify) {
  if (qualify == null || qualify === false) return null;
  if (qualify === true) {
    return {
      floorAfterOppositeTap: true,
      requireInternalBetween: true,
      maxAfterSameSide: { type: "candles", value: 35 },
    };
  }
  if (typeof qualify !== "object") return null;

  const q = /** @type {Record<string, unknown>} */ (qualify);
  return {
    floorAfterOppositeTap: q.floorAfterOppositeTap === true,
    requireInternalBetween: q.requireInternalBetween === true,
    maxAfterSameSide: maxAfterSameSideFromLegacy(q),
  };
}

/**
 * @param {MaxAfterSameSideSpec | null | undefined} spec
 * @param {string | undefined} chartTf
 * @returns {number | null}
 */
export function resolveDurationSpecSec(spec, chartTf) {
  if (!spec) return null;
  if (spec.type === "time") return spec.value;
  if (spec.type === "candles") {
    const tf = chartTf && TF_MAP[chartTf] ? chartTf : "1m";
    return spec.value * TF_MAP[tf];
  }
  return null;
}

/** @deprecated alias */
export const resolveMaxAfterSameSideSec = resolveDurationSpecSec;

/**
 * @param {IfvgQualifyRules | null} rules
 * @param {string | undefined} chartTf
 * @returns {ResolvedIfvgQualifyRules | null}
 */
export function resolveIfvgQualifyRules(rules, chartTf) {
  if (!rules) return null;
  return {
    ...rules,
    maxAfterSameSideTapSec: resolveDurationSpecSec(rules.maxAfterSameSide, chartTf),
    maxFormationCandles:
      rules.maxFormationCandles != null && Number.isFinite(rules.maxFormationCandles)
        ? rules.maxFormationCandles
        : null,
  };
}

/**
 * IFVG regime qualification from checklist (null = no extra rules).
 * @param {import("./setupChecklist.js").ChecklistItemDef[]} items
 * @returns {IfvgQualifyRules | null}
 */
export function ifvgQualifyRulesFromChecklist(items) {
  const row = ifvgRow(items);
  if (!row?.qualify) return null;
  const rules = normalizeQualify(row.qualify);
  if (!rules) return null;

  const active =
    rules.floorAfterOppositeTap ||
    rules.requireInternalBetween ||
    rules.maxAfterSameSide != null;
  return active ? rules : null;
}
