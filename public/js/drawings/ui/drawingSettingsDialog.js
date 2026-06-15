import { createColorPicker, applyColorOpacity } from "../../ui/colorPicker.js";
import {
  createTvMenu,
  TEXT_ALIGN_V_ITEMS,
  TEXT_ALIGN_H_ITEMS,
  EXTEND_CHECKBOX_ITEMS,
} from "./tvMenu.js";
import { extendSummaryLabel, supportsExtendSettings } from "../geometry/lineExtend.js";
import { TOOL_LABELS } from "../catalog/toolCatalog.js";

const MENU_CHEVRON = `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/></svg>`;

const VISIBILITY_KEYS = ["ticks", "seconds", "minutes", "hours", "days", "weeks", "months", "ranges"];

/** @param {import("../types.js").UserDrawing} drawing */
function defaultVisibility(drawing) {
  return drawing.visibility ?? Object.fromEntries(VISIBILITY_KEYS.map((k) => [k, true]));
}

/** @param {number} time @param {{ time: number }[]} bars */
function timeToBarIndex(time, bars) {
  if (!bars.length) return 0;
  let best = 0;
  let bestDist = Math.abs(bars[0].time - time);
  for (let i = 1; i < bars.length; i += 1) {
    const dist = Math.abs(bars[i].time - time);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * @param {object} opts
 * @param {ReturnType<typeof import("../controller/drawingController.js").createDrawingController>} opts.controller
 * @param {() => { bars: { time: number }[], precision?: number }} opts.getContext
 */
export function createDrawingSettingsDialog(opts) {
  const { controller, getContext } = opts;
  const colorPicker = createColorPicker();
  const tvMenu = createTvMenu();

  const root = document.createElement("div");
  root.className = "tv-drawing-settings";
  root.hidden = true;
  root.innerHTML = `<div class="tv-drawing-settings__backdrop" data-backdrop></div>
    <div class="tv-drawing-settings__dialog" role="dialog" aria-modal="true" aria-labelledby="tv-drawing-settings-title">
      <div class="tv-drawing-settings__header">
        <div class="tv-drawing-settings__title-wrap">
          <span id="tv-drawing-settings-title" class="tv-drawing-settings__title" data-dialog-title>Trendline</span>
        </div>
        <button type="button" class="tv-drawing-settings__close" data-close aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" d="m1.5 1.5 15 15m0-15-15 15"/></svg>
        </button>
      </div>
      <div class="tv-drawing-settings__tabs" role="tablist">
        <button type="button" class="tv-drawing-settings__tab is-selected" data-tab="style" role="tab" aria-selected="true">Style</button>
        <button type="button" class="tv-drawing-settings__tab" data-tab="text" role="tab" aria-selected="false">Text</button>
        <button type="button" class="tv-drawing-settings__tab" data-tab="coordinates" role="tab" aria-selected="false">Coordinates</button>
        <button type="button" class="tv-drawing-settings__tab" data-tab="visibility" role="tab" aria-selected="false">Visibility</button>
        <div class="tv-drawing-settings__tab-underline" data-tab-underline></div>
      </div>
      <div class="tv-drawing-settings__body">
        <div class="tv-drawing-settings__panel" data-panel="style">
          <div class="tv-drawing-settings__section-title">Line</div>
          <div class="tv-drawing-settings__row">
            <button type="button" class="tv-drawing-settings__color-btn" data-style-color aria-label="Line color">
              <span class="tv-drawing-settings__color-swatch" data-style-swatch></span>
              <span class="tv-drawing-settings__color-line" data-style-line></span>
            </button>
          </div>
          <div class="tv-drawing-settings__section-title" data-extend-section hidden>Extend</div>
          <div class="tv-drawing-settings__row" data-extend-section hidden>
            <button type="button" class="tv-drawing-settings__menu-btn" data-extend-btn aria-haspopup="listbox">
              <span data-extend-label>Don't extend</span>
              <span class="tv-drawing-settings__menu-chevron">${MENU_CHEVRON}</span>
            </button>
          </div>
        </div>
        <div class="tv-drawing-settings__panel" data-panel="text" hidden>
          <div class="tv-drawing-settings__text-toolbar">
            <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-text-color aria-label="Text color">
              <span class="tv-drawing-settings__color-swatch" data-text-swatch></span>
            </button>
            <select class="tv-drawing-settings__select tv-drawing-settings__select--small" data-font-size>
              <option value="10">10</option>
              <option value="12">12</option>
              <option value="14" selected>14</option>
              <option value="16">16</option>
              <option value="18">18</option>
            </select>
          </div>
          <textarea class="tv-drawing-settings__textarea" data-text-input rows="5" placeholder="Add text"></textarea>
          <div class="tv-drawing-settings__section-title">Text alignment</div>
          <div class="tv-drawing-settings__row tv-drawing-settings__row--pair">
            <button type="button" class="tv-drawing-settings__menu-btn" data-align-v-btn aria-haspopup="listbox">
              <span data-align-v-label>Top</span>
              <span class="tv-drawing-settings__menu-chevron">${MENU_CHEVRON}</span>
            </button>
            <button type="button" class="tv-drawing-settings__menu-btn" data-align-h-btn aria-haspopup="listbox">
              <span data-align-h-label>Center</span>
              <span class="tv-drawing-settings__menu-chevron">${MENU_CHEVRON}</span>
            </button>
          </div>
        </div>
        <div class="tv-drawing-settings__panel" data-panel="coordinates" hidden data-coords-panel></div>
        <div class="tv-drawing-settings__panel" data-panel="visibility" hidden>
          <div class="tv-drawing-settings__visibility-list" data-visibility-list></div>
        </div>
      </div>
      <div class="tv-drawing-settings__footer">
        <button type="button" class="tv-drawing-settings__btn tv-drawing-settings__btn--secondary" data-cancel>Cancel</button>
        <button type="button" class="tv-drawing-settings__btn tv-drawing-settings__btn--primary" data-submit>Ok</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const dialog = root.querySelector(".tv-drawing-settings__dialog");
  const titleEl = root.querySelector("[data-dialog-title]");
  const tabUnderline = root.querySelector("[data-tab-underline]");
  const styleSwatch = root.querySelector("[data-style-swatch]");
  const styleLine = root.querySelector("[data-style-line]");
  const textSwatch = root.querySelector("[data-text-swatch]");
  const textInput = root.querySelector("[data-text-input]");
  const coordsPanel = root.querySelector("[data-coords-panel]");
  const visibilityList = root.querySelector("[data-visibility-list]");
  const fontSizeEl = root.querySelector("[data-font-size]");
  const alignVBtn = root.querySelector("[data-align-v-btn]");
  const alignHBtn = root.querySelector("[data-align-h-btn]");
  const alignVLabel = root.querySelector("[data-align-v-label]");
  const alignHLabel = root.querySelector("[data-align-h-label]");
  const extendBtn = root.querySelector("[data-extend-btn]");
  const extendLabel = root.querySelector("[data-extend-label]");
  const extendSections = root.querySelectorAll("[data-extend-section]");

  if (
    !dialog ||
    !titleEl ||
    !tabUnderline ||
    !styleSwatch ||
    !styleLine ||
    !textSwatch ||
    !textInput ||
    !coordsPanel ||
    !visibilityList
  ) {
    throw new Error("Drawing settings dialog mount failed");
  }

  visibilityList.innerHTML = VISIBILITY_KEYS.map(
    (key) => `<label class="tv-drawing-settings__check">
      <input type="checkbox" data-vis-key="${key}" checked />
      <span>${key.charAt(0).toUpperCase() + key.slice(1)}</span>
    </label>`,
  ).join("");

  /** @type {string | null} */
  let drawingId = null;
  /** @type {Record<string, unknown>} */
  let draft = {};
  let activeTab = "style";

  function setTab(tab) {
    activeTab = tab;
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const on = btn.dataset.tab === tab;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll("[data-panel]").forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.hidden = panel.dataset.panel !== tab;
    });
    const activeBtn = root.querySelector(`[data-tab="${tab}"]`);
    if (activeBtn instanceof HTMLElement) {
      const tabsRect = activeBtn.parentElement?.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      if (tabsRect) {
        tabUnderline.style.width = `${btnRect.width}px`;
        tabUnderline.style.transform = `translateX(${btnRect.left - tabsRect.left}px)`;
      }
    }
  }

  function syncAlignLabels() {
    const v = TEXT_ALIGN_V_ITEMS.find((i) => i.id === draft.textAlignV) ?? TEXT_ALIGN_V_ITEMS[0];
    const h = TEXT_ALIGN_H_ITEMS.find((i) => i.id === draft.textAlignH) ?? TEXT_ALIGN_H_ITEMS[1];
    if (alignVLabel) alignVLabel.textContent = v.label;
    if (alignHLabel) alignHLabel.textContent = h.label;
  }

  function resolveDrawingExtendFlags(drawingType, drawing) {
    if (drawingType === "extended-line") {
      return {
        extendLeft: drawing.extendLeft !== false,
        extendRight: drawing.extendRight !== false,
      };
    }
    if (drawingType === "ray") {
      return {
        extendLeft: Boolean(drawing.extendLeft),
        extendRight: drawing.extendRight !== false,
      };
    }
    return {
      extendLeft: Boolean(drawing.extendLeft),
      extendRight: Boolean(drawing.extendRight),
    };
  }

  function syncExtendUi() {
    const show = supportsExtendSettings(String(draft.drawingType ?? ""));
    extendSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = !show;
    });
    if (extendLabel) {
      extendLabel.textContent = extendSummaryLabel(Boolean(draft.extendLeft), Boolean(draft.extendRight));
    }
  }

  function patchDrawing(patch) {
    if (!drawingId) return;
    Object.assign(draft, patch);
    controller.updateDrawing(drawingId, patch);
  }

  function syncColorUi() {
    const color = draft.color ?? "#2962FF";
    const opacity = draft.colorOpacity ?? 100;
    const textColor = draft.textColor ?? color;
    const textOpacity = draft.textColorOpacity ?? 100;
    const width = draft.lineWidth ?? 2;
    if (styleSwatch instanceof HTMLElement) {
      styleSwatch.style.backgroundColor = applyColorOpacity(color, opacity);
    }
    if (styleLine instanceof HTMLElement) {
      styleLine.style.backgroundColor = applyColorOpacity(color, opacity);
      styleLine.style.height = `${width}px`;
    }
    if (textSwatch instanceof HTMLElement) {
      textSwatch.style.backgroundColor = applyColorOpacity(textColor, textOpacity);
    }
  }

  function buildCoordsPanel(points) {
    const { bars } = getContext();
    coordsPanel.innerHTML = points
      .map((p, i) => {
        const barIdx = timeToBarIndex(p.time, bars);
        const precision = getContext().precision ?? 2;
        return `<div class="tv-drawing-settings__coord-group">
          <div class="tv-drawing-settings__coord-label">#${i + 1} (price, bar)</div>
          <div class="tv-drawing-settings__row tv-drawing-settings__row--pair">
            <input type="text" class="tv-drawing-settings__input" data-coord-price="${i}" inputmode="decimal" value="${Number(p.price).toFixed(precision)}" />
            <input type="text" class="tv-drawing-settings__input" data-coord-bar="${i}" inputmode="numeric" value="${barIdx}" />
          </div>
        </div>`;
      })
      .join("");
  }

  function readDraftFromUi() {
    const points = [...(draft.points ?? [])];
    coordsPanel.querySelectorAll("[data-coord-price]").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const i = Number(input.dataset.coordPrice);
      const price = Number(input.value);
      if (points[i] && Number.isFinite(price)) points[i] = { ...points[i], price };
    });
    coordsPanel.querySelectorAll("[data-coord-bar]").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const i = Number(input.dataset.coordBar);
      const barIdx = Math.max(0, Math.round(Number(input.value) || 0));
      const { bars } = getContext();
      const bar = bars[barIdx];
      if (points[i] && bar) points[i] = { ...points[i], time: bar.time };
    });

    const visibility = { ...defaultVisibility({ visibility: draft.visibility }) };
    visibilityList.querySelectorAll("[data-vis-key]").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const key = input.dataset.visKey;
      if (key) visibility[key] = input.checked;
    });

    const extend = resolveDrawingExtendFlags(draft.drawingType, draft);
    return {
      ...draft,
      points,
      label: textInput instanceof HTMLTextAreaElement ? textInput.value : draft.label,
      fontSize: fontSizeEl instanceof HTMLSelectElement ? Number(fontSizeEl.value) : draft.fontSize,
      extendLeft: extend.extendLeft,
      extendRight: extend.extendRight,
      visibility,
    };
  }

  function openForDrawing(drawing) {
    drawingId = drawing.id;
    const extend = resolveDrawingExtendFlags(drawing.type, drawing);
    draft = {
      drawingType: drawing.type,
      color: drawing.color,
      colorOpacity: drawing.colorOpacity ?? 100,
      textColor: drawing.textColor,
      textColorOpacity: drawing.textColorOpacity ?? 100,
      lineWidth: drawing.lineWidth,
      lineStyle: drawing.lineStyle,
      points: drawing.points.map((p) => ({ ...p })),
      label: drawing.label ?? "",
      fontSize: drawing.fontSize ?? 14,
      textAlignV: drawing.textAlignV ?? "top",
      textAlignH: drawing.textAlignH ?? "center",
      extendLeft: extend.extendLeft,
      extendRight: extend.extendRight,
      visibility: defaultVisibility(drawing),
    };
    titleEl.textContent = TOOL_LABELS[drawing.type] ?? drawing.type;
    if (textInput instanceof HTMLTextAreaElement) textInput.value = String(draft.label ?? "");
    if (fontSizeEl instanceof HTMLSelectElement) fontSizeEl.value = String(draft.fontSize ?? 14);
    visibilityList.querySelectorAll("[data-vis-key]").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const key = input.dataset.visKey;
      if (key) input.checked = Boolean(draft.visibility?.[key]);
    });
    buildCoordsPanel(draft.points);
    syncAlignLabels();
    syncExtendUi();
    syncColorUi();
    setTab("style");
    root.hidden = false;
  }

  function close() {
    root.hidden = true;
    drawingId = null;
    draft = {};
    colorPicker.close();
    tvMenu.close();
  }

  function submit() {
    if (!drawingId) return;
    const patch = readDraftFromUi();
    controller.updateDrawing(drawingId, patch);
    close();
  }

  root.querySelector("[data-backdrop]")?.addEventListener("click", close);
  root.querySelector("[data-close]")?.addEventListener("click", close);
  root.querySelector("[data-cancel]")?.addEventListener("click", close);
  root.querySelector("[data-submit]")?.addEventListener("click", submit);

  root.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn instanceof HTMLElement && btn.dataset.tab) setTab(btn.dataset.tab);
    });
  });

  if (textInput instanceof HTMLTextAreaElement) {
    textInput.addEventListener("input", () => {
      if (!drawingId) return;
      patchDrawing({ label: textInput.value });
    });
  }

  fontSizeEl?.addEventListener("change", () => {
    if (!drawingId || !(fontSizeEl instanceof HTMLSelectElement)) return;
    patchDrawing({ fontSize: Number(fontSizeEl.value) || 14 });
  });

  extendBtn?.addEventListener("click", () => {
    if (!(extendBtn instanceof HTMLElement)) return;
    tvMenu.openCheckboxMenu(extendBtn, EXTEND_CHECKBOX_ITEMS, {
      checked: {
        left: Boolean(draft.extendLeft),
        right: Boolean(draft.extendRight),
      },
      onChange: (id, checked) => {
        if (id === "left") patchDrawing({ extendLeft: checked });
        else if (id === "right") patchDrawing({ extendRight: checked });
        syncExtendUi();
      },
    });
  });

  alignVBtn?.addEventListener("click", () => {
    if (!(alignVBtn instanceof HTMLElement)) return;
    tvMenu.open(alignVBtn, TEXT_ALIGN_V_ITEMS, {
      activeId: String(draft.textAlignV ?? "top"),
      onSelect: (id) => {
        patchDrawing({ textAlignV: id });
        syncAlignLabels();
      },
    });
  });

  alignHBtn?.addEventListener("click", () => {
    if (!(alignHBtn instanceof HTMLElement)) return;
    tvMenu.open(alignHBtn, TEXT_ALIGN_H_ITEMS, {
      activeId: String(draft.textAlignH ?? "center"),
      onSelect: (id) => {
        patchDrawing({ textAlignH: id });
        syncAlignLabels();
      },
    });
  });

  root.querySelector("[data-style-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openSwatch(
      btn,
      { color: draft.color ?? "#2962FF", opacity: draft.colorOpacity ?? 100 },
      {
        onChange: (value) => {
          draft.color = value.color;
          draft.colorOpacity = value.opacity;
          syncColorUi();
        },
      },
    );
  });

  root.querySelector("[data-text-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openSwatch(
      btn,
      {
        color: draft.textColor ?? draft.color ?? "#2962FF",
        opacity: draft.textColorOpacity ?? 100,
      },
      {
        onChange: (value) => {
          draft.textColor = value.color;
          draft.textColorOpacity = value.opacity;
          syncColorUi();
          if (drawingId) {
            controller.updateDrawing(drawingId, {
              textColor: value.color,
              textColorOpacity: value.opacity,
            });
          }
        },
      },
    );
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !root.hidden) close();
  });

  return {
    open(drawing, options = {}) {
      if (!drawing) return;
      openForDrawing(drawing);
      if (options.tab) setTab(options.tab);
    },
    close,
    destroy() {
      root.remove();
    },
  };
}
