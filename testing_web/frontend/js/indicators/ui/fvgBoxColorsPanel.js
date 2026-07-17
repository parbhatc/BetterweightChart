import { applyColorOpacity } from "/js/ui/color/picker.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "/js/chart/resolutionFormat.js";
import { fvgExtendTfKey } from "./fvgExtendBoxesPanel.js";
import { resolveFvgTimeframeRows } from "./fvgTimeframesPanel.js";

/** @param {string} timeframe */
export function fvgBoxColorTfKey(timeframe) {
  return fvgExtendTfKey(timeframe);
}

/** @param {object} inputs */
function defaultGlobalBoxColors(inputs, tfKey) {
  const palettes = {
    chart: { bull: "#4caf50", bear: "#f23645", fillOpacity: 20 },
    "15": { bull: "#00897b", bear: "#880e4f", fillOpacity: 15 },
    "60": { bull: "#00bcd4", bear: "#e53935", fillOpacity: 15 },
    "240": { bull: "#2962ff", bear: "#ff6d00", fillOpacity: 15 },
  };
  const palette = palettes[tfKey] ?? palettes["15"];
  return {
    bullColor: String(inputs.bullBoxColor ?? palette.bull),
    bullOpacity:
      inputs.bullBoxColorOpacity !== undefined && inputs.bullBoxColorOpacity !== null
        ? Number(inputs.bullBoxColorOpacity)
        : palette.fillOpacity,
    bearColor: String(inputs.bearBoxColor ?? palette.bear),
    bearOpacity:
      inputs.bearBoxColorOpacity !== undefined && inputs.bearBoxColorOpacity !== null
        ? Number(inputs.bearBoxColorOpacity)
        : palette.fillOpacity,
    bullBorderColor: String(inputs.bullBorderColor ?? palette.bull),
    bullBorderOpacity: inputs.bullBorderColorOpacity != null ? Number(inputs.bullBorderColorOpacity) : 50,
    bearBorderColor: String(inputs.bearBorderColor ?? palette.bear),
    bearBorderOpacity: inputs.bearBorderColorOpacity != null ? Number(inputs.bearBorderColorOpacity) : 50,
  };
}

/** @param {object} inputs @param {string} tfKey */
export function resolveFvgBoxColorsForTf(inputs, tfKey) {
  const defaults = defaultGlobalBoxColors(inputs, tfKey);
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
    bullBorderColor: String(custom.bullBorderColor ?? defaults.bullBorderColor),
    bullBorderOpacity: custom.bullBorderOpacity != null
      ? Number(custom.bullBorderOpacity)
      : defaults.bullBorderOpacity,
    bearBorderColor: String(custom.bearBorderColor ?? defaults.bearBorderColor),
    bearBorderOpacity: custom.bearBorderOpacity != null
      ? Number(custom.bearBorderOpacity)
      : defaults.bearBorderOpacity,
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
    bullBorder: applyColorOpacity(colors.bullBorderColor, colors.bullBorderOpacity),
    bearBorder: applyColorOpacity(colors.bearBorderColor, colors.bearBorderOpacity),
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
 * @param {"fill" | "border"} role
 * @param {object} colors
 */
function swatchButton(tfKey, side, role, colors) {
  const prefix = side === "bull" ? "bull" : "bear";
  const suffix = role === "border" ? "Border" : "";
  const color = colors[`${prefix}${suffix}Color`];
  const opacity = colors[`${prefix}${suffix}Opacity`];
  const bg = applyColorOpacity(color, opacity);
  const label = `${side === "bull" ? "Bullish" : "Bearish"} ${role} color`;
  const key = `${side}-${role}`;
  return `<button type="button" class="tv-ind-settings__fvg-box-color-btn" data-fvg-box-color-pick="${escapeAttr(tfKey)}|${key}" aria-label="${label}">
      <span class="tv-drawing-settings__color-swatch" data-fvg-box-swatch="${escapeAttr(tfKey)}|${key}" data-color="${escapeAttr(color)}" data-opacity="${opacity}" style="background:${bg}"></span>
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
        ${swatchButton(tfKey, "bull", "fill", colors)}
        ${swatchButton(tfKey, "bull", "border", colors)}
        ${swatchButton(tfKey, "bear", "fill", colors)}
        ${swatchButton(tfKey, "bear", "border", colors)}
      </div>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__fvg-box-colors${disabledClass}" data-fvg-box-colors-root data-fvg-box-colors-field="${input.id}">
    <div class="tv-ind-settings__fvg-box-colors-cols" aria-hidden="true">
      <span>Label</span><span>Timeframe</span><span>Fill / border colors</span>
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
      bullColor: readSwatchValue(row, tfKey, "bull-fill", "color"),
      bullOpacity: readSwatchValue(row, tfKey, "bull-fill", "opacity"),
      bullBorderColor: readSwatchValue(row, tfKey, "bull-border", "color"),
      bullBorderOpacity: readSwatchValue(row, tfKey, "bull-border", "opacity"),
      bearColor: readSwatchValue(row, tfKey, "bear-fill", "color"),
      bearOpacity: readSwatchValue(row, tfKey, "bear-fill", "opacity"),
      bearBorderColor: readSwatchValue(row, tfKey, "bear-border", "color"),
      bearBorderOpacity: readSwatchValue(row, tfKey, "bear-border", "opacity"),
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
