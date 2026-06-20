/**
 * @typedef {object} SetupTextConfig
 * @property {string} label — panel title (from setup `name`)
 * @property {import("./setupChecklist.js").ChecklistItemDef[]} [checklist] — attached at register; drives feeds + empty states
 * @property {string} [fvgTapTf] — derived from checklist `fvg_tap` accept when omitted
 * @property {string} [internalTf] — derived from checklist internal sweep when omitted
 * @property {string} idleHint
 * @property {string} completeIdleHint
 * @property {Record<string, string>} [feeds] — derived from checklist; override per feed key if needed
 * @property {Record<string, string>} [tapHints] — biasHint templates keyed by none|bull|bear
 * @property {Record<string, string>} [sweepLabels] — internal sweep row keyed by bull|bear|neutral
 * @property {Record<string, string>} [panelEmpty] — optional empty-state overrides keyed by step id or legacy keys
 */

/** @param {string} template @param {Record<string, string | undefined>} vars */
export function tpl(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

/** @param {SetupTextConfig} text */
export function textVars(text) {
  return { tf: text.fvgTapTf ?? "15m", internalTf: text.internalTf ?? "1m" };
}

/** @param {string} template @param {SetupTextConfig} text */
export function stepLabel(template, text) {
  return tpl(template, textVars(text));
}

/** @param {string} bias @param {SetupTextConfig} text */
export function closeThroughLabel(bias, text) {
  if (bias === "Bullish") return stepLabel("Closed above {tf} FVG", text);
  if (bias === "Bearish") return stepLabel("Closed below {tf} FVG", text);
  return stepLabel("Closed through {tf} FVG", text);
}

/** @param {string} bias @param {SetupTextConfig} text */
export function tapBiasHint(bias, text) {
  const hints = text.tapHints ?? {};
  if (bias === "Bullish") return stepLabel(hints.bull ?? "{tf} bull FVG tapped", text);
  if (bias === "Bearish") return stepLabel(hints.bear ?? "{tf} bear FVG tapped", text);
  return stepLabel(hints.none ?? "No {tf} FVG tap yet", text);
}

/** @param {string} bias @param {SetupTextConfig} text */
export function internalSweepLabel(bias, text) {
  const labels = text.sweepLabels ?? {};
  if (bias === "Bullish") return stepLabel(labels.bull ?? "{internalTf} Sweep Low", text);
  if (bias === "Bearish") return stepLabel(labels.bear ?? "{internalTf} Sweep High", text);
  return stepLabel(labels.neutral ?? "{internalTf} Sweep", text);
}
