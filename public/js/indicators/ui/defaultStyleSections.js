import { PRECISION_OPTIONS } from "./constants.js";

/**
 * Graphic-object studies (pivots, sessions, etc.) — Graphic objects + Input values only.
 * @param {object} draft
 * @param {import("../types.js").GraphicObjectDef[]} graphicObjects
 * @param {(key: string, label: string, checked: unknown) => string} propCheck
 */
export function renderGraphicStudyStyleSections(draft, graphicObjects, propCheck) {
  const graphicRows = graphicObjects
    .map((obj) => propCheck(obj.styleKey, obj.label, draft.style[obj.styleKey] !== false))
    .join("");

  return `
    <div class="tv-ind-settings__style-group-sep" role="separator"></div>
    <div class="tv-set__section">
      <div class="tv-set__section-head">Graphic objects</div>
      <div class="tv-set__section-body">
        ${graphicRows}
      </div>
    </div>
    <div class="tv-set__section">
      <div class="tv-set__section-head">Input values</div>
      <div class="tv-set__section-body">
        ${propCheck("inputsInStatusLine", "Inputs in status line", draft.style.inputsInStatusLine)}
      </div>
    </div>`;
}

/**
 * Shared Output values / Input values sections for line/histogram studies.
 * @param {object} draft
 * @param {object} helpers
 * @param {(key: string, label: string, value: unknown, options: { id: string, label: string }[]) => string} helpers.propSelect
 * @param {(key: string, label: string, checked: unknown) => string} helpers.propCheck
 */
export function renderDefaultStyleSections(draft, { propSelect, propCheck }) {
  return `
    <div class="tv-set__section">
      <div class="tv-set__section-head">Output values</div>
      <div class="tv-set__section-body tv-set__section-body--fields">
        ${propSelect("precision", "Precision", draft.style.precision, PRECISION_OPTIONS)}
      </div>
      <div class="tv-set__section-body">
        ${propCheck("labelsOnScale", "Labels on price scale", draft.style.labelsOnScale)}
        ${propCheck("valuesInStatusLine", "Values in status line", draft.style.valuesInStatusLine)}
      </div>
    </div>
    <div class="tv-set__section">
      <div class="tv-set__section-head">Input values</div>
      <div class="tv-set__section-body">
        ${propCheck("inputsInStatusLine", "Inputs in status line", draft.style.inputsInStatusLine)}
      </div>
    </div>`;
}
