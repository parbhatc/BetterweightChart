import { applyColorOpacity } from "../../ui/color/picker.js";
import { symbolTicker } from "../../app/symbol/ticker.js";
import { renderSymbolSizeRulesPanel } from "./symbolSizeRulesPanel.js";
import { renderFvgTimeframesPanel } from "./fvgTimeframesPanel.js";

/**
 * @param {import("../types.js").InputFieldDef} field
 * @param {object} draftInputs
 * @param {object} draftStyle
 */
function fieldStore(field, draftInputs, draftStyle) {
  return field.store === "style" ? draftStyle : draftInputs;
}

/**
 * @param {import("../types.js").InputDef[]} schema
 * @param {object} draftInputs
 * @param {object} draftStyle
 * @param {object} helpers
 */
export function renderInputsPanelHtml(schema, draftInputs, draftStyle, helpers) {
  const { propNumber, propSelect, propCheck, propText, propInputColor, propSymbol } = helpers;

  if (!schema.length) {
    return `<div class="tv-set__section"><div class="tv-set__section-body">No inputs</div></div>`;
  }

  /** @type {Map<string, import("../types.js").InputDef[]>} */
  const sections = new Map();
  for (const input of schema) {
    const key = input.section ?? "";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)?.push(input);
  }

  return [...sections.entries()]
    .map(([title, items]) => {
      const head = title ? `<div class="tv-set__section-head">${title}</div>` : "";
      const body = (() => {
        /** @type {string[]} */
        const chunks = [];
        /** @type {import("../types.js").InputFieldDef[]} */
        let inlineBatch = [];
        const flushInline = () => {
          if (!inlineBatch.length) return;
          chunks.push(
            `<div class="tv-ind-settings__inline-row">${inlineBatch
              .map((f) => `<div class="tv-ind-settings__inline-cell">${renderInputField(f, draftInputs, draftStyle, helpers)}</div>`)
              .join("")}</div>`,
          );
          inlineBatch = [];
        };
        for (const item of items) {
          if (item.type === "symbolSizeRules") {
            flushInline();
            chunks.push(renderInputItem(item, draftInputs, draftStyle, helpers));
            continue;
          }
          if (item.type === "fvgTimeframes") {
            flushInline();
            chunks.push(renderInputItem(item, draftInputs, draftStyle, helpers));
            continue;
          }
          if (item.type !== "row" && item.type !== "inlinePair" && "inline" in item && item.inline) {
            inlineBatch.push(item);
            continue;
          }
          flushInline();
          chunks.push(renderInputItem(item, draftInputs, draftStyle, helpers));
        }
        flushInline();
        return chunks.join("");
      })();
      return `<div class="tv-set__section">
        ${head}
        <div class="tv-set__section-body tv-set__section-body--fields">
          ${body}
        </div>
      </div>`;
    })
    .join("");
}

/**
 * @param {import("../types.js").InputDef} input
 * @param {object} draftInputs
 * @param {object} draftStyle
 * @param {object} helpers
 */
function renderInputItem(input, draftInputs, draftStyle, helpers) {
  if (input.type === "row") {
    return renderTvRow(input.fields, draftInputs, draftStyle, helpers);
  }
  if (input.type === "inlinePair") {
    const header = input.header
      ? `<div class="tv-ind-settings__pair-header">${input.header}</div>`
      : "";
    return `<div class="tv-ind-settings__pair-block">${header}<div class="tv-ind-settings__tv-inline-pair">
      <div class="tv-ind-settings__tv-pair-cell">${renderInputField(input.left, draftInputs, draftStyle, helpers)}</div>
      <div class="tv-ind-settings__tv-pair-cell">${renderInputField(input.right, draftInputs, draftStyle, helpers)}</div>
    </div></div>`;
  }
  if (input.type === "symbolSizeRules") {
    return renderSymbolSizeRulesPanel(input, draftInputs);
  }
  if (input.type === "fvgTimeframes") {
    return renderFvgTimeframesPanel(input, draftInputs, helpers.timeframeOptions);
  }
  return renderInputField(input, draftInputs, draftStyle, helpers);
}

/**
 * @param {import("../types.js").InputFieldDef[]} fields
 * @param {object} draftInputs
 * @param {object} draftStyle
 * @param {object} helpers
 */
function renderTvRow(fields, draftInputs, draftStyle, helpers) {
  if (!fields.length) return "";
  const [lead, ...rest] = fields;
  const leadHtml =
    lead.type === "bool"
      ? helpers.propCheckOnly(lead.id, fieldStore(lead, draftInputs, draftStyle)[lead.id], lead.store ?? "inputs")
      : renderInputField(lead, draftInputs, draftStyle, helpers);
  const bodyHtml = rest.map((f) => renderInputField(f, draftInputs, draftStyle, helpers)).join("");
  return `<div class="tv-ind-settings__tv-row">
    <div class="tv-ind-settings__tv-row-lead">${leadHtml}</div>
    <div class="tv-ind-settings__tv-row-body">${bodyHtml}</div>
  </div>`;
}

/**
 * @param {import("../types.js").InputFieldDef} input
 * @param {object} draftInputs
 * @param {object} draftStyle
 * @param {object} helpers
 */
function renderInputField(input, draftInputs, draftStyle, helpers) {
  const store = fieldStore(input, draftInputs, draftStyle);
  const value = store[input.id];
  const disabled = input.disabled?.(draftInputs) ?? false;
  const { propNumber, propSelect, propCheck, propText, propInputColor, propSymbol } = helpers;

  switch (input.type) {
    case "source":
      return propSelect(input.id, input.title, value, helpers.priceSources, input.store);
    case "select":
      return propSelect(input.id, input.title, value, input.options ?? [], input.store);
    case "timeframe":
      return propSelect(input.id, input.title, value, helpers.timeframeOptions(), input.store);
    case "bool":
      return propCheck(input.id, input.title, value, input.store);
    case "text":
      return propText(input.id, input.title, value, disabled, input.store);
    case "symbol":
      return propSymbol(input.id, input.title, value, disabled, input.store);
    case "color":
      return propInputColor(input, store);
    case "float":
      return propNumber(input.id, input.title, value, disabled, false, input.store);
    case "int":
      return propNumber(input.id, input.title, value, disabled, false, input.store, input.min);
    default:
      return propNumber(input.id, input.title, value, disabled, false, input.store);
  }
}

/**
 * @param {import("../types.js").InputFieldDef} field
 * @param {object} store
 */
export function renderInputColorField(field, store) {
  const color = String(store[field.id] ?? "#2962ff");
  const opacityKey = field.opacityKey ?? `${field.id}Opacity`;
  const opacity =
    store[opacityKey] !== undefined && store[opacityKey] !== null
      ? Number(store[opacityKey])
      : 10;
  const swatchBg = applyColorOpacity(color, opacity);
  const storeAttr = field.store === "style" ? "style" : "inputs";
  return `<div class="tv-set__field-row tv-ind-settings__input-color-row">
    <span class="tv-set__field-label">${field.title}</span>
    <button type="button" class="tv-ind-settings__input-color-btn" data-input-fill-pick="${field.id}|${opacityKey}" data-store="${storeAttr}" aria-label="${field.title}">
      <span class="tv-drawing-settings__color-swatch" data-input-swatch="${field.id}" style="background:${swatchBg}"></span>
    </button>
  </div>`;
}
