import { CHECK_SVG, MENU_CHEVRON } from "../../drawings/settings/dialog/utils.js";
import { ICON_CLOSE } from "./icons.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "../../chart/resolutionFormat.js";
import { resolutionSec } from "../../chart/resolutions.js";

/** @typedef {{ enabled: boolean, label: string, timeframe: string }} FvgTimeframeRow */

/** @type {FvgTimeframeRow[]} */
export const DEFAULT_FVG_TIMEFRAMES = [
  { enabled: true, label: "FVG", timeframe: "chart" },
  { enabled: false, label: "15m FVG", timeframe: "15" },
  { enabled: false, label: "1h FVG", timeframe: "60" },
  { enabled: false, label: "4h FVG", timeframe: "240" },
  { enabled: false, label: "D FVG", timeframe: "D" },
];

const LEGACY_TF_DEFS = [
  { on: "tf1On", tf: "tf1", label: "tf1Label", defTf: "chart", defLabel: "FVG", defaultOn: true },
  { on: "tf2On", tf: "tf2", label: "tf2Label", defTf: "15", defLabel: "15m FVG" },
  { on: "tf3On", tf: "tf3", label: "tf3Label", defTf: "60", defLabel: "1h FVG" },
  { on: "tf4On", tf: "tf4", label: "tf4Label", defTf: "240", defLabel: "4h FVG" },
  { on: "tf5On", tf: "tf5", label: "tf5Label", defTf: "D", defLabel: "D FVG" },
];

/** @param {unknown} raw */
export function normalizeFvgTimeframes(raw) {
  if (!Array.isArray(raw)) return DEFAULT_FVG_TIMEFRAMES.map((r) => ({ ...r }));
  return raw
    .map((r) => ({
      enabled: r?.enabled !== false,
      label: String(r?.label ?? "").trim(),
      timeframe: String(r?.timeframe ?? "chart").trim() || "chart",
    }))
    .filter((r) => r.label);
}

/** @param {object} inputs */
function migrateLegacyFvgTimeframes(inputs) {
  /** @type {FvgTimeframeRow[]} */
  const rows = [];
  for (const def of LEGACY_TF_DEFS) {
    const enabled = def.defaultOn ? inputs[def.on] !== false : Boolean(inputs[def.on]);
    rows.push({
      enabled,
      label: String(inputs[def.label] ?? def.defLabel).trim(),
      timeframe: String(inputs[def.tf] ?? def.defTf),
    });
  }
  return normalizeFvgTimeframes(rows);
}

/** @param {object} inputs @returns {FvgTimeframeRow[]} */
export function resolveFvgTimeframeRows(inputs) {
  if (Array.isArray(inputs.fvgTimeframes) && inputs.fvgTimeframes.length > 0) {
    return normalizeFvgTimeframes(inputs.fvgTimeframes);
  }
  const hasLegacy = LEGACY_TF_DEFS.some(
    (d) => d.on in inputs || d.tf in inputs || d.label in inputs,
  );
  if (hasLegacy) return migrateLegacyFvgTimeframes(inputs);
  return DEFAULT_FVG_TIMEFRAMES.map((r) => ({ ...r }));
}

/**
 * @param {object} inputs
 * @param {number} chartSec
 * @returns {{ tfSec: number, tfId: string, label: string }[]}
 */
export function resolveFvgLayers(inputs, chartSec) {
  /** @type {{ tfSec: number, tfId: string, label: string }[]} */
  const layers = [];
  for (const row of resolveFvgTimeframeRows(inputs)) {
    if (!row.enabled) continue;
    const label = String(row.label ?? "").trim();
    if (!label) continue;
    const tfRaw = row.timeframe ?? "chart";
    const tfId = tfRaw === "chart" ? "chart" : normalizeResolutionId(tfRaw);
    const tfSec = tfId === "chart" ? chartSec : resolutionSec(tfId);
    if (!tfSec) continue;
    layers.push({ tfSec, tfId, label });
  }
  return layers;
}

/** @param {string} tfId @param {{ id: string, label: string }[]} options */
function timeframeOptionLabel(tfId, options) {
  const found = options.find((o) => o.id === tfId);
  if (found) return found.label;
  if (tfId === "chart") return "Chart";
  return resolutionDisplayTitle(tfId);
}

/**
 * @param {import("../types.js").FvgTimeframesInputDef} input
 * @param {object} draftInputs
 * @param {() => { id: string, label: string }[]} getTimeframeOptions
 */
export function renderFvgTimeframesPanel(input, draftInputs, getTimeframeOptions) {
  const disabled = input.disabled?.(draftInputs) ?? false;
  const options = getTimeframeOptions();
  const rows = resolveFvgTimeframeRows(draftInputs);
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";

  const rowHtml = rows
    .map((row) => {
      const tf = row.timeframe ?? "chart";
      const tfLabel = timeframeOptionLabel(tf, options);
      const on = row.enabled !== false;
      return `<div class="tv-ind-settings__tf-rule-row" data-tf-rule-row>
      <div class="tv-ind-settings__tf-rule-enable">
        <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-tf-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable"${disabledAttr}>
          <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
        </button>
      </div>
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-tf-label placeholder="Label" value="${escapeAttr(row.label)}"${disabledAttr} />
      <button type="button" class="tv-drawing-settings__menu-btn tv-ind-settings__tf-rule-tf" data-tf-timeframe data-value="${escapeAttr(tf)}" aria-haspopup="listbox"${disabledAttr}>
        <span data-tf-timeframe-label>${escapeHtml(tfLabel)}</span>
        <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
      </button>
      <button type="button" class="tv-ind-settings__tf-rule-remove" data-tf-remove aria-label="Remove timeframe"${disabledAttr}>${ICON_CLOSE}</button>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__tf-rules${disabledClass}" data-tf-rules-root data-tf-rules-field="${input.id}">
    <div class="tv-ind-settings__tf-rules-head">
      ${input.title ? `<span class="tv-set__field-label">${input.title}</span>` : "<span></span>"}
      <button type="button" class="tv-ind-settings__tf-rule-add" data-tf-add${disabledAttr}>
        <span class="tv-ind-settings__tf-rule-add-icon" aria-hidden="true">+</span>
        Add timeframe
      </button>
    </div>
    <div class="tv-ind-settings__tf-rules-cols" aria-hidden="true">
      <span></span><span>Label</span><span>Timeframe</span><span></span>
    </div>
    <div class="tv-ind-settings__tf-rules-list" data-tf-rules-list>
      ${rowHtml || `<div class="tv-ind-settings__tf-rules-empty">No timeframes — add one to show FVG layers.</div>`}
    </div>
  </div>`;
}

/** @param {HTMLElement} inputsPanel @param {string} fieldId */
export function readFvgTimeframesFromPanel(inputsPanel, fieldId) {
  const root = inputsPanel.querySelector(`[data-tf-rules-field="${fieldId}"]`);
  if (!root) return null;
  /** @type {FvgTimeframeRow[]} */
  const rows = [];
  root.querySelectorAll("[data-tf-rule-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const labelEl = row.querySelector("[data-tf-label]");
    const tfBtn = row.querySelector("[data-tf-timeframe]");
    const enabledBtn = row.querySelector("[data-tf-enabled]");
    const label = labelEl instanceof HTMLInputElement ? labelEl.value.trim() : "";
    if (!label) return;
    const timeframe =
      tfBtn instanceof HTMLElement ? String(tfBtn.dataset.value ?? "chart") : "chart";
    const enabled =
      enabledBtn instanceof HTMLElement
        ? enabledBtn.classList.contains("tv-set__check--on")
        : true;
    rows.push({ enabled, label, timeframe });
  });
  return rows;
}

/** @param {HTMLElement} list @param {Partial<FvgTimeframeRow>} [seed] @param {{ id: string, label: string }[]} [options] */
export function appendFvgTimeframeRow(list, seed = {}, options = []) {
  const empty = list.querySelector(".tv-ind-settings__tf-rules-empty");
  empty?.remove();
  const tf = seed.timeframe ?? "chart";
  const tfLabel = timeframeOptionLabel(tf, options);
  const on = seed.enabled !== false;
  const row = document.createElement("div");
  row.className = "tv-ind-settings__tf-rule-row";
  row.dataset.tfRuleRow = "";
  row.innerHTML = `
    <div class="tv-ind-settings__tf-rule-enable">
      <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-tf-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable">
        <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
      </button>
    </div>
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-tf-label placeholder="Label" value="${escapeAttr(seed.label ?? "")}" />
    <button type="button" class="tv-drawing-settings__menu-btn tv-ind-settings__tf-rule-tf" data-tf-timeframe data-value="${escapeAttr(tf)}" aria-haspopup="listbox">
      <span data-tf-timeframe-label>${escapeHtml(tfLabel)}</span>
      <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
    </button>
    <button type="button" class="tv-ind-settings__tf-rule-remove" data-tf-remove aria-label="Remove timeframe">${ICON_CLOSE}</button>`;
  list.appendChild(row);
  row.querySelector("[data-tf-label]")?.focus();
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
