import { applyColorOpacity } from "/js/ui/color/picker.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "/js/chart/resolutionFormat.js";
import { fvgExtendTfKey } from "./fvgExtendBoxesPanel.js";
import { resolveFvgTimeframeRows } from "./fvgTimeframesPanel.js";

/** @param {string} timeframe */
export function fvgBoxColorTfKey(timeframe) {
  return fvgExtendTfKey(timeframe);
}

/** @param {object} inputs */
function defaultGlobalBoxColors(inputs) {
  return {
    bullColor: String(inputs.bullBoxColor ?? "#00e676"),
    bullOpacity:
      inputs.bullBoxColorOpacity !== undefined && inputs.bullBoxColorOpacity !== null
        ? Number(inputs.bullBoxColorOpacity)
        : 10,
    bearColor: String(inputs.bearBoxColor ?? "#f23645"),
    bearOpacity:
      inputs.bearBoxColorOpacity !== undefined && inputs.bearBoxColorOpacity !== null
        ? Number(inputs.bearBoxColorOpacity)
        : 10,
  };
}

/** @param {object} inputs @param {string} tfKey */
export function resolveFvgBoxColorsForTf(inputs, tfKey) {
  const defaults = defaultGlobalBoxColors(inputs);
  const stored = inputs.fvgBoxColorsByTf;
  const custom =
    stored && typeof stored === "object" && !Array.isArray(stored) ? stored[tfKey] : null;
  if (!custom || typeof custom !== "object") return { ...defaults };
  return {
    bullColor: String(custom.bullColor ?? defaults.bullColor),
    bullOpacity:
      custom.bullOpacity !== undefined && custom.bullOpacity !== null
        ? Number(custom.bullOpacity)
        : defaults.bullOpacity,
    bearColor: String(custom.bearColor ?? defaults.bearColor),
    bearOpacity:
      custom.bearOpacity !== undefined && custom.bearOpacity !== null
        ? Number(custom.bearOpacity)
        : defaults.bearOpacity,
  };
}

/**
 * @param {{ tfId: string }} layer
 * @param {object} inputs
 */
export function resolveLayerBoxFills(layer, inputs) {
  if (inputs.showFvgBoxColors === false) return null;
  const colors = resolveFvgBoxColorsForTf(inputs, fvgBoxColorTfKey(layer.tfId));
  return {
    bullFill: applyColorOpacity(colors.bullColor, colors.bullOpacity),
    bearFill: applyColorOpacity(colors.bearColor, colors.bearOpacity),
  };
}

/** @param {string} tfId @param {{ id: string, label: string }[]} options */
function timeframeOptionLabel(tfId, options) {
  const found = options.find((o) => o.id === tfId);
  if (found) return found.label;
  if (tfId === "chart") return "Chart";
  return resolutionDisplayTitle(tfId);
}

/**
 * @param {"bull" | "bear"} side
 * @param {object} colors
 */
function swatchButton(tfKey, side, colors) {
  const color = side === "bull" ? colors.bullColor : colors.bearColor;
  const opacity = side === "bull" ? colors.bullOpacity : colors.bearOpacity;
  const bg = applyColorOpacity(color, opacity);
  const label = side === "bull" ? "Bullish box color" : "Bearish box color";
  return `<button type="button" class="tv-ind-settings__fvg-box-color-btn" data-fvg-box-color-pick="${escapeAttr(tfKey)}|${side}" aria-label="${label}">
      <span class="tv-drawing-settings__color-swatch" data-fvg-box-swatch="${escapeAttr(tfKey)}|${side}" data-color="${escapeAttr(color)}" data-opacity="${opacity}" style="background:${bg}"></span>
    </button>`;
}

/**
 * @param {import("../types.js").FvgBoxColorsInputDef} input
 * @param {object} draftInputs
 * @param {() => { id: string, label: string }[]} getTimeframeOptions
 */
export function renderFvgBoxColorsPanel(input, draftInputs, getTimeframeOptions) {
  if (draftInputs.showFvgBoxColors === false) return "";

  const disabled = input.disabled?.(draftInputs) ?? false;
  const options = getTimeframeOptions();
  const rows = resolveFvgTimeframeRows(draftInputs).filter((row) => row.enabled !== false);
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";

  const rowHtml = rows
    .map((row) => {
      const tf = row.timeframe ?? "chart";
      const tfKey = fvgBoxColorTfKey(tf);
      const tfLabel = timeframeOptionLabel(tf === "chart" ? "chart" : normalizeResolutionId(tf), options);
      const colors = resolveFvgBoxColorsForTf(draftInputs, tfKey);
      return `<div class="tv-ind-settings__fvg-box-colors-row" data-fvg-box-color-row data-tf-key="${escapeAttr(tfKey)}">
      <span class="tv-ind-settings__fvg-box-colors-label">${escapeHtml(row.label || tfLabel)}</span>
      <span class="tv-ind-settings__fvg-box-colors-tf">${escapeHtml(tfLabel)}</span>
      <div class="tv-ind-settings__fvg-box-colors-swatches"${disabledAttr ? " aria-disabled=\"true\"" : ""}>
        ${swatchButton(tfKey, "bull", colors)}
        ${swatchButton(tfKey, "bear", colors)}
      </div>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__fvg-box-colors${disabledClass}" data-fvg-box-colors-root data-fvg-box-colors-field="${input.id}">
    <div class="tv-ind-settings__fvg-box-colors-cols" aria-hidden="true">
      <span>Label</span><span>Timeframe</span><span>Colors</span>
    </div>
    <div class="tv-ind-settings__fvg-box-colors-list" data-fvg-box-colors-list>
      ${rowHtml || `<div class="tv-ind-settings__tf-rules-empty">Enable timeframes in the Timeframes section first.</div>`}
    </div>
  </div>`;
}

/** @param {HTMLElement} row @param {string} tfKey @param {"bull" | "bear"} side @param {"color" | "opacity"} key */
function readSwatchValue(row, tfKey, side, key) {
  const swatch = row.querySelector(`[data-fvg-box-swatch="${tfKey}|${side}"]`);
  if (!(swatch instanceof HTMLElement)) return null;
  if (key === "color") return swatch.dataset.color ?? null;
  const opacity = swatch.dataset.opacity;
  return opacity != null ? Number(opacity) : null;
}

/** @param {HTMLElement} inputsPanel @param {string} fieldId */
export function readFvgBoxColorsFromPanel(inputsPanel, fieldId) {
  const root = inputsPanel.querySelector(`[data-fvg-box-colors-field="${fieldId}"]`);
  if (!root) return undefined;
  /** @type {Record<string, object>} */
  const map = {};
  root.querySelectorAll("[data-fvg-box-color-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const tfKey = row.dataset.tfKey;
    if (!tfKey) return;
    map[tfKey] = {
      bullColor: readSwatchValue(row, tfKey, "bull", "color"),
      bullOpacity: readSwatchValue(row, tfKey, "bull", "opacity"),
      bearColor: readSwatchValue(row, tfKey, "bear", "color"),
      bearOpacity: readSwatchValue(row, tfKey, "bear", "opacity"),
    };
  });
  return map;
}

/** @param {HTMLElement} inputsPanel */
export function syncFvgBoxColorSwatches(inputsPanel) {
  inputsPanel.querySelectorAll("[data-fvg-box-swatch]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const color = el.dataset.color ?? "#2962ff";
    const opacity = el.dataset.opacity != null ? Number(el.dataset.opacity) : 10;
    el.style.background = applyColorOpacity(color, opacity);
  });
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
