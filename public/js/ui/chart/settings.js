import { closeAllContextMenus } from "../context/registry.js";
import { chartDebug } from "../../debug/chart/index.js";
import { createColorPicker } from "../color/picker.js";
import { TIMEZONE_OPTIONS, PRECISION_OPTIONS } from "../../chart/timezone/list.js";
import {
  SETTINGS_ICONS as ICONS,
  DEFAULT_SETTINGS,
  SETTINGS_SECTIONS as SECTIONS,
  SESSION_OPTIONS,
  TITLE_SOURCE_OPTIONS,
  SCALE_VISIBILITY_OPTIONS,
  SCALES_PLACEMENT_OPTIONS,
  DATE_FORMAT_OPTIONS,
  TIME_HOURS_FORMAT_OPTIONS,
  SYMBOL_VALUE_FORMAT_OPTIONS,
  SYMBOL_LABEL_PARTS,
  WATERMARK_PARTS,
  GRID_LINES_MODE_OPTIONS,
  FONT_SIZE_OPTIONS,
  SETTINGS_UI_STORAGE_KEY,
  THEME_OPTIONS,
  resolveSettingsSection,
} from "../settings/defaults.js";

export { createChartSettings } from "../settings/store.js";
import { createChartSettings } from "../settings/store.js";

const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");

function visibleSettingsSections() {
  return SECTIONS.filter((section) => section.id !== "drawings" || COARSE_POINTER_MQ.matches);
}

/** @returns {{ lastSection?: string, dialogPos?: { x: number, y: number } }} */
function loadSettingsUiState() {
  try {
    const raw = sessionStorage.getItem(SETTINGS_UI_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** @param {{ lastSection?: string, dialogPos?: { x: number, y: number } | null }} patch */
function saveSettingsUiState(patch) {
  try {
    const prev = loadSettingsUiState();
    const next = { ...prev, ...patch };
    if (patch.dialogPos === null) delete next.dialogPos;
    sessionStorage.setItem(SETTINGS_UI_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}


/**
 * @param {object} opts
 * @param {ReturnType<typeof createChartSettings>} opts.store
 * @param {HTMLElement} [opts.triggerEl]
 * @param {() => void} [opts.onLiveChange]
 * @param {() => "dark" | "light"} [opts.getTheme]
 * @param {(mode: "dark" | "light") => void} [opts.onThemeChange]
 * @param {() => { showMobilePlacementBar?: boolean }} [opts.getDrawingSettings]
 * @param {(key: string, value: boolean) => void} [opts.setDrawingSetting]
 */
export function mountChartSettings(opts) {
  const { store, triggerEl, onLiveChange, getTheme, onThemeChange, getDrawingSettings, setDrawingSetting } = opts;
  const colorPicker = createColorPicker();
  const savedUi = loadSettingsUiState();
  let activeSection = resolveSettingsSection(savedUi.lastSection);
  let dialogEl = null;
  /** @type {typeof DEFAULT_SETTINGS | null} */
  let draft = null;
  /** @type {typeof DEFAULT_SETTINGS | null} */
  let snapshot = null;
  let undoDepthAtOpen = 0;
  let colorUndoMarked = false;
  /** @type {{ x: number, y: number } | null} */
  let dialogPos = savedUi.dialogPos ?? null;
  let dialogDragBound = false;

  function applyDialogPos(dialogBox, x, y) {
    const w = dialogBox.offsetWidth;
    const h = dialogBox.offsetHeight;
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(8, window.innerHeight - h - 8);
    const clampedX = Math.min(Math.max(8, x), maxX);
    const clampedY = Math.min(Math.max(8, y), maxY);
    dialogBox.style.left = `${clampedX}px`;
    dialogBox.style.top = `${clampedY}px`;
    dialogBox.style.transform = "none";
    dialogPos = { x: clampedX, y: clampedY };
    saveSettingsUiState({ dialogPos });
  }

  function positionSettingsDialog() {
    const dialogBox = dialogEl?.querySelector(".tv-settings__dialog");
    if (!dialogBox) return;
    if (window.matchMedia("(max-width: 840px)").matches) {
      dialogBox.style.left = "";
      dialogBox.style.top = "";
      dialogBox.style.transform = "";
      return;
    }
    if (dialogPos) {
      applyDialogPos(dialogBox, dialogPos.x, dialogPos.y);
      return;
    }
    const w = dialogBox.offsetWidth;
    const h = dialogBox.offsetHeight;
    applyDialogPos(dialogBox, (window.innerWidth - w) / 2, (window.innerHeight - h) / 2);
  }

  function mountDialogDrag() {
    if (!dialogEl || dialogDragBound) return;
    if (window.matchMedia("(max-width: 840px)").matches) return;
    const dialogBox = dialogEl.querySelector(".tv-settings__dialog");
    const head = dialogEl.querySelector(".tv-settings__head");
    if (!dialogBox || !head) return;

    dialogDragBound = true;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    head.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".tv-settings__head-close")) return;
      if (ev.button !== 0) return;
      dragging = true;
      dialogBox.classList.add("is-dragging");
      head.setPointerCapture(ev.pointerId);
      const rect = dialogBox.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      dialogPos = { x: originX, y: originY };
      dialogBox.style.transform = "none";
      startX = ev.clientX;
      startY = ev.clientY;
      ev.preventDefault();
    });

    const endDrag = (ev) => {
      if (!dragging) return;
      dragging = false;
      dialogBox.classList.remove("is-dragging");
      if (ev?.pointerId != null) head.releasePointerCapture(ev.pointerId);
    };

    head.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      applyDialogPos(dialogBox, originX + ev.clientX - startX, originY + ev.clientY - startY);
    });

    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);
  }

  function getDraft() {
    return draft ?? store.get();
  }

  function syncDraftFromStore() {
    if (draft) draft = structuredClone(store.get());
  }

  function applyLive() {
    onLiveChange?.();
  }

  function setDraft(section, key, value, { skipHistory = false } = {}) {
    if (draft?.[section]) {
      draft[section][key] = value;
    }
    store.set(section, key, value, { skipHistory });
    applyLive();
    if (colorPicker.isOpen()) {
      dialogEl
        ?.querySelectorAll(`[data-color-pick][data-section="${section}"][data-key="${key}"]`)
        .forEach((btn) => {
          btn.style.background = String(value);
        });
      if (key === "symbolLabelLineUpColor" || key === "symbolLabelLineDownColor") {
        dialogEl
          ?.querySelectorAll(`[data-line-width-pick][data-section="${section}"]`)
          .forEach((btn) => {
            const upSeg = btn.querySelector(".tv-set__line-color-segment--up");
            const downSeg = btn.querySelector(".tv-set__line-color-segment--down");
            if (key === "symbolLabelLineUpColor" && upSeg) upSeg.style.background = String(value);
            if (key === "symbolLabelLineDownColor" && downSeg) downSeg.style.background = String(value);
          });
      }
      return;
    }
    renderPanel();
  }

  function setDraftLine(
    section,
    colorKey,
    widthKey,
    { color, width, opacity, style },
    { opacityKey, styleKey, skipHistory = false } = {},
  ) {
    if (!skipHistory) store.markHistory();
    if (color != null && colorKey && draft?.[section] && colorKey in draft[section]) {
      draft[section][colorKey] = color;
    }
    if (width != null && draft?.[section] && widthKey in draft[section]) draft[section][widthKey] = width;
    if (opacity != null && opacityKey && draft?.[section] && opacityKey in draft[section]) {
      draft[section][opacityKey] = opacity;
    }
    if (style != null && styleKey && draft?.[section] && styleKey in draft[section]) {
      draft[section][styleKey] = style;
    }
    if (color != null && colorKey) store.set(section, colorKey, color, { skipHistory: true });
    if (width != null) store.set(section, widthKey, width, { skipHistory: true });
    if (opacity != null && opacityKey) store.set(section, opacityKey, opacity, { skipHistory: true });
    if (style != null && styleKey) store.set(section, styleKey, style, { skipHistory: true });
    applyLive();
    if (colorPicker.isOpen()) {
      if (colorKey) {
        dialogEl
          ?.querySelectorAll(`[data-line-color-pick][data-section="${section}"][data-color-key="${colorKey}"]`)
          .forEach((btn) => {
            const seg = btn.querySelector(".tv-set__line-color-segment");
            if (!seg) return;
            if (color != null) seg.style.background = color;
            if (width != null) seg.style.height = `${width}px`;
          });
      } else if (widthKey) {
        dialogEl
          ?.querySelectorAll(`[data-line-width-pick][data-section="${section}"]`)
          .forEach((btn) => {
            btn.querySelectorAll(".tv-set__line-color-segment").forEach((seg) => {
              if (width != null) seg.style.height = `${width}px`;
            });
          });
      }
      return;
    }
    renderPanel();
  }

  function colorSwatchBtn(section, key, { alpha = false } = {}) {
    const raw = getDraft()[section]?.[key] ?? "#2962ff";
    return `<button type="button" class="tv-set__swatch-btn" data-color-pick data-section="${section}" data-key="${key}"${alpha ? ' data-alpha="true"' : ""} style="background:${raw}" aria-label="Pick color"></button>`;
  }

  function lineColorSwatchBtn(section, colorKey, widthKey, opacityKey, styleKey) {
    const color = String(getDraft()[section]?.[colorKey] ?? "#9c9c9c");
    const width = Number(getDraft()[section]?.[widthKey]) || 1;
    const opacityAttr = opacityKey ? ` data-opacity-key="${opacityKey}"` : "";
    const styleAttr = styleKey ? ` data-style-key="${styleKey}"` : "";
    return `<button type="button" class="tv-set__line-color-btn" data-line-color-pick data-section="${section}" data-color-key="${colorKey}" data-width-key="${widthKey}"${opacityAttr}${styleAttr} aria-label="Line color and thickness">
      <span class="tv-set__line-color-wrap">
        <span class="tv-set__line-color-segment" style="background:${color};height:${width}px"></span>
      </span>
    </button>`;
  }

  function lineColorFieldRow(label, section, colorKey, widthKey, opacityKey, styleKey) {
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">${label}</span>
      <div class="tv-set__color-btn tv-set__color-btn--line">${lineColorSwatchBtn(section, colorKey, widthKey, opacityKey, styleKey)}</div>
    </div>`;
  }

  function selectSubRow(section, key, options, { disabled = false } = {}) {
    const value = getDraft()[section]?.[key];
    const opts = options
      .map((o) => `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`)
      .join("");
    return `<div class="tv-set__sub-row ${disabled ? "tv-set__sub-row--disabled" : ""}">
      <div class="tv-set__select-wrap tv-set__select-wrap--sub">
        <select class="tv-set__select" data-section="${section}" data-key="${key}" aria-label="Title source" ${disabled ? "disabled" : ""}>${opts}</select>
        <span class="tv-set__select-chev">${ICONS.chevron}</span>
      </div>
    </div>`;
  }

  function opacitySliderRow(section, key, enabled) {
    const val = Number(getDraft()[section]?.[key] ?? 50);
    return `<div class="tv-set__opacity-row ${enabled ? "" : "tv-set__opacity-row--disabled"}">
      <div class="tv-set__opacity-track">
        <div class="tv-set__opacity-fill" style="width:${val}%"></div>
        <input type="range" class="tv-set__opacity-input" min="0" max="100" value="${val}" data-section="${section}" data-key="${key}" ${enabled ? "" : "disabled"} aria-label="Background opacity" />
      </div>
    </div>`;
  }

  function selectCell(label, section, key, options) {
    const value = getDraft()[section]?.[key];
    const opts = options
      .map((o) => `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`)
      .join("");
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">${label}</span>
      <div class="tv-set__select-wrap">
        <select class="tv-set__select" data-section="${section}" data-key="${key}" aria-label="${label}">${opts}</select>
        <span class="tv-set__select-chev">${ICONS.chevron}</span>
      </div>
    </div>`;
  }

  function compactSelect(section, key, options, ariaLabel) {
    const value = getDraft()[section]?.[key];
    const opts = options
      .map((o) => `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`)
      .join("");
    return `<div class="tv-set__select-wrap tv-set__select-wrap--compact">
      <select class="tv-set__select" data-section="${section}" data-key="${key}" aria-label="${ariaLabel}">${opts}</select>
      <span class="tv-set__select-chev">${ICONS.chevron}</span>
    </div>`;
  }

  function colorFieldRow(label, section, key, { alpha = false } = {}) {
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">${label}</span>
      <div class="tv-set__color-btn tv-set__color-btn--wide">${colorSwatchBtn(section, key, { alpha })}</div>
    </div>`;
  }

  function numberFieldRow(label, section, key, unit) {
    const val = getDraft()[section]?.[key] ?? "";
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">${label}</span>
      <div class="tv-set__number-wrap">
        <input type="text" inputmode="decimal" class="tv-set__number-input tv-set__number-input--compact" data-section="${section}" data-key="${key}" value="${val}" aria-label="${label}" />
        <span class="tv-set__number-unit">${unit}</span>
      </div>
    </div>`;
  }

  function backgroundFieldRow(section) {
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">Background</span>
      <div class="tv-set__inline-controls">
        ${compactSelect(section, "backgroundType", [{ value: "solid", label: "Solid" }], "Background type")}
        <div class="tv-set__color-btn">${colorSwatchBtn(section, "backgroundColor")}</div>
      </div>
    </div>`;
  }

  function gridLinesFieldRow(section) {
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">Grid lines</span>
      <div class="tv-set__inline-controls">
        ${compactSelect(section, "gridLinesMode", GRID_LINES_MODE_OPTIONS, "Grid lines")}
        <div class="tv-set__dual-colors tv-set__dual-colors--compact">
          <div class="tv-set__color-btn" title="Vertical">${colorSwatchBtn(section, "gridVertColor", { alpha: true })}</div>
          <div class="tv-set__color-btn" title="Horizontal">${colorSwatchBtn(section, "gridHorzColor", { alpha: true })}</div>
        </div>
      </div>
    </div>`;
  }

  function scalesTextFieldRow(section) {
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">Text</span>
      <div class="tv-set__inline-controls">
        <div class="tv-set__color-btn">${colorSwatchBtn(section, "scalesTextColor")}</div>
        ${compactSelect(section, "scalesFontSize", FONT_SIZE_OPTIONS, "Font size")}
      </div>
    </div>`;
  }

  function watermarkPartsSummary(section) {
    const cv = getDraft()[section] ?? {};
    const parts = WATERMARK_PARTS.filter((p) => cv[p.key]).map((p) => p.label);
    return parts.length ? parts.join(", ") : "Hidden";
  }

  function watermarkFieldRow(section) {
    const menuItems = WATERMARK_PARTS.map((p) => multiCheckOption(section, p.key, p.label)).join("");
    return `<div class="tv-set__field-row">
      <span class="tv-set__field-label">Watermark</span>
      <div class="tv-set__inline-controls tv-set__inline-controls--watermark">
        <div class="tv-set__multi-select-wrap tv-set__multi-select-wrap--compact" data-multi-select-wrap data-section="${section}">
          <button type="button" class="tv-set__multi-select tv-set__multi-select--compact" data-multi-select-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="Watermark content">
            <span class="tv-set__multi-select-text" data-multi-select-summary>${watermarkPartsSummary(section)}</span>
            <span class="tv-set__select-chev">${ICONS.chevron}</span>
          </button>
          <div class="tv-set__multi-select-menu" data-multi-select-menu hidden role="listbox">${menuItems}</div>
        </div>
        <div class="tv-set__color-btn">${colorSwatchBtn(section, "watermarkColor", { alpha: true })}</div>
      </div>
    </div>`;
  }

  function checkBox(section, key) {
    const checked = Boolean(getDraft()[section]?.[key]);
    return `<button type="button" class="tv-set__check ${checked ? "tv-set__check--on" : ""}" data-section="${section}" data-key="${key}" role="checkbox" aria-checked="${checked}" aria-label="Toggle ${key}">
      <span class="tv-set__check-box">${checked ? ICONS.check : ""}</span>
    </button>`;
  }

  function checkRow(label, section, key) {
    return `<div class="tv-set__check-row" data-check-row data-section="${section}" data-key="${key}">
      ${checkBox(section, key)}
      <span class="tv-set__check-label">${label}</span>
    </div>`;
  }

  function drawingCheckBox(key) {
    const checked = Boolean(getDrawingSettings?.()?.[key]);
    return `<button type="button" class="tv-set__check ${checked ? "tv-set__check--on" : ""}" data-drawing-key="${key}" role="checkbox" aria-checked="${checked}" aria-label="Toggle ${key}">
      <span class="tv-set__check-box">${checked ? ICONS.check : ""}</span>
    </button>`;
  }

  function drawingCheckRow(label, key) {
    return `<div class="tv-set__check-row" data-drawing-check data-key="${key}">
      ${drawingCheckBox(key)}
      <span class="tv-set__check-label">${label}</span>
    </div>`;
  }

  function sectionBlock(title, bodyHtml, { fields = false } = {}) {
    const bodyClass = fields
      ? "tv-set__section-body tv-set__section-body--fields"
      : "tv-set__section-body";
    return `<div class="tv-set__section">
      <div class="tv-set__section-head">${title}</div>
      <div class="${bodyClass}">${bodyHtml}</div>
    </div>`;
  }

  function numberSubRow(section, key, { disabled = false } = {}) {
    const val = getDraft()[section]?.[key] ?? "";
    return `<div class="tv-set__sub-row ${disabled ? "tv-set__sub-row--disabled" : ""}">
      <input type="text" inputmode="decimal" class="tv-set__number-input" data-section="${section}" data-key="${key}" value="${val}" ${disabled ? "disabled" : ""} aria-label="Lock price to bar ratio" />
    </div>`;
  }

  function symbolLabelSummary(section) {
    const sc = getDraft()[section] ?? {};
    const parts = SYMBOL_LABEL_PARTS.filter((p) => sc[p.key]).map((p) => p.label);
    return parts.length ? parts.join(", ") : "Hidden";
  }

  function multiCheckOption(section, key, label) {
    const checked = Boolean(getDraft()[section]?.[key]);
    return `<button type="button" class="tv-set__multi-check-item ${checked ? "is-checked" : ""}" role="option" aria-selected="${checked}" data-section="${section}" data-key="${key}" data-multi-check>
      <span class="tv-set__check ${checked ? "tv-set__check--on" : ""}" aria-hidden="true"><span class="tv-set__check-box">${checked ? ICONS.check : ""}</span></span>
      <span class="tv-set__multi-check-label">${label}</span>
    </button>`;
  }

  function symbolLineStyleBtn(section) {
    const sc = getDraft()[section] ?? {};
    const up = sc.symbolLabelLineUpColor ?? "#089981";
    const down = sc.symbolLabelLineDownColor ?? "#f23645";
    const width = Number(sc.symbolLabelLineWidth) || 1;
    return `<button type="button" class="tv-set__line-color-btn tv-set__line-color-btn--symbol" data-line-width-pick data-section="${section}" data-width-key="symbolLabelLineWidth" aria-label="Line thickness">
      <span class="tv-set__line-color-wrap tv-set__line-color-wrap--dual">
        <span class="tv-set__line-color-segment tv-set__line-color-segment--up" style="background:${up};height:${width}px"></span>
        <span class="tv-set__line-color-segment tv-set__line-color-segment--down" style="background:${down};height:${width}px"></span>
      </span>
    </button>`;
  }

  function symbolLabelRows(section) {
    const showValueFormat = Boolean(getDraft()[section]?.symbolLabelValue);
    const menuItems = SYMBOL_LABEL_PARTS.map((p) => multiCheckOption(section, p.key, p.label)).join("");
    return `<div class="tv-set__symbol-label-block">
      <div class="tv-set__field-row tv-set__field-row--symbol">
        <span class="tv-set__field-label">Symbol</span>
        <div class="tv-set__inline-controls tv-set__inline-controls--symbol">
          <div class="tv-set__multi-select-wrap" data-multi-select-wrap data-section="${section}">
            <button type="button" class="tv-set__multi-select" data-multi-select-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="Symbol labels">
              <span class="tv-set__multi-select-text" data-multi-select-summary>${symbolLabelSummary(section)}</span>
              <span class="tv-set__select-chev">${ICONS.chevron}</span>
            </button>
            <div class="tv-set__multi-select-menu" data-multi-select-menu hidden role="listbox">${menuItems}</div>
          </div>
          <div class="tv-set__dual-colors tv-set__dual-colors--symbol-line">
            <div class="tv-set__color-btn" title="Up">
              ${colorSwatchBtn(section, "symbolLabelLineUpColor")}
              <span class="tv-set__color-hint">▲</span>
            </div>
            <div class="tv-set__color-btn" title="Down">
              ${colorSwatchBtn(section, "symbolLabelLineDownColor")}
              <span class="tv-set__color-hint tv-set__color-hint--down">▼</span>
            </div>
          </div>
          <div class="tv-set__color-btn tv-set__color-btn--line">${symbolLineStyleBtn(section)}</div>
        </div>
      </div>
      ${showValueFormat ? selectSubRow(section, "symbolValueFormat", SYMBOL_VALUE_FORMAT_OPTIONS) : ""}
    </div>`;
  }

  function positionMultiSelectMenu(menu, trigger) {
    const rect = trigger.getBoundingClientRect();
    const pad = 8;
    menu.classList.add("tv-set__multi-select-menu--floating");
    menu.style.position = "fixed";
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = "auto";
    menu.style.minWidth = `${rect.width}px`;
    menu.style.width = `${Math.max(rect.width, 168)}px`;
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight - pad) {
      menu.style.top = `${Math.max(pad, rect.top - menuRect.height - 4)}px`;
    }
    if (menuRect.right > window.innerWidth - pad) {
      menu.style.left = `${Math.max(pad, window.innerWidth - menuRect.width - pad)}px`;
    }
  }

  function resetMultiSelectMenuPosition(menu) {
    menu.classList.remove("tv-set__multi-select-menu--floating");
    menu.style.position = "";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.right = "";
    menu.style.minWidth = "";
    menu.style.width = "";
  }

  function closeMultiSelectMenus() {
    dialogEl?.querySelectorAll("[data-multi-select-menu]").forEach((menu) => {
      menu.hidden = true;
      resetMultiSelectMenuPosition(menu);
    });
    dialogEl?.querySelectorAll("[data-multi-select-trigger]").forEach((trigger) => {
      trigger.setAttribute("aria-expanded", "false");
    });
  }

  function candleCheckRow(label, section, visibleKey, upKey, downKey) {
    return `<div class="tv-set__candle-row" data-check-row data-section="${section}" data-key="${visibleKey}">
      <div class="tv-set__candle-row-main">
        ${checkBox(section, visibleKey)}
        <span class="tv-set__check-label">${label}</span>
      </div>
      <div class="tv-set__dual-colors">
        <div class="tv-set__color-btn" title="Up">
          ${colorSwatchBtn(section, upKey)}
          <span class="tv-set__color-hint">▲</span>
        </div>
        <div class="tv-set__color-btn" title="Down">
          ${colorSwatchBtn(section, downKey)}
          <span class="tv-set__color-hint tv-set__color-hint--down">▼</span>
        </div>
      </div>
    </div>`;
  }

  function symbolSection() {
    return `${sectionBlock(
      "Candles",
      `${checkRow("Color bars based on previous close", "symbol", "colorBarsOnPrevClose")}
        ${candleCheckRow("Body", "symbol", "bodyVisible", "bodyUpColor", "bodyDownColor")}
        ${candleCheckRow("Borders", "symbol", "bordersVisible", "bordersUpColor", "bordersDownColor")}
        ${candleCheckRow("Wick", "symbol", "wickVisible", "wickUpColor", "wickDownColor")}`,
    )}${sectionBlock(
      "Data modification",
      `${selectCell("Session", "symbol", "session", SESSION_OPTIONS)}
        <div class="tv-set__field-row">
          <span class="tv-set__field-label">Electronic trading hours background</span>
          <div class="tv-set__color-btn tv-set__color-btn--wide">
            ${colorSwatchBtn("symbol", "ethBackground", { alpha: true })}
          </div>
        </div>
        ${selectCell("Precision", "symbol", "precision", PRECISION_OPTIONS)}
        ${selectCell("Timezone", "symbol", "timezone", TIMEZONE_OPTIONS)}`,
      { fields: true },
    )}`;
  }

  function statusLineSection() {
    const sl = getDraft().statusLine ?? {};
    const showTitle = Boolean(sl.showTitle);
    const showBg = Boolean(sl.showBackground);
    return `${sectionBlock(
      "Instrument",
      `${checkRow("Title", "statusLine", "showTitle")}
        ${selectSubRow("statusLine", "titleSource", TITLE_SOURCE_OPTIONS, { disabled: !showTitle })}
        ${checkRow("Open market status", "statusLine", "showMarketStatus")}
        ${checkRow("Chart values", "statusLine", "showOHLC")}
        ${checkRow("Bar change values", "statusLine", "showBarChange")}
        ${checkRow("Volume", "statusLine", "showVolume")}`,
    )}${sectionBlock(
      "Background",
      `${checkRow("Background", "statusLine", "showBackground")}
        ${opacitySliderRow("statusLine", "backgroundOpacity", showBg)}`,
    )}`;
  }

  function scalesSection() {
    const sc = getDraft().scales ?? {};
    const lockRatio = Boolean(sc.lockPriceToBarRatio);
    return `${sectionBlock(
      "Price Scale",
      `${selectCell("Currency and Unit", "scales", "currencyUnitVisibility", SCALE_VISIBILITY_OPTIONS)}
        ${selectCell("Scale modes (A and L)", "scales", "scaleModesVisibility", SCALE_VISIBILITY_OPTIONS)}
        ${checkRow("Lock price to bar ratio", "scales", "lockPriceToBarRatio")}
        ${numberSubRow("scales", "lockPriceToBarRatioValue", { disabled: !lockRatio })}
        ${selectCell("Scales placement", "scales", "scalesPlacement", SCALES_PLACEMENT_OPTIONS)}`,
    )}${sectionBlock(
      "Price labels & lines",
      `${checkRow("No overlapping labels", "scales", "noOverlappingLabels")}
        ${checkRow("Countdown to bar close", "scales", "countdownToBarClose")}
        ${symbolLabelRows("scales")}`,
    )}${sectionBlock(
      "Time Scale",
      `${checkRow("Day of week on labels", "scales", "dayOfWeekOnLabels")}
        ${selectCell("Date format", "scales", "dateFormat", DATE_FORMAT_OPTIONS)}
        ${selectCell("Time hours format", "scales", "timeHoursFormat", TIME_HOURS_FORMAT_OPTIONS)}
        ${checkRow("Save chart left edge position when changing interval", "scales", "saveLeftEdgeOnIntervalChange")}`,
    )}`;
  }

  function canvasSection() {
    return `${sectionBlock(
      "Chart basic styles",
      `${backgroundFieldRow("canvas")}
        ${gridLinesFieldRow("canvas")}
        ${lineColorFieldRow("Crosshair", "canvas", "crosshairColor", "crosshairWidth", "crosshairOpacity", "crosshairStyle")}
        ${watermarkFieldRow("canvas")}`,
      { fields: true },
    )}${sectionBlock(
      "Scales",
      `${scalesTextFieldRow("canvas")}
        ${colorFieldRow("Lines", "canvas", "scalesLineColor", { alpha: true })}`,
      { fields: true },
    )}${sectionBlock(
      "Buttons",
      `${selectCell("Navigation", "canvas", "navButtonsVisibility", SCALE_VISIBILITY_OPTIONS)}
        ${selectCell("Pane", "canvas", "paneButtonsVisibility", SCALE_VISIBILITY_OPTIONS)}
        ${checkRow("TradingView logo", "canvas", "attributionLogo")}`,
      { fields: true },
    )}${sectionBlock(
      "Margins",
      `${numberFieldRow("Top", "denvas", "marginTop", "%")}
        ${numberFieldRow("Bottom", "canvas", "marginBottom", "%")}
        ${numberFieldRow("Right", "canvas", "marginRight", "bars")}`,
      { fields: true },
    )}`;
  }

  function appearanceSection() {
    const theme = getTheme?.() ?? "dark";
    const opts = THEME_OPTIONS.map(
      (o) => `<option value="${o.value}" ${o.value === theme ? "selected" : ""}>${o.label}</option>`,
    ).join("");
    return `${sectionBlock(
      "Theme",
      `<div class="tv-set__field-row">
        <span class="tv-set__field-label">Color theme</span>
        <div class="tv-set__select-wrap">
          <select class="tv-set__select" data-theme-select aria-label="Color theme">${opts}</select>
          <span class="tv-set__select-chev">${ICONS.chevron}</span>
        </div>
      </div>`,
      { fields: true },
    )}`;
  }

  function drawingsSection() {
    return `${sectionBlock(
      "Mobile drawing",
      `${drawingCheckRow("Show placement hint bar while drawing", "showMobilePlacementBar")}`,
    )}`;
  }

  function sectionHtml(id) {
    switch (id) {
      case "appearance":
        return appearanceSection();
      case "symbol":
        return symbolSection();
      case "statusLine":
        return statusLineSection();
      case "scales":
        return scalesSection();
      case "canvas":
        return canvasSection();
      case "drawings":
        return drawingsSection();
      default:
        return "";
    }
  }

  function renderPanel() {
    if (!dialogEl) return;
    const tabs = dialogEl.querySelector(".tv-settings__tabs");
    const body = dialogEl.querySelector(".tv-settings__pane");
    if (!tabs || !body) return;

    const sections = visibleSettingsSections();
    if (!sections.some((section) => section.id === activeSection)) {
      activeSection = resolveSettingsSection(activeSection);
    }

    tabs.innerHTML = sections
      .map(
        (s) =>
          `<button type="button" role="tab" class="tv-settings__tab ${s.id === activeSection ? "is-active" : ""}" data-section="${s.id}" aria-selected="${s.id === activeSection}" title="${s.label}">
          <span class="tv-settings__tab-icon">${s.icon}</span>
          <span class="tv-settings__tab-label">${s.label}</span>
        </button>`,
      )
      .join("");

    body.innerHTML = `<div class="tv-set__content">${sectionHtml(activeSection)}</div>`;
  }

  function commit() {
    close();
  }

  function cancel() {
    if (snapshot) {
      store.replace(snapshot, { skipHistory: true });
      store.trimUndo(undoDepthAtOpen);
      store.clearRedo();
      applyLive();
    }
    close();
  }

  function handleUndoRedo(ev) {
    if (!dialogEl || dialogEl.hidden) return;
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    const key = ev.key.toLowerCase();
    const isUndo = key === "z" && !ev.shiftKey;
    const isRedo = key === "y" || (key === "z" && ev.shiftKey);
    if (!isUndo && !isRedo) return;
    ev.preventDefault();
    const changed = isUndo ? store.undo() : store.redo();
    if (!changed) return;
    syncDraftFromStore();
    applyLive();
    if (dialogEl && !dialogEl.hidden) renderPanel();
  }

  function open(section) {
    closeAllContextMenus();
    chartDebug("context", "settings:open", { section: section ?? activeSection });
    activeSection = section === undefined ? resolveSettingsSection(loadSettingsUiState().lastSection) : resolveSettingsSection(section);
    saveSettingsUiState({ lastSection: activeSection });
    snapshot = structuredClone(store.get());
    draft = structuredClone(store.get());
    undoDepthAtOpen = store.getUndoDepth();
    colorUndoMarked = false;

    if (!dialogEl) {
      dialogEl = document.createElement("div");
      dialogEl.className = "tv-settings";
      dialogEl.hidden = true;
      dialogEl.innerHTML = `<div class="tv-settings__backdrop" data-action="cancel"></div>
        <div class="tv-settings__dialog" role="dialog" aria-modal="true" aria-label="Settings">
          <div class="tv-settings__head">
            <div class="tv-settings__head-title">Settings</div>
            <button type="button" class="tv-settings__head-close" data-action="cancel" aria-label="Close">${ICONS.close}</button>
          </div>
          <div class="tv-settings__main">
            <div class="tv-settings__tabs" role="tablist" aria-orientation="vertical"></div>
            <div class="tv-settings__pane"></div>
          </div>
          <div class="tv-settings__foot">
            <div class="tv-settings__foot-actions">
              <button type="button" class="tv-settings__btn tv-settings__btn--secondary" data-action="cancel">Cancel</button>
              <button type="button" class="tv-settings__btn tv-settings__btn--primary" data-action="ok">Close</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(dialogEl);

      dialogEl.addEventListener("click", (ev) => {
        const action = ev.target.closest("[data-action]")?.dataset.action;
        if (action === "cancel") {
          cancel();
          return;
        }
        if (action === "ok") {
          commit();
          return;
        }

        const pickBtn = ev.target.closest("[data-color-pick]");
        if (pickBtn) {
          closeMultiSelectMenus();
          ev.preventDefault();
          ev.stopPropagation();
          const section = pickBtn.dataset.section;
          const key = pickBtn.dataset.key;
          if (!section || !key) return;
          colorPicker.open(pickBtn, String(getDraft()[section]?.[key] ?? "#2962ff"), {
            alpha: pickBtn.dataset.alpha === "true",
            onChange: (value) => {
              const skipHistory = colorUndoMarked;
              if (!colorUndoMarked) colorUndoMarked = true;
              setDraft(section, key, value, { skipHistory });
            },
            onClose: () => {
              colorUndoMarked = false;
              renderPanel();
            },
          });
          return;
        }

        const lineWidthBtn = ev.target.closest("[data-line-width-pick]");
        if (lineWidthBtn) {
          closeMultiSelectMenus();
          ev.preventDefault();
          ev.stopPropagation();
          const section = lineWidthBtn.dataset.section;
          const widthKey = lineWidthBtn.dataset.widthKey;
          if (!section || !widthKey) return;
          const up = String(getDraft()[section]?.symbolLabelLineUpColor ?? "#089981");
          colorPicker.openLine(
            lineWidthBtn,
            {
              color: up,
              width: Number(getDraft()[section]?.[widthKey]) || 1,
            },
            {
              onChange: ({ width }) => {
                const skipHistory = colorUndoMarked;
                if (!colorUndoMarked) colorUndoMarked = true;
                setDraftLine(section, null, widthKey, { width }, { skipHistory });
              },
              onClose: () => {
                colorUndoMarked = false;
                renderPanel();
              },
            },
          );
          return;
        }

        const linePickBtn = ev.target.closest("[data-line-color-pick]");
        if (linePickBtn) {
          closeMultiSelectMenus();
          ev.preventDefault();
          ev.stopPropagation();
          const section = linePickBtn.dataset.section;
          const colorKey = linePickBtn.dataset.colorKey;
          const widthKey = linePickBtn.dataset.widthKey;
          const opacityKey = linePickBtn.dataset.opacityKey || "";
          const styleKey = linePickBtn.dataset.styleKey || "";
          if (!section || !colorKey || !widthKey) return;
          colorPicker.openLine(
            linePickBtn,
            {
              color: String(getDraft()[section]?.[colorKey] ?? "#9c9c9c"),
              width: Number(getDraft()[section]?.[widthKey]) || 1,
              opacity: opacityKey ? Number(getDraft()[section]?.[opacityKey] ?? 100) : 100,
              style: styleKey ? Number(getDraft()[section]?.[styleKey] ?? 2) : 2,
            },
            {
              showOpacity: Boolean(opacityKey),
              showLineStyle: Boolean(styleKey),
              onChange: ({ color, width, opacity, style }) => {
                const skipHistory = colorUndoMarked;
                if (!colorUndoMarked) colorUndoMarked = true;
                setDraftLine(
                  section,
                  colorKey,
                  widthKey,
                  { color, width, opacity, style },
                  { opacityKey: opacityKey || undefined, styleKey: styleKey || undefined, skipHistory },
                );
              },
              onClose: () => {
                colorUndoMarked = false;
                renderPanel();
              },
            },
          );
          return;
        }

        const tab = ev.target.closest(".tv-settings__tab");
        if (tab) {
          closeMultiSelectMenus();
          activeSection = resolveSettingsSection(tab.dataset.section ?? activeSection);
          saveSettingsUiState({ lastSection: activeSection });
          renderPanel();
          return;
        }

        const multiCheck = ev.target.closest("[data-multi-check]");
        if (multiCheck) {
          ev.preventDefault();
          ev.stopPropagation();
          const section = multiCheck.dataset.section;
          const key = multiCheck.dataset.key;
          if (section && key) {
            setDraft(section, key, !getDraft()[section]?.[key]);
            const wrap = multiCheck.closest("[data-multi-select-wrap]");
            const summary = wrap?.querySelector("[data-multi-select-summary]");
            if (summary && section === "canvas" && WATERMARK_PARTS.some((p) => p.key === key)) {
              summary.textContent = watermarkPartsSummary(section);
            }
            if (summary && section === "scales" && SYMBOL_LABEL_PARTS.some((p) => p.key === key)) {
              summary.textContent = symbolLabelSummary(section);
            }
          }
          return;
        }

        const multiTrigger = ev.target.closest("[data-multi-select-trigger]");
        if (multiTrigger) {
          ev.preventDefault();
          ev.stopPropagation();
          const wrap = multiTrigger.closest("[data-multi-select-wrap]");
          const menu = wrap?.querySelector("[data-multi-select-menu]");
          if (!menu) return;
          const willOpen = menu.hidden;
          closeMultiSelectMenus();
          if (willOpen) {
            menu.hidden = false;
            multiTrigger.setAttribute("aria-expanded", "true");
            positionMultiSelectMenu(menu, multiTrigger);
          }
          return;
        }

        if (!ev.target.closest("[data-multi-select-wrap]")) {
          closeMultiSelectMenus();
        }

        const checkRowEl = ev.target.closest("[data-check-row]");
        if (checkRowEl && !ev.target.closest("[data-color-pick]")) {
          const section = checkRowEl.dataset.section;
          const key = checkRowEl.dataset.key;
          if (section && key) setDraft(section, key, !getDraft()[section]?.[key]);
          return;
        }

        const drawingCheckRowEl = ev.target.closest("[data-drawing-check]");
        if (drawingCheckRowEl && !ev.target.closest("[data-color-pick]")) {
          const key = drawingCheckRowEl.dataset.key;
          if (key) {
            const current = Boolean(getDrawingSettings?.()?.[key]);
            setDrawingSetting?.(key, !current);
            renderPanel();
          }
        }
      });

      dialogEl.addEventListener("change", (ev) => {
        const t = ev.target;
        if (t instanceof HTMLSelectElement && t.dataset.themeSelect !== undefined) {
          const mode = t.value === "light" ? "light" : "dark";
          onThemeChange?.(mode);
          if (draft) {
            snapshot = structuredClone(store.get());
            draft = structuredClone(store.get());
          }
          return;
        }
        if (t instanceof HTMLSelectElement) {
          const section = t.dataset.section;
          const key = t.dataset.key;
          if (!section || !key) return;
          setDraft(section, key, t.value);
          return;
        }
        if (t instanceof HTMLInputElement && t.type === "range") {
          const section = t.dataset.section;
          const key = t.dataset.key;
          if (!section || !key) return;
          setDraft(section, key, Number(t.value), { skipHistory: true });
          const fill = t.closest(".tv-set__opacity-track")?.querySelector(".tv-set__opacity-fill");
          if (fill) fill.style.width = `${t.value}%`;
          return;
        }
        if (t instanceof HTMLInputElement && t.type === "text" && t.dataset.section) {
          const section = t.dataset.section;
          const key = t.dataset.key;
          if (!section || !key) return;
          const num = parseFloat(t.value);
          if (!Number.isNaN(num)) setDraft(section, key, num);
        }
      });

      dialogEl.addEventListener("input", (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLInputElement) || t.type !== "range") return;
        const section = t.dataset.section;
        const key = t.dataset.key;
        if (!section || !key) return;
        if (!draft?.[section] || !(key in draft[section])) return;
        draft[section][key] = Number(t.value);
        store.set(section, key, Number(t.value), { skipHistory: true });
        applyLive();
        const fill = t.closest(".tv-set__opacity-track")?.querySelector(".tv-set__opacity-fill");
        if (fill) fill.style.width = `${t.value}%`;
      });

      mountDialogDrag();
    }

    renderPanel();
    dialogEl.hidden = false;
    document.body.classList.add("tv-settings-open");
    requestAnimationFrame(() => positionSettingsDialog());
  }

  function close() {
    if (!dialogEl) return;
    colorPicker.close();
    colorUndoMarked = false;
    saveSettingsUiState({ lastSection: activeSection, dialogPos });
    dialogEl.hidden = true;
    document.body.classList.remove("tv-settings-open");
    draft = null;
    snapshot = null;
    undoDepthAtOpen = 0;
  }

  function bindTrigger(el) {
    if (!(el instanceof HTMLElement) || el.dataset.chartSettingsTrigger) return;
    el.dataset.chartSettingsTrigger = "1";
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      open();
    });
  }

  if (triggerEl) bindTrigger(triggerEl);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && dialogEl && !dialogEl.hidden) {
      cancel();
      return;
    }
    handleUndoRedo(ev);
  });

  return { open, close, bindTrigger };
}
