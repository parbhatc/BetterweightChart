import { CHECK_SVG } from "/js/drawings/settings/dialog/utils.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "/js/chart/resolutionFormat.js";
import { resolveFvgTimeframeRows } from "./fvgTimeframesPanel.js";

/** @param {string} timeframe */
export function fvgExtendTfKey(timeframe) {
  const raw = String(timeframe ?? "chart").trim() || "chart";
  return raw === "chart" ? "chart" : normalizeResolutionId(raw);
}

/** @param {object} inputs @returns {Record<string, boolean>} */
export function resolveFvgExtendMap(inputs) {
  /** @type {Record<string, boolean>} */
  const map = {};
  const rows = resolveFvgTimeframeRows(inputs);
  const stored = inputs.fvgExtendByTf;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [key, val] of Object.entries(stored)) {
      map[key] = val === true;
    }
  }
  if (inputs.extendBoxes === true && (!stored || !Object.keys(stored).length)) {
    for (const row of rows) {
      if (row.enabled) map[fvgExtendTfKey(row.timeframe)] = true;
    }
  }
  return map;
}

/**
 * @param {{ tfId: string, label: string }} layer
 * @param {object} inputs
 */
export function resolveLayerExtend(layer, inputs) {
  return resolveFvgExtendMap(inputs)[layer.tfId] === true;
}

/** @param {string} tfId @param {{ id: string, label: string }[]} options */
function timeframeOptionLabel(tfId, options) {
  const found = options.find((o) => o.id === tfId);
  if (found) return found.label;
  if (tfId === "chart") return "Chart";
  return resolutionDisplayTitle(tfId);
}

/**
 * @param {import("../types.js").FvgExtendBoxesInputDef} input
 * @param {object} draftInputs
 * @param {() => { id: string, label: string }[]} getTimeframeOptions
 */
export function renderFvgExtendBoxesPanel(input, draftInputs, getTimeframeOptions) {
  const disabled = input.disabled?.(draftInputs) ?? false;
  const options = getTimeframeOptions();
  const rows = resolveFvgTimeframeRows(draftInputs);
  const extendMap = resolveFvgExtendMap(draftInputs);
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";

  const rowHtml = rows
    .map((row) => {
      const tf = row.timeframe ?? "chart";
      const tfKey = fvgExtendTfKey(tf);
      const tfLabel = timeframeOptionLabel(tf === "chart" ? "chart" : normalizeResolutionId(tf), options);
      const on = extendMap[tfKey] === true;
      const enabledHint = row.enabled !== false ? "" : ' title="Timeframe layer is disabled"';
      return `<div class="tv-ind-settings__fvg-extend-row" data-fvg-extend-row data-tf-key="${escapeAttr(tfKey)}"${enabledHint}>
      <span class="tv-ind-settings__fvg-extend-label">${escapeHtml(row.label || tfLabel)}</span>
      <span class="tv-ind-settings__fvg-extend-tf">${escapeHtml(tfLabel)}</span>
      <div class="tv-ind-settings__fvg-extend-toggle">
        <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-fvg-extend role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Extend boxes"${disabledAttr}>
          <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
        </button>
      </div>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__fvg-extend${disabledClass}" data-fvg-extend-root data-fvg-extend-field="${input.id}">
    <div class="tv-ind-settings__fvg-extend-head">
      ${input.title ? `<span class="tv-set__field-label">${input.title}</span>` : "<span></span>"}
    </div>
    <div class="tv-ind-settings__fvg-extend-cols" aria-hidden="true">
      <span>Label</span><span>Timeframe</span><span>Extend</span>
    </div>
    <div class="tv-ind-settings__fvg-extend-list" data-fvg-extend-list>
      ${rowHtml || `<div class="tv-ind-settings__tf-rules-empty">Add timeframes in the Timeframes section first.</div>`}
    </div>
  </div>`;
}

/** @param {HTMLElement} inputsPanel @param {string} fieldId */
export function readFvgExtendBoxesFromPanel(inputsPanel, fieldId) {
  const root = inputsPanel.querySelector(`[data-fvg-extend-field="${fieldId}"]`);
  if (!root) return null;
  /** @type {Record<string, boolean>} */
  const map = {};
  root.querySelectorAll("[data-fvg-extend-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const key = row.dataset.tfKey;
    if (!key) return;
    const btn = row.querySelector("[data-fvg-extend]");
    map[key] =
      btn instanceof HTMLElement ? btn.classList.contains("tv-set__check--on") : false;
  });
  return map;
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
