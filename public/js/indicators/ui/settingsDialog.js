import { getIndicatorClass } from "../catalog.js";
import { PRICE_SOURCES } from "../math/source.js";
import {
  CHECK_SVG,
  MENU_CHEVRON,
  mountDialogDrag,
  setTvCheck,
  VISIBILITY_KEYS,
  centerDialogIfNeeded,
} from "../../drawings/settings/dialog/utils.js";
import { createColorPicker, applyColorOpacity } from "../../ui/color/picker.js";
import { ICON_CLOSE } from "./icons.js";
import { openIndicatorPlotTypeMenu, LINE_PLOT_TYPES, VOLUME_PLOT_TYPES, plotTypeIcon } from "./plotTypeMenu.js";
import { PRECISION_OPTIONS } from "./constants.js";
import { renderDefaultStyleSections, renderGraphicStudyStyleSections } from "./defaultStyleSections.js";
import { renderInputsPanelHtml, renderInputColorField } from "./inputPanel.js";
import { appendSizeRuleRow, readSizeFilterRulesFromPanel } from "./symbolSizeRulesPanel.js";
import { flattenInputFields } from "../schema.js";
import { openSymbolSearchPopover } from "../../ui/symbol/popover.js";
import { symbolTicker } from "../../app/symbol/ticker.js";

/**
 * @param {object} opts
 * @param {import("../controller.js").ReturnType<typeof import("../controller.js").createIndicatorController>} opts.controller
 * @param {import("../../datafeed/types.js").DatafeedApi} [opts.datafeed]
 * @param {() => { id: string, label: string }[]} opts.getTimeframes
 * @param {(inst: import("../types.js").IndicatorInstance | null) => string} [opts.getPaneResolution]
 */
export function createIndicatorSettingsDialog(opts) {
  const { controller, getTimeframes, datafeed, getPaneResolution } = opts;
  const colorPicker = createColorPicker();

  const root = document.createElement("div");
  root.className = "tv-ind-settings tv-drawing-settings";
  root.hidden = true;
  root.innerHTML = `<div class="tv-ind-settings__dialog tv-drawing-settings__dialog" role="dialog" aria-modal="true" data-name="indicator-properties-dialog">
    <div class="tv-drawing-settings__header" data-drag-handle>
      <div class="tv-drawing-settings__title-wrap">
        <span class="tv-drawing-settings__title" data-dialog-title>EMA</span>
      </div>
      <button type="button" class="tv-drawing-settings__close" data-close aria-label="Close">${ICON_CLOSE}</button>
    </div>
    <div class="tv-drawing-settings__tabs" role="tablist">
      <button type="button" class="tv-drawing-settings__tab is-selected" data-tab="inputs" role="tab">Inputs</button>
      <button type="button" class="tv-drawing-settings__tab" data-tab="style" role="tab">Style</button>
      <button type="button" class="tv-drawing-settings__tab" data-tab="visibility" role="tab">Visibility</button>
    </div>
    <div class="tv-drawing-settings__body tv-ind-settings__body">
      <div class="tv-drawing-settings__panel" data-panel="inputs"></div>
      <div class="tv-drawing-settings__panel" data-panel="style" hidden></div>
      <div class="tv-drawing-settings__panel" data-panel="visibility" hidden>
        <div class="tv-set__section">
          <div class="tv-set__section-body tv-set__section-body--fields tv-ind-settings__visibility-body" data-visibility-list></div>
        </div>
      </div>
    </div>
    <div class="tv-drawing-settings__footer tv-ind-settings__footer">
      <button type="button" class="tv-drawing-settings__btn tv-drawing-settings__btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="tv-drawing-settings__btn tv-drawing-settings__btn--primary" data-submit>OK</button>
    </div>
  </div>`;
  document.body.appendChild(root);

  const dialog = root.querySelector(".tv-ind-settings__dialog");
  const titleEl = root.querySelector("[data-dialog-title]");
  const inputsPanel = root.querySelector('[data-panel="inputs"]');
  const stylePanel = root.querySelector('[data-panel="style"]');
  const visibilityList = root.querySelector("[data-visibility-list]");
  const dragHandle = root.querySelector("[data-drag-handle]");

  if (
    !(dialog instanceof HTMLElement) ||
    !(titleEl instanceof HTMLElement) ||
    !(inputsPanel instanceof HTMLElement) ||
    !(stylePanel instanceof HTMLElement) ||
    !(visibilityList instanceof HTMLElement)
  ) {
    throw new Error("Indicator settings dialog mount failed");
  }
  if (dragHandle instanceof HTMLElement) mountDialogDrag(dialog, dragHandle);

  visibilityList.innerHTML = VISIBILITY_KEYS.map(
    (key) => `<div class="tv-set__check-row" data-vis-row="${key}">
      <button type="button" class="tv-set__check tv-set__check--on" data-vis-btn="${key}" role="checkbox" aria-checked="true" aria-label="${key}">
        <span class="tv-set__check-box">${CHECK_SVG}</span>
      </button>
      <span class="tv-set__check-label">${key.charAt(0).toUpperCase() + key.slice(1)}</span>
    </div>`,
  ).join("");

  /** @type {string | null} */
  let instanceId = null;
  /** @type {object} */
  let draft = { inputs: {}, style: {}, visibility: {} };
  /** @type {{ inputs: object, style: object, visibility: object } | null} */
  let baseline = null;
  let activeTab = "inputs";
  /** @type {((ev: PointerEvent) => void) | null} */
  let outsideDismissListener = null;

  function disarmOutsideDismiss() {
    if (!outsideDismissListener) return;
    document.removeEventListener("pointerdown", outsideDismissListener, true);
    outsideDismissListener = null;
  }

  function armOutsideDismiss() {
    disarmOutsideDismiss();
    outsideDismissListener = (ev) => {
      if (root.hidden) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (root.contains(target)) return;
      if (
        target.closest(
          ".status-line__studies, .study-pane-legends, .tv-cpicker, .tv-menu-popover, .tv-ind-source-menu, .tv-ind-plot-menu, .tv-symbol-popover",
        )
      ) {
        return;
      }
      close();
    };
    setTimeout(() => {
      if (outsideDismissListener) {
        document.addEventListener("pointerdown", outsideDismissListener, true);
      }
    }, 0);
  }

  function timeframeOptions() {
    return [{ id: "chart", label: "Chart" }, ...getTimeframes()];
  }

  function applyDraft() {
    if (!instanceId) return;
    readDraftFromUi();
    controller.patchIndicator(instanceId, draft);
  }

  function getActiveIndicator() {
    const inst = instanceId ? controller.getInstance(instanceId) : null;
    return inst ? getIndicatorClass(inst.defId) : null;
  }

  /** @returns {import("../types.js").InputDef[]} */
  function getInputSchema() {
    const Indicator = getActiveIndicator();
    const inst = instanceId ? controller.getInstance(instanceId) : null;
    if (Indicator && typeof Indicator.inputSchema === "function") {
      const chartResolution = getPaneResolution?.(inst) ?? "1";
      return Indicator.inputSchema(draft.inputs, chartResolution);
    }
    return [];
  }

  function renderInputsPanel() {
    inputsPanel.innerHTML = renderInputsPanelHtml(getInputSchema(), draft.inputs, draft.style, {
      propNumber,
      propSelect,
      propCheck,
      propCheckOnly,
      propText,
      propSymbol,
      propInputColor: (field, store) => renderInputColorField(field, store),
      priceSources: PRICE_SOURCES,
      timeframeOptions,
    });
    syncInputSwatches();
  }

  function syncInputSwatches() {
    for (const field of flattenInputFields(getInputSchema())) {
      if (field.type !== "color") continue;
      const store = field.store === "style" ? draft.style : draft.inputs;
      const color = String(store[field.id] ?? "#2962ff");
      const opacityKey = field.opacityKey ?? `${field.id}Opacity`;
      const opacity =
        store[opacityKey] !== undefined && store[opacityKey] !== null
          ? Number(store[opacityKey])
          : 10;
      const swatch = inputsPanel.querySelector(`[data-input-swatch="${field.id}"]`);
      if (swatch instanceof HTMLElement) {
        swatch.style.background = applyColorOpacity(color, opacity);
      }
    }
  }

  function getStylePlotRows() {
    const Indicator = getActiveIndicator();
    if (Indicator && typeof Indicator.stylePlotRows === "function") {
      return Indicator.stylePlotRows(draft.inputs, draft.style);
    }
    return [];
  }

  function onInputFieldChange(field) {
    const Indicator = getActiveIndicator();
    if (Indicator && typeof Indicator.handleInputChange === "function") {
      Indicator.handleInputChange(draft.inputs, draft.style, field);
    } else if (typeof Indicator?.mergeStyleDefaults === "function") {
      Indicator.mergeStyleDefaults(draft.style, draft.inputs);
    }
  }

  function renderStyleRow(row) {
    switch (row.type) {
      case "fill":
        return styleFillRow(row);
      case "band":
        return styleBandRow(row);
      case "toggle":
        return propCheck(row.visibleKey, row.label, draft.style[row.visibleKey]);
      case "histogramColor":
        return styleHistogramColorRow(row);
      case "separator":
        return `<div class="tv-ind-settings__style-separator" role="separator"></div>`;
      case "section":
        return `<div class="tv-set__section-head tv-ind-settings__style-section-head">${row.label ?? ""}</div>`;
      case "dualColor":
        return styleDualColorRow(row);
      case "line":
      default:
        return styleRowFromPlot(row);
    }
  }

  function renderStylePanel() {
    const Indicator = getActiveIndicator();
    const graphicObjects = Indicator?.graphicObjects ?? [];
    const isGraphicStudy = graphicObjects.length > 0;

    if (isGraphicStudy) {
      stylePanel.innerHTML = renderGraphicStudyStyleSections(draft, graphicObjects, propCheck);
      return;
    }

    const plotRows = getStylePlotRows().map((row) => renderStyleRow(row)).join("");
    stylePanel.innerHTML = `
      <div class="tv-set__section">
        <div class="tv-set__section-body tv-ind-settings__plot-rows">
          ${plotRows}
        </div>
      </div>
      ${renderDefaultStyleSections(draft, { propSelect, propCheck })}`;
    syncStyleSwatches();
  }

  function propNumber(key, label, value, disabled = false, compact = false, store = "inputs", min = null) {
    const compactClass = compact ? " tv-ind-settings__inline-field" : "";
    const minAttr =
      min != null && Number.isFinite(min) ? ` data-min="${min}" data-uint="1"` : "";
    return `<div class="tv-set__field-row${disabled ? " is-disabled" : ""}${compactClass}">
      <span class="tv-set__field-label">${label}</span>
      <input type="text" class="tv-drawing-settings__input" data-field="${key}" data-store="${store}" value="${value ?? ""}" inputmode="numeric" pattern="[0-9]*"${minAttr}${disabled ? ' disabled aria-disabled="true" tabindex="-1"' : ""} />
    </div>`;
  }

  function propText(key, label, value, disabled = false, store = "inputs") {
    const labelOnly = label
      ? `<span class="tv-set__field-label">${label}</span>`
      : "";
    return `<div class="tv-set__field-row${disabled ? " is-disabled" : ""}${label ? "" : " tv-set__field-row--value-only"}">
      ${labelOnly}
      <input type="text" class="tv-drawing-settings__input" data-field="${key}" data-store="${store}" value="${value ?? ""}"${disabled ? ' disabled aria-disabled="true" tabindex="-1"' : ""} />
    </div>`;
  }

  function propSymbol(key, label, value, disabled = false, store = "inputs") {
    const ticker = symbolTicker(String(value ?? "")) || String(value ?? "");
    return `<div class="tv-set__field-row${disabled ? " is-disabled" : ""}">
      <span class="tv-set__field-label">${label}</span>
      <div class="tv-set__select-wrap">
        <button type="button" class="tv-drawing-settings__menu-btn" data-symbol-pick="${key}" data-field="${key}" data-store="${store}" data-value="${value ?? ""}" aria-haspopup="dialog"${disabled ? ' disabled aria-disabled="true" tabindex="-1"' : ""}>
          <span data-symbol-label="${key}">${ticker}</span>
          <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
        </button>
      </div>
    </div>`;
  }

  function propSelect(key, label, value, options, store = "inputs") {
    const resolved = value ?? options[0]?.id ?? "";
    const current = options.find((o) => o.id === resolved)?.label ?? options[0]?.label ?? String(resolved);
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">${label}</span>
      <div class="tv-set__select-wrap">
        <button type="button" class="tv-drawing-settings__menu-btn" data-field="${key}" data-store="${store}" data-value="${resolved}" aria-haspopup="listbox">
          <span data-select-label="${key}">${current}</span>
          <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
        </button>
      </div>
    </div>`;
  }

  function propCheck(key, label, checked, store = "inputs") {
    const on = Boolean(checked);
    return `<div class="tv-set__check-row">
      <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-field="${key}" data-store="${store}" role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="${label}">
        <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
      </button>
      <span class="tv-set__check-label">${label}</span>
    </div>`;
  }

  function propCheckOnly(key, checked, store = "inputs") {
    const on = Boolean(checked);
    return `<button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-field="${key}" data-store="${store}" role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable">
      <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
    </button>`;
  }

  function styleRowFromPlot(row) {
    return styleRow(row);
  }

  function styleRow(row) {
    const {
      visibleKey,
      label,
      colorKey,
      widthKey = "",
      styleKey = "",
      priceLineKey = "",
      plotTypeKey = "",
    } = row;
    const color = draft.style[colorKey] ?? "#2962ff";
    const width = Number(draft.style[widthKey]) || 1;
    const visible = draft.style[visibleKey] !== false;
    const controlsDisabled = visibleKey != null && draft.style[visibleKey] === false;
    const disabledAttr = controlsDisabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";
    const disabledClass = controlsDisabled ? " is-disabled" : "";
    const plotType = String(draft.style[plotTypeKey] ?? "line");
    const plotIcon = plotTypeIcon(plotType, LINE_PLOT_TYPES);
    return `<div class="tv-set__check-row tv-fib-control-row tv-ind-settings__style-row${disabledClass}">
      <button type="button" class="tv-set__check${visible ? " tv-set__check--on" : ""}" data-field="${visibleKey}" role="checkbox" aria-checked="${visible ? "true" : "false"}" aria-label="${label}">
        <span class="tv-set__check-box">${visible ? CHECK_SVG : ""}</span>
      </button>
      <span class="tv-set__check-label">${label}</span>
      <div class="tv-ind-settings__style-actions tv-fib-row-action">
        <button type="button" class="tv-ind-settings__color-line-btn" data-color-pick="${colorKey}|${widthKey}|${styleKey}" aria-label="${label} color"${disabledAttr}>
          <span class="tv-drawing-settings__color-swatch" data-swatch="${colorKey}" style="background:${color}"></span>
          <span class="tv-ind-settings__line-preview" data-line-preview="${colorKey}|${widthKey}" style="width:1.875rem;height:${Math.max(1, width)}px;background:${color}"></span>
        </button>
        <button type="button" class="tv-drawing-settings__line-end-btn tv-ind-settings__plot-type-btn" data-plot-type-pick="${priceLineKey}|${plotTypeKey}|line" aria-label="${label} plot type"${disabledAttr}>
          <span class="tv-drawing-settings__line-end-icon">${plotIcon}</span>
        </button>
      </div>
    </div>`;
  }

  /** @param {{ label: string, colorKey: string, opacityKey: string, plotTypeKey?: string, priceLineKey?: string, priceLineDisabled?: boolean, plotKind?: string }} row */
  function styleHistogramColorRow(row) {
    const { label, colorKey, opacityKey, plotTypeKey, priceLineKey, plotKind = "volume" } = row;
    const color = draft.style[colorKey] ?? "#26a69a";
    const opacity = Number(draft.style[opacityKey]) || 50;
    const swatchBg = applyColorOpacity(String(color), opacity);
    const plotType = plotTypeKey ? String(draft.style[plotTypeKey] ?? "columns") : "columns";
    const plotIcon = plotTypeIcon(plotType, VOLUME_PLOT_TYPES);
    const plotBtn = plotTypeKey
      ? `<button type="button" class="tv-drawing-settings__line-end-btn tv-ind-settings__plot-type-btn" data-plot-type-pick="${row.priceLineKey ?? ""}|${plotTypeKey}|${row.plotKind ?? "volume"}" aria-label="${label} plot type">
          <span class="tv-drawing-settings__line-end-icon">${plotIcon}</span>
        </button>`
      : "";
    return `<div class="tv-ind-settings__hist-color-row">
      <span class="tv-ind-settings__hist-color-label">${label}</span>
      <div class="tv-ind-settings__style-actions tv-fib-row-action">
        <button type="button" class="tv-ind-settings__color-line-btn" data-fill-pick="${colorKey}|${opacityKey}" aria-label="${label} color">
          <span class="tv-drawing-settings__color-swatch" data-swatch="${colorKey}" style="background:${swatchBg}"></span>
          <span class="tv-ind-settings__line-preview" data-line-preview="${colorKey}|" style="width:1.875rem;height:1px;background:${swatchBg}"></span>
        </button>
        ${plotBtn}
      </div>
    </div>`;
  }

  /** @param {{ visibleKey: string, label: string, colorKey: string, widthKey?: string, styleKey?: string, levelKey: string }} row */
  function styleBandRow(row) {
    const { visibleKey, label, colorKey, widthKey = "", styleKey = "", levelKey } = row;
    const color = draft.style[colorKey] ?? "#787b86";
    const width = Number(draft.style[widthKey]) || 1;
    const visible = draft.style[visibleKey] !== false;
    const level = draft.style[levelKey] ?? 70;
    const controlsDisabled = draft.style[visibleKey] === false;
    const disabledAttr = controlsDisabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";
    const disabledClass = controlsDisabled ? " is-disabled" : "";
    return `<div class="tv-set__check-row tv-fib-control-row tv-ind-settings__style-row tv-ind-settings__band-row${disabledClass}">
      <button type="button" class="tv-set__check${visible ? " tv-set__check--on" : ""}" data-field="${visibleKey}" role="checkbox" aria-checked="${visible ? "true" : "false"}" aria-label="${label}">
        <span class="tv-set__check-box">${visible ? CHECK_SVG : ""}</span>
      </button>
      <span class="tv-set__check-label">${label}</span>
      <div class="tv-ind-settings__style-actions tv-fib-row-action">
        <button type="button" class="tv-ind-settings__color-line-btn" data-color-pick="${colorKey}|${widthKey}|${styleKey}" aria-label="${label} color"${disabledAttr}>
          <span class="tv-drawing-settings__color-swatch" data-swatch="${colorKey}" style="background:${color}"></span>
          <span class="tv-ind-settings__line-preview tv-ind-settings__line-preview--dashed" data-line-preview="${colorKey}|${widthKey}" style="width:1.875rem;height:${Math.max(1, width)}px;background:${color}"></span>
        </button>
        <input type="text" class="tv-drawing-settings__input tv-ind-settings__band-level" data-field="${levelKey}" value="${level}" inputmode="numeric"${disabledAttr} />
      </div>
    </div>`;
  }

  /** @param {{ visibleKey: string, label: string, colorKey: string, opacityKey?: string }} row */
  /** @param {{ label: string, textColorKey: string, labelColorKey: string }} row */
  function styleDualColorRow(row) {
    const textColor = draft.style[row.textColorKey] ?? "#000000";
    const labelColor = draft.style[row.labelColorKey] ?? "#ffffff";
    return `<div class="tv-ind-settings__dual-color-row">
      <span class="tv-ind-settings__dual-color-label">${row.label}</span>
      <div class="tv-ind-settings__dual-color-swatches">
        <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-color-pick="${row.textColorKey}||" aria-label="${row.label} text color" title="Text color">
          <span class="tv-drawing-settings__color-swatch" data-swatch="${row.textColorKey}" style="background:${textColor}"></span>
        </button>
        <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-color-pick="${row.labelColorKey}||" aria-label="${row.label} label color" title="Label color">
          <span class="tv-drawing-settings__color-swatch" data-swatch="${row.labelColorKey}" style="background:${labelColor}"></span>
        </button>
      </div>
    </div>`;
  }

  function styleFillRow(row) {
    const { visibleKey, label, colorKey, opacityKey = "fillOpacity" } = row;
    const color = draft.style[colorKey] ?? "#4caf50";
    const opacity = Number(draft.style[opacityKey]) || 10;
    const visible = draft.style[visibleKey] !== false;
    const swatchBg = applyColorOpacity(color, opacity);
    return `${propCheck(visibleKey, label, visible)}
      <div class="tv-ind-settings__fill-color-row">
        <span class="tv-ind-settings__fill-color-label">Color 0</span>
        <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-fill-pick="${colorKey}|${opacityKey}" aria-label="Bollinger fill color">
          <span class="tv-drawing-settings__color-swatch" data-swatch="${colorKey}" style="background:${swatchBg}"></span>
        </button>
      </div>`;
  }

  function syncStyleSwatches() {
    const opacityByColor = new Map();
    for (const row of getStylePlotRows()) {
      if (row.type === "fill" || row.type === "histogramColor") {
        opacityByColor.set(row.colorKey, row.opacityKey);
      }
    }

    stylePanel.querySelectorAll("[data-swatch]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const key = el.dataset.swatch;
      if (!key) return;
      const opacityKey = opacityByColor.get(key);
      if (opacityKey) {
        const opacity = Number(draft.style[opacityKey]) || 50;
        el.style.background = applyColorOpacity(String(draft.style[key] ?? "#26a69a"), opacity);
      } else if (draft.style[key]) {
        el.style.background = String(draft.style[key]);
      }
    });
    stylePanel.querySelectorAll("[data-line-preview]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const keys = el.dataset.linePreview?.split("|");
      if (!keys || keys.length < 2) return;
      const [colorKey, widthKey] = keys;
      const color = String(draft.style[colorKey] ?? "#2962ff");
      const width = Math.max(1, Number(draft.style[widthKey]) || 1);
      el.style.background = color;
      el.style.height = `${width}px`;
    });
  }

  function syncTabs() {
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      const on = btn.dataset.tab === activeTab;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll("[data-panel]").forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.hidden = panel.dataset.panel !== activeTab;
    });
  }

  /** @param {HTMLElement} panel @param {Record<string, unknown>} target */
  function readFieldsFromPanel(panel, target) {
    panel.querySelectorAll("[data-field]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const key = el.dataset.field;
      if (!key) return;
      const dest = el.dataset.store === "style" ? draft.style : target;
      if (el.classList.contains("tv-set__check")) {
        dest[key] = el.classList.contains("tv-set__check--on");
        return;
      }
      if (el instanceof HTMLInputElement) {
        const isNumeric = el.getAttribute("inputmode") === "numeric";
        if (isNumeric && el.dataset.uint === "1") {
          const digits = el.value.replace(/\D/g, "");
          let n = digits === "" ? 0 : Number(digits);
          if (!Number.isFinite(n)) n = 0;
          const min = el.dataset.min != null ? Number(el.dataset.min) : 0;
          if (Number.isFinite(min)) n = Math.max(min, n);
          dest[key] = n;
          if (el.value !== String(n)) el.value = String(n);
          return;
        }
        const n = Number(el.value);
        dest[key] = isNumeric && Number.isFinite(n) ? n : el.value;
      } else if (el.dataset.value) {
        dest[key] = el.dataset.value;
      }
    });
  }

  function readDraftFromUi() {
    readFieldsFromPanel(inputsPanel, draft.inputs);
    readFieldsFromPanel(stylePanel, draft.style);
    for (const input of getInputSchema()) {
      if (input.type !== "symbolSizeRules") continue;
      const rules = readSizeFilterRulesFromPanel(inputsPanel, input.id);
      if (rules) draft.inputs[input.id] = rules;
    }
    visibilityList.querySelectorAll("[data-vis-btn]").forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      const key = btn.dataset.visBtn;
      if (key) draft.visibility[key] = btn.classList.contains("tv-set__check--on");
    });
  }

  function syncVisibilityUi() {
    visibilityList.querySelectorAll("[data-vis-btn]").forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      const key = btn.dataset.visBtn;
      if (key) setTvCheck(btn, Boolean(draft.visibility?.[key]));
    });
  }

  /** @param {string} id */
  function open(id) {
    const inst = controller.getInstance(id);
    const Indicator = inst ? getIndicatorClass(inst.defId) : null;
    if (!inst || !Indicator) return;
    instanceId = id;
    draft = {
      inputs: { ...inst.inputs },
      style: { ...inst.style },
      visibility: { ...inst.visibility },
    };
    if (typeof Indicator.mergeStyleDefaults === "function") {
      Indicator.mergeStyleDefaults(draft.style, draft.inputs);
    }
    baseline = {
      inputs: structuredClone(inst.inputs),
      style: structuredClone(inst.style),
      visibility: structuredClone(inst.visibility),
    };
    titleEl.textContent = Indicator.shortTitle;
    activeTab = "inputs";
    renderInputsPanel();
    renderStylePanel();
    syncVisibilityUi();
    syncTabs();

    dialog.style.position = "fixed";
    dialog.style.margin = "0";
    dialog.style.transform = "none";
    root.hidden = false;
    centerDialogIfNeeded(dialog);
    armOutsideDismiss();
  }

  function close() {
    disarmOutsideDismiss();
    root.hidden = true;
    instanceId = null;
    baseline = null;
    colorPicker.close?.();
  }

  function cancel() {
    if (instanceId && baseline) {
      controller.patchIndicator(instanceId, baseline);
    }
    close();
  }

  function closeIfInstance(id) {
    if (instanceId === id) close();
  }

  function getOpenInstanceId() {
    return instanceId;
  }

  function submit() {
    close();
  }

  /** @type {Map<string, { id: string, label: string }[]>} */
  const selectOptions = new Map([["precision", PRECISION_OPTIONS]]);

  function optionsForInputField(field) {
    if (field === "timeframe") return timeframeOptions();
    if (field === "source") return PRICE_SOURCES.map((s) => ({ id: s.id, label: s.label }));
    const input = flattenInputFields(getInputSchema()).find((i) => i.id === field);
    if (input?.type === "select") return input.options ?? [];
    return selectOptions.get(field) ?? [];
  }

  function openSelectMenu(anchor, field) {
    const options = optionsForInputField(field);
    const currentVal = field in draft.inputs ? draft.inputs[field] : draft.style[field];
    const isSource = field === "source";

    const menu = document.createElement("div");
    menu.className = isSource ? "tv-ind-source-menu" : "tv-menu-popover";
    if (isSource) {
      menu.setAttribute("role", "listbox");
      menu.innerHTML = `<div class="tv-ind-source-menu__list">${options
        .map((o) => {
          const active = currentVal === o.id;
          return `<button type="button" class="tv-ind-source-menu__option${active ? " is-selected" : ""}" role="option" aria-selected="${active ? "true" : "false"}" data-opt="${o.id}">
            <span class="tv-ind-source-menu__option-title">${o.label}</span>
          </button>`;
        })
        .join("")}</div>`;
    } else {
      menu.innerHTML = `<div class="tv-menu-popover__inner">${options
        .map(
          (o) =>
            `<button type="button" class="tv-menu-popover__item${currentVal === o.id ? " is-active" : ""}" data-opt="${o.id}">${o.label}</button>`,
        )
        .join("")}</div>`;
    }
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.minWidth = `${Math.max(rect.width, isSource ? 220 : rect.width)}px`;

    function cleanup() {
      menu.remove();
      document.removeEventListener("click", onDoc, true);
    }

    function onDoc(ev) {
      if (menu.contains(ev.target)) return;
      cleanup();
    }

    menu.addEventListener("click", (ev) => {
      const item = ev.target.closest("[data-opt]");
      if (!(item instanceof HTMLElement)) return;
      const val = item.dataset.opt;
      if (!val) return;
      const btn = anchor instanceof HTMLElement ? anchor : null;
      const storeKey = btn?.dataset.store === "style" ? "style" : "inputs";
      if (field in draft[storeKey]) draft[storeKey][field] = val;
      else if (field in draft.inputs) draft.inputs[field] = val;
      else draft.style[field] = val;
      if (field in draft.inputs || storeKey === "inputs") onInputFieldChange(field);
      if (activeTab === "inputs") renderInputsPanel();
      else renderStylePanel();
      if (field in draft.inputs && flattenInputFields(getInputSchema()).find((i) => i.id === field)?.affectsStyle) {
        renderStylePanel();
      }
      applyDraft();
      cleanup();
    });

    setTimeout(() => document.addEventListener("click", onDoc, true), 0);
  }

  root.addEventListener("input", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.matches("[data-size-rule-symbol], [data-size-rule-min], [data-size-rule-max]")) {
      applyDraft();
      return;
    }
    if (!target.matches(".tv-drawing-settings__input[data-field]")) return;
    if (target.dataset.uint === "1") {
      const digits = target.value.replace(/\D/g, "");
      target.value = digits;
    }
    applyDraft();
  });

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-close]") || target.closest("[data-submit]")) {
      close();
      return;
    }
    if (target.closest("[data-cancel]")) {
      cancel();
      return;
    }
    const tab = target.closest("[data-tab]");
    if (tab instanceof HTMLElement && tab.dataset.tab) {
      activeTab = tab.dataset.tab;
      if (activeTab === "style") renderStylePanel();
      syncTabs();
      return;
    }
    const visBtn = target.closest("[data-vis-btn]");
    if (visBtn instanceof HTMLElement) {
      setTvCheck(visBtn, !visBtn.classList.contains("tv-set__check--on"));
      applyDraft();
      return;
    }
    const checkRow = target.closest(".tv-set__check-row");
    if (checkRow instanceof HTMLElement && !target.closest("[data-color-pick], [data-plot-type-pick], [data-fill-pick], [data-input-fill-pick]")) {
      const fieldCheck = checkRow.querySelector("[data-field].tv-set__check");
      if (fieldCheck instanceof HTMLElement) {
        setTvCheck(fieldCheck, !fieldCheck.classList.contains("tv-set__check--on"));
        applyDraft();
        if (activeTab === "style") renderStylePanel();
        else if (activeTab === "inputs") renderInputsPanel();
        return;
      }
    }
    const leadCheck = target.closest(".tv-ind-settings__tv-row-lead .tv-set__check[data-field]");
    if (leadCheck instanceof HTMLElement) {
      setTvCheck(leadCheck, !leadCheck.classList.contains("tv-set__check--on"));
      applyDraft();
      renderInputsPanel();
      return;
    }
    const selectBtn = target.closest(".tv-drawing-settings__menu-btn[data-field]");
    if (selectBtn instanceof HTMLElement && selectBtn.dataset.field && !selectBtn.dataset.symbolPick) {
      openSelectMenu(selectBtn, selectBtn.dataset.field);
      return;
    }
    const sizeRuleAdd = target.closest("[data-size-rule-add]");
    if (sizeRuleAdd instanceof HTMLElement && !sizeRuleAdd.hasAttribute("disabled")) {
      const root = sizeRuleAdd.closest("[data-size-rules-root]");
      const list = root?.querySelector("[data-size-rules-list]");
      if (list instanceof HTMLElement) {
        appendSizeRuleRow(list);
        readDraftFromUi();
        applyDraft();
      }
      return;
    }
    const sizeRuleRemove = target.closest("[data-size-rule-remove]");
    if (sizeRuleRemove instanceof HTMLElement && !sizeRuleRemove.hasAttribute("disabled")) {
      const row = sizeRuleRemove.closest("[data-size-rule-row]");
      const list = row?.parentElement;
      row?.remove();
      if (list instanceof HTMLElement && !list.querySelector("[data-size-rule-row]")) {
        const empty = document.createElement("div");
        empty.className = "tv-ind-settings__size-rules-empty";
        empty.textContent = "No symbol overrides — global min/max applies.";
        list.appendChild(empty);
      }
      readDraftFromUi();
      applyDraft();
      return;
    }
    const symbolPick = target.closest("[data-symbol-pick]");
    if (symbolPick instanceof HTMLElement && symbolPick.dataset.symbolPick && datafeed) {
      const field = symbolPick.dataset.symbolPick;
      const storeKey = symbolPick.dataset.store === "style" ? "style" : "inputs";
      openSymbolSearchPopover({
        anchor: symbolPick,
        datafeed,
        currentSymbol: String(draft[storeKey][field] ?? ""),
        onSelect: (sym) => {
          draft[storeKey][field] = sym;
          onInputFieldChange(field);
          renderInputsPanel();
          applyDraft();
        },
      });
      return;
    }
    const colorPick = target.closest("[data-color-pick]");
    if (colorPick instanceof HTMLElement && colorPick.dataset.colorPick) {
      const [colorKey, widthKey, styleKey] = colorPick.dataset.colorPick.split("|");
      colorPicker.openLine(
        colorPick,
        {
          color: String(draft.style[colorKey] ?? "#2962ff"),
          width: Number(draft.style[widthKey]) || 1,
          opacity: 100,
          style: Number(draft.style[styleKey] ?? 0),
        },
        {
          showOpacity: false,
          showLineStyle: false,
          onChange: ({ color, width }) => {
            draft.style[colorKey] = color;
            draft.style[widthKey] = width;
            syncStyleSwatches();
            applyDraft();
          },
        },
      );
      return;
    }
    const plotTypePick = target.closest("[data-plot-type-pick]");
    if (plotTypePick instanceof HTMLElement && plotTypePick.dataset.plotTypePick) {
      const parts = plotTypePick.dataset.plotTypePick.split("|");
      const priceLineKey = parts[0] || "";
      const plotTypeKey = parts[1] || "";
      const plotKind = parts[2] || "line";
      const priceLineDisabled = !priceLineKey;
      openIndicatorPlotTypeMenu(plotTypePick, {
        priceLine: priceLineKey ? draft.style[priceLineKey] === true : false,
        plotType: String(draft.style[plotTypeKey] ?? (plotKind === "volume" ? "columns" : "line")),
        priceLineDisabled,
        plotTypes: plotKind === "volume" ? VOLUME_PLOT_TYPES : LINE_PLOT_TYPES,
        onPriceLineChange: (on) => {
          if (priceLineKey) draft.style[priceLineKey] = on;
          applyDraft();
        },
        onPlotTypeChange: (type) => {
          draft.style[plotTypeKey] = type;
          applyDraft();
        },
      });
      return;
    }
    const fillPick = target.closest("[data-fill-pick], [data-input-fill-pick]");
    if (fillPick instanceof HTMLElement) {
      const pickAttr = fillPick.dataset.fillPick ?? fillPick.dataset.inputFillPick ?? "";
      const [colorKey, opacityKey] = pickAttr.split("|");
      const storeKey = fillPick.dataset.store === "style" ? draft.style : draft.inputs;
      colorPicker.openSwatch(
        fillPick,
        {
          color: String(storeKey[colorKey] ?? "#4caf50"),
          opacity:
            storeKey[opacityKey] !== undefined && storeKey[opacityKey] !== null
              ? Number(storeKey[opacityKey])
              : 10,
        },
        {
          onChange: ({ color, opacity }) => {
            storeKey[colorKey] = color;
            storeKey[opacityKey] = opacity;
            syncStyleSwatches();
            syncInputSwatches();
            applyDraft();
          },
        },
      );
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !root.hidden) close();
  });

  return { open, close, closeIfInstance, getOpenInstanceId };
}
