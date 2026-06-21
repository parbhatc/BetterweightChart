import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  REGRESSION_SOURCE_ITEMS,
  REGRESSION_TREND_DEFAULTS,
  regressionLineStyle,
  supportsRegressionTrendSettings,
} from "../../tools/regression/trend.js";

const MENU_CHEVRON = `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/></svg>`;
import { CHECK_SVG, lineStylePreviewHtml, setTvCheck } from "../dialog/utils.js";

/** @param {HTMLElement} btn @param {boolean} on */
export function setRegressionCheck(btn, on) {
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.classList.toggle("tv-set__check--on", on);
  btn.setAttribute("aria-checked", on ? "true" : "false");
  const box = btn.querySelector(".tv-set__check-box");
  if (box) box.innerHTML = on ? CHECK_SVG : "";
}

/**
 * @param {Record<string, unknown>} draft
 * @param {string} key
 */
function linePreviewHtml(draft, key) {
  const style = regressionLineStyle(draft, key);
  return lineStylePreviewHtml(style.color, style.opacity, style.width, style.style);
}

/**
 * @param {HTMLElement} inputsPanel
 * @param {HTMLElement} styleSection
 */
export function ensureRegressionTrendSettingsMarkup(inputsPanel, styleSection) {
  if (inputsPanel.dataset.lastInputsTool !== "regression") {
    inputsPanel.dataset.regressionReady = "1";
    inputsPanel.dataset.lastInputsTool = "regression";
    delete inputsPanel.dataset.positionReady;
    inputsPanel.innerHTML = `
      <div class="tv-set__section">
        <div class="tv-set__section-body tv-set__section-body--fields">
          <div class="tv-set__field-row">
            <span class="tv-set__field-label">Upper Deviation</span>
            <input type="text" class="tv-drawing-settings__input" data-reg-upper-dev inputmode="decimal" value="2" />
          </div>
          <div class="tv-set__field-row">
            <span class="tv-set__field-label">Lower Deviation</span>
            <input type="text" class="tv-drawing-settings__input" data-reg-lower-dev inputmode="decimal" value="-2" />
          </div>
          <div class="tv-set__check-row">
            <button type="button" class="tv-set__check tv-set__check--on" data-reg-use-upper role="checkbox" aria-checked="true" aria-label="Use Upper Deviation">
              <span class="tv-set__check-box">${CHECK_SVG}</span>
            </button>
            <span class="tv-set__check-label">Use Upper Deviation</span>
          </div>
          <div class="tv-set__check-row">
            <button type="button" class="tv-set__check tv-set__check--on" data-reg-use-lower role="checkbox" aria-checked="true" aria-label="Use Lower Deviation">
              <span class="tv-set__check-box">${CHECK_SVG}</span>
            </button>
            <span class="tv-set__check-label">Use Lower Deviation</span>
          </div>
          <div class="tv-set__field-row">
            <span class="tv-set__field-label">Source</span>
            <div class="tv-set__select-wrap">
              <button type="button" class="tv-drawing-settings__menu-btn" data-reg-source-btn aria-haspopup="listbox">
                <span data-reg-source-label>Close</span>
                <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  if (!styleSection.dataset.regressionReady) {
    styleSection.dataset.regressionReady = "1";
    styleSection.innerHTML = `
      <div class="tv-set__section-body" data-reg-lines-list></div>
      <div class="tv-set__section-body">
        <div class="tv-set__check-row">
          <button type="button" class="tv-set__check" data-reg-extend role="checkbox" aria-checked="false" aria-label="Extend lines">
            <span class="tv-set__check-box"></span>
          </button>
          <span class="tv-set__check-label">Extend lines</span>
        </div>
        <div class="tv-set__check-row">
          <button type="button" class="tv-set__check tv-set__check--on" data-reg-pearson role="checkbox" aria-checked="true" aria-label="Pearson's R">
            <span class="tv-set__check-box">${CHECK_SVG}</span>
          </button>
          <span class="tv-set__check-label">Pearson's R</span>
        </div>
      </div>`;
  }
}

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function syncRegressionTrendDialogUi(root, draft) {
  const show = supportsRegressionTrendSettings(String(draft.drawingType ?? ""));
  const inputsTab = root.querySelector('[data-tab="inputs"]');
  const textTab = root.querySelector('[data-tab="text"]');
  const inputsPanel = root.querySelector('[data-panel="inputs"]');
  const lineSection = root.querySelector("[data-line-section]");
  const regressionStyleSection = root.querySelector("[data-regression-style-section]");
  const extendSection = root.querySelector("[data-extend-section]");
  const trendlineSections = root.querySelectorAll("[data-trendline-section]");

  if (inputsTab instanceof HTMLElement) inputsTab.hidden = !show;
  if (textTab instanceof HTMLElement) textTab.hidden = show;
  if (lineSection instanceof HTMLElement) lineSection.hidden = show;
  if (regressionStyleSection instanceof HTMLElement) regressionStyleSection.hidden = !show;
  if (extendSection instanceof HTMLElement) extendSection.hidden = show;
  trendlineSections.forEach((el) => {
    if (el instanceof HTMLElement && show) el.hidden = true;
  });

  if (!show || !(inputsPanel instanceof HTMLElement) || !(regressionStyleSection instanceof HTMLElement)) {
    return;
  }

  ensureRegressionTrendSettingsMarkup(inputsPanel, regressionStyleSection);

  const upperDev = root.querySelector("[data-reg-upper-dev]");
  const lowerDev = root.querySelector("[data-reg-lower-dev]");
  if (upperDev instanceof HTMLInputElement) {
    upperDev.value = String(draft.regressionUpperDeviation ?? REGRESSION_TREND_DEFAULTS.regressionUpperDeviation);
  }
  if (lowerDev instanceof HTMLInputElement) {
    lowerDev.value = String(draft.regressionLowerDeviation ?? REGRESSION_TREND_DEFAULTS.regressionLowerDeviation);
  }

  setRegressionCheck(root.querySelector("[data-reg-use-upper]"), draft.regressionUseUpperDeviation !== false);
  setRegressionCheck(root.querySelector("[data-reg-use-lower]"), draft.regressionUseLowerDeviation !== false);
  setRegressionCheck(root.querySelector("[data-reg-extend]"), Boolean(draft.regressionExtendLines));
  setRegressionCheck(root.querySelector("[data-reg-pearson]"), draft.regressionShowPearsons !== false);

  const sourceItem =
    REGRESSION_SOURCE_ITEMS.find((i) => i.id === draft.regressionSource) ?? REGRESSION_SOURCE_ITEMS[3];
  const sourceLabel = root.querySelector("[data-reg-source-label]");
  if (sourceLabel) sourceLabel.textContent = sourceItem.label;

  const linesList = regressionStyleSection.querySelector("[data-reg-lines-list]");
  if (linesList instanceof HTMLElement) {
    const rows = [
      { key: "base", label: "Base" },
      { key: "up", label: "Up" },
      { key: "down", label: "Down" },
    ];
    linesList.innerHTML = rows
      .map(({ key, label }) => {
        const enabledKey =
          key === "base" ? "regressionBaseEnabled" : key === "up" ? "regressionUpEnabled" : "regressionDownEnabled";
        const enabled = draft[enabledKey] !== false;
        return `<div class="tv-set__check-row">
          <button type="button" class="tv-set__check${enabled ? " tv-set__check--on" : ""}" data-reg-line-enable="${key}" role="checkbox" aria-checked="${enabled ? "true" : "false"}" aria-label="${label}">
            <span class="tv-set__check-box">${enabled ? CHECK_SVG : ""}</span>
          </button>
          <span class="tv-set__check-label">${label}</span>
        </div>
        <div class="tv-set__section-body tv-drawing-settings__line-row tv-reg-line-style-row">
          <button type="button" class="tv-drawing-settings__line-control tv-drawing-settings__line-control--color" data-reg-line-color="${key}" aria-label="${label} line color" ${enabled ? "" : "disabled"}>
            <span class="tv-drawing-settings__color-swatch" data-reg-line-swatch="${key}"></span>
          </button>
          <button type="button" class="tv-drawing-settings__line-control tv-drawing-settings__line-control--style" data-reg-line-style="${key}" aria-label="${label} line style" ${enabled ? "" : "disabled"}>
            <span class="tv-drawing-settings__line-preview" data-reg-line-preview="${key}">${linePreviewHtml(draft, key)}</span>
          </button>
        </div>`;
      })
      .join("");

    rows.forEach(({ key }) => {
      const style = regressionLineStyle(draft, /** @type {"base" | "up" | "down"} */ (key));
      const swatch = linesList.querySelector(`[data-reg-line-swatch="${key}"]`);
      const preview = linesList.querySelector(`[data-reg-line-preview="${key}"]`);
      if (swatch instanceof HTMLElement) {
        swatch.style.backgroundColor = applyColorOpacity(style.color, style.opacity);
      }
      if (preview instanceof HTMLElement) {
        preview.innerHTML = linePreviewHtml(draft, key);
      }
    });
  }
}

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function readRegressionTrendDraftFromUi(root, draft) {
  if (!supportsRegressionTrendSettings(String(draft.drawingType ?? ""))) return {};

  const upperDev = root.querySelector("[data-reg-upper-dev]");
  const lowerDev = root.querySelector("[data-reg-lower-dev]");
  const patch = {
    regressionUseUpperDeviation: root.querySelector("[data-reg-use-upper]")?.classList.contains("tv-set__check--on") ?? true,
    regressionUseLowerDeviation: root.querySelector("[data-reg-use-lower]")?.classList.contains("tv-set__check--on") ?? true,
    regressionExtendLines: root.querySelector("[data-reg-extend]")?.classList.contains("tv-set__check--on") ?? false,
    regressionShowPearsons: root.querySelector("[data-reg-pearson]")?.classList.contains("tv-set__check--on") ?? true,
    regressionBaseEnabled: root.querySelector('[data-reg-line-enable="base"]')?.classList.contains("tv-set__check--on") ?? true,
    regressionUpEnabled: root.querySelector('[data-reg-line-enable="up"]')?.classList.contains("tv-set__check--on") ?? true,
    regressionDownEnabled: root.querySelector('[data-reg-line-enable="down"]')?.classList.contains("tv-set__check--on") ?? true,
  };

  if (upperDev instanceof HTMLInputElement) {
    const parsed = Number(upperDev.value);
    if (Number.isFinite(parsed)) patch.regressionUpperDeviation = parsed;
  }
  if (lowerDev instanceof HTMLInputElement) {
    const parsed = Number(lowerDev.value);
    if (Number.isFinite(parsed)) patch.regressionLowerDeviation = parsed;
  }

  return patch;
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function regressionTrendDraftFromDrawing(drawing) {
  return {
    regressionUpperDeviation: drawing.regressionUpperDeviation ?? REGRESSION_TREND_DEFAULTS.regressionUpperDeviation,
    regressionLowerDeviation: drawing.regressionLowerDeviation ?? REGRESSION_TREND_DEFAULTS.regressionLowerDeviation,
    regressionUseUpperDeviation: drawing.regressionUseUpperDeviation ?? REGRESSION_TREND_DEFAULTS.regressionUseUpperDeviation,
    regressionUseLowerDeviation: drawing.regressionUseLowerDeviation ?? REGRESSION_TREND_DEFAULTS.regressionUseLowerDeviation,
    regressionSource: drawing.regressionSource ?? REGRESSION_TREND_DEFAULTS.regressionSource,
    regressionBaseEnabled: drawing.regressionBaseEnabled ?? REGRESSION_TREND_DEFAULTS.regressionBaseEnabled,
    regressionBaseColor: drawing.regressionBaseColor ?? REGRESSION_TREND_DEFAULTS.regressionBaseColor,
    regressionBaseOpacity: drawing.regressionBaseOpacity ?? REGRESSION_TREND_DEFAULTS.regressionBaseOpacity,
    regressionBaseWidth: drawing.regressionBaseWidth ?? REGRESSION_TREND_DEFAULTS.regressionBaseWidth,
    regressionBaseStyle: drawing.regressionBaseStyle ?? REGRESSION_TREND_DEFAULTS.regressionBaseStyle,
    regressionUpEnabled: drawing.regressionUpEnabled ?? REGRESSION_TREND_DEFAULTS.regressionUpEnabled,
    regressionUpColor: drawing.regressionUpColor ?? REGRESSION_TREND_DEFAULTS.regressionUpColor,
    regressionUpOpacity: drawing.regressionUpOpacity ?? REGRESSION_TREND_DEFAULTS.regressionUpOpacity,
    regressionUpWidth: drawing.regressionUpWidth ?? drawing.lineWidth ?? REGRESSION_TREND_DEFAULTS.regressionUpWidth,
    regressionUpStyle: drawing.regressionUpStyle ?? REGRESSION_TREND_DEFAULTS.regressionUpStyle,
    regressionDownEnabled: drawing.regressionDownEnabled ?? REGRESSION_TREND_DEFAULTS.regressionDownEnabled,
    regressionDownColor:
      drawing.regressionDownColor ?? drawing.regressionBaseColor ?? REGRESSION_TREND_DEFAULTS.regressionDownColor,
    regressionDownOpacity:
      drawing.regressionDownOpacity ?? drawing.regressionBaseOpacity ?? REGRESSION_TREND_DEFAULTS.regressionDownOpacity,
    regressionDownWidth: drawing.regressionDownWidth ?? drawing.lineWidth ?? REGRESSION_TREND_DEFAULTS.regressionDownWidth,
    regressionDownStyle: drawing.regressionDownStyle ?? REGRESSION_TREND_DEFAULTS.regressionDownStyle,
    regressionExtendLines: drawing.regressionExtendLines ?? REGRESSION_TREND_DEFAULTS.regressionExtendLines,
    regressionShowPearsons: drawing.regressionShowPearsons ?? REGRESSION_TREND_DEFAULTS.regressionShowPearsons,
    regressionUpperFillOpacity: drawing.regressionUpperFillOpacity ?? REGRESSION_TREND_DEFAULTS.regressionUpperFillOpacity,
    regressionLowerFillOpacity: drawing.regressionLowerFillOpacity ?? REGRESSION_TREND_DEFAULTS.regressionLowerFillOpacity,
  };
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getDraft: () => Record<string, unknown>,
 *   patchDrawing: (patch: Record<string, unknown>) => void,
 *   colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>,
 *   tvMenu: ReturnType<typeof import("../menu/tv.js").createTvMenu>,
 * }} ctx
 */
export function wireRegressionTrendSettings(root, ctx) {
  const { getDraft, patchDrawing, colorPicker, tvMenu } = ctx;

  root.addEventListener("click", (ev) => {
    const draft = getDraft();
    const sourceBtn = ev.target.closest("[data-reg-source-btn]");
    if (sourceBtn instanceof HTMLElement) {
      tvMenu.open(sourceBtn, REGRESSION_SOURCE_ITEMS, {
        activeId: String(draft.regressionSource ?? "close"),
        onSelect: (id) => {
          patchDrawing({ regressionSource: id });
          syncRegressionTrendDialogUi(root, draft);
        },
      });
      return;
    }

    const enableBtn = ev.target.closest("[data-reg-line-enable]");
    if (enableBtn instanceof HTMLButtonElement) {
      const key = enableBtn.dataset.regLineEnable;
      if (!key) return;
      const cap = `${key[0].toUpperCase()}${key.slice(1)}`;
      const field = `regression${cap}Enabled`;
      const next = !enableBtn.classList.contains("tv-set__check--on");
      setRegressionCheck(enableBtn, next);
      patchDrawing({ [field]: next });
      syncRegressionTrendDialogUi(root, draft);
      return;
    }

    const regCheck = ev.target.closest(
      "[data-reg-use-upper], [data-reg-use-lower], [data-reg-extend], [data-reg-pearson]",
    );
    if (regCheck instanceof HTMLButtonElement) {
      const next = !regCheck.classList.contains("tv-set__check--on");
      setRegressionCheck(regCheck, next);
      const patch = readRegressionTrendDraftFromUi(root, draft);
      Object.assign(draft, patch);
      patchDrawing(patch);
      syncRegressionTrendDialogUi(root, draft);
      return;
    }

    const lineColorBtn = ev.target.closest("[data-reg-line-color]");
    if (lineColorBtn instanceof HTMLButtonElement && !lineColorBtn.disabled) {
      const key = lineColorBtn.dataset.regLineColor;
      if (!key) return;
      const cap = key === "base" ? "Base" : key === "up" ? "Up" : "Down";
      const style = regressionLineStyle(draft, key);
      colorPicker.openSwatch(
        lineColorBtn,
        { color: style.color, opacity: style.opacity },
        {
          onChange: (value) => {
            /** @type {Record<string, unknown>} */
            const patch = {
              [`regression${cap}Color`]: value.color,
              [`regression${cap}Opacity`]: value.opacity,
            };
            if (key === "base") {
              patch.regressionDownColor = value.color;
              patch.regressionDownOpacity = value.opacity;
            }
            patchDrawing(patch);
            syncRegressionTrendDialogUi(root, draft);
          },
        },
      );
      return;
    }

    const lineStyleBtn = ev.target.closest("[data-reg-line-style]");
    if (lineStyleBtn instanceof HTMLButtonElement && !lineStyleBtn.disabled) {
      const key = lineStyleBtn.dataset.regLineStyle;
      if (!key) return;
      const cap = key === "base" ? "Base" : key === "up" ? "Up" : "Down";
      const style = regressionLineStyle(draft, key);
      colorPicker.openLine(lineStyleBtn, style, {
        showOpacity: true,
        showLineStyle: true,
        onChange: (value) => {
          /** @type {Record<string, unknown>} */
          const patch = {
            [`regression${cap}Color`]: value.color,
            [`regression${cap}Opacity`]: value.opacity,
            [`regression${cap}Width`]: value.width,
            [`regression${cap}Style`]: value.style,
          };
          if (key === "base") {
            patch.regressionDownColor = value.color;
            patch.regressionDownOpacity = value.opacity;
          }
          patchDrawing(patch);
          syncRegressionTrendDialogUi(root, draft);
        },
      });
    }
  });

  root.addEventListener("input", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.matches("[data-reg-upper-dev], [data-reg-lower-dev]")) {
      const draft = getDraft();
      Object.assign(draft, readRegressionTrendDraftFromUi(root, draft));
      patchDrawing(readRegressionTrendDraftFromUi(root, draft));
    }
  });
}
