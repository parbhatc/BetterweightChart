import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  formatFibLevelOffset,
  isFibRetracementTool,
  normalizeFibLevels,
  parseFibLevelOffsetInput,
  supportsFibStyleSettings,
} from "../../tools/fib/retracement.js";
import { CHECK_SVG, setTvCheck } from "../dialog/utils.js";
import {
  FIB_LEVELS_DISPLAY_ITEMS,
  LINE_STYLE_MENU_ITEMS,
  LINE_WIDTH_MENU_ITEMS,
  TEXT_ALIGN_H_ITEMS,
  TEXT_ALIGN_V_ITEMS,
} from "../menu/tv.js";

/** @param {number} offset @param {"values" | "percents"} mode */
function levelInputValue(offset, mode) {
  if (mode === "percents") {
    const pct = offset * 100;
    return pct.toFixed(4).replace(/\.?0+$/, "");
  }
  return String(offset);
}

/** @param {number} style */
function lineStylePreviewHtml(style) {
  const item = LINE_STYLE_MENU_ITEMS.find((i) => i.id === String(style)) ?? LINE_STYLE_MENU_ITEMS[0];
  return item.icon ?? "";
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function fibRetracementDraftFromDrawing(drawing) {
  return {
    showFibTrendLine: drawing.showFibTrendLine ?? true,
    fibTrendLineColor: drawing.fibTrendLineColor ?? "#808080",
    fibTrendLineWidth: drawing.fibTrendLineWidth ?? 2,
    fibTrendLineStyle: drawing.fibTrendLineStyle ?? 1,
    fibTrendLineOpacity: drawing.fibTrendLineOpacity ?? 100,
    fibLevels: normalizeFibLevels(drawing.fibLevels, drawing.type),
    fibLevelsLineWidth: drawing.fibLevelsLineWidth ?? 2,
    fibLevelsLineStyle: drawing.fibLevelsLineStyle ?? 0,
    fibLevelsDisplayMode: drawing.fibLevelsDisplayMode === "percents" ? "percents" : "values",
    fibUseOneColor: Boolean(drawing.fibUseOneColor),
    showFibBackground: drawing.showFibBackground ?? true,
    fibBackgroundColor: drawing.fibBackgroundColor ?? drawing.color ?? "#2962FF",
    fibBackgroundOpacity: drawing.fibBackgroundOpacity ?? 20,
    fibReverse: Boolean(drawing.fibReverse),
    showFibPrices: drawing.showFibPrices ?? true,
    showFibLevelLabels: drawing.showFibLevelLabels ?? true,
    fibLabelAlignH: drawing.fibLabelAlignH ?? "left",
    fibLabelAlignV: drawing.fibLabelAlignV ?? "middle",
  };
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function buildFibRetracementLevelsList(root, draft) {
  const list = root.querySelector("[data-fib-levels-list]");
  if (!(list instanceof HTMLElement)) return;
  const levels = normalizeFibLevels(draft.fibLevels, String(draft.drawingType ?? "fib-retracement"));
  const baseColor = draft.color ?? "#2962FF";
  const baseOpacity = draft.colorOpacity ?? 100;
  const useOne = Boolean(draft.fibUseOneColor);
  const displayMode = draft.fibLevelsDisplayMode === "percents" ? "percents" : "values";

  list.innerHTML = levels
    .map((level, i) => {
      const previewColor = applyColorOpacity(
        useOne ? baseColor : level.color ?? baseColor,
        useOne ? baseOpacity : level.colorOpacity ?? baseOpacity,
      );
      const disabled = !level.enabled || useOne;
      const value = levelInputValue(level.offset, displayMode);
      return `<div class="tv-fib-level-row" data-fib-level-row="${i}">
        <button type="button" class="tv-set__check${level.enabled ? " tv-set__check--on" : ""}" data-fib-level-enable="${i}" role="checkbox" aria-checked="${level.enabled ? "true" : "false"}" aria-label="Level ${formatFibLevelOffset(level.offset, displayMode)}">
          <span class="tv-set__check-box">${level.enabled ? CHECK_SVG : ""}</span>
        </button>
        <input type="text" class="tv-drawing-settings__input tv-fib-level-offset" data-fib-level-offset="${i}" inputmode="decimal" value="${value}" ${disabled ? "disabled" : ""} />
        <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-fib-level-color="${i}" aria-label="Level color" ${disabled ? "disabled" : ""}>
          <span class="tv-drawing-settings__color-swatch" style="background-color:${previewColor}"></span>
        </button>
      </div>`;
    })
    .join("");
}

const FIB_SECTION_SELECTORS = [
  "[data-fib-trend-section]",
  "[data-fib-levels-section]",
  "[data-fib-levels-line-section]",
  "[data-fib-labels-section]",
  "[data-fib-options-section]",
  "[data-fib-background-section]",
];

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncFibRetracementDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const show = supportsFibStyleSettings(drawingType);
  const isTimeZoneOnly = drawingType === "fib-time-zone";
  const isTrendBasedFibTime = drawingType === "trend-based-fib-time";
  const isRadial = drawingType === "fib-circles" || drawingType === "fib-spiral" || drawingType === "fib-wedge";
  for (const selector of FIB_SECTION_SELECTORS) {
    const section = root.querySelector(selector);
    if (section instanceof HTMLElement) section.hidden = !show;
  }

  const lineSection = root.querySelector("[data-line-section]");
  const extendSection = root.querySelector("[data-extend-section]");
  const trendSection = root.querySelector("[data-fib-trend-section]");
  const optionsSection = root.querySelector("[data-fib-options-section]");
  const displayRow = root.querySelector("[data-fib-levels-display-btn]")?.closest(".tv-set__field-row");
  if (show) {
    if (lineSection instanceof HTMLElement) lineSection.hidden = true;
    if (extendSection instanceof HTMLElement) extendSection.hidden = isTimeZoneOnly || isTrendBasedFibTime || isRadial;
    if (trendSection instanceof HTMLElement) trendSection.hidden = isTimeZoneOnly;
    if (optionsSection instanceof HTMLElement) optionsSection.hidden = isTimeZoneOnly || isRadial;
    if (displayRow instanceof HTMLElement) displayRow.hidden = isTimeZoneOnly;
  }

  if (!show) return;

  const trendBtn = root.querySelector("[data-fib-trend-btn]");
  const trendSwatch = root.querySelector("[data-fib-trend-swatch]");
  const useOneBtn = root.querySelector("[data-fib-use-one-color-btn]");
  const useOneSwatch = root.querySelector("[data-fib-use-one-swatch]");
  const useOneSwatchWrap = root.querySelector("[data-fib-use-one-swatch-wrap]");
  const bgBtn = root.querySelector("[data-fib-background-btn]");
  const bgSwatch = root.querySelector("[data-fib-background-swatch]");
  const reverseBtn = root.querySelector("[data-fib-reverse-btn]");
  const pricesBtn = root.querySelector("[data-fib-prices-btn]");
  const levelsBtn = root.querySelector("[data-fib-level-labels-btn]");
  const displayLabel = root.querySelector("[data-fib-levels-display-label]");
  const widthPreview = root.querySelector("[data-fib-levels-line-width-preview]");
  const stylePreview = root.querySelector("[data-fib-levels-line-style-preview]");
  const alignHLabel = root.querySelector("[data-fib-label-align-h-label]");
  const alignVLabel = root.querySelector("[data-fib-label-align-v-label]");

  setTvCheck(trendBtn, draft.showFibTrendLine !== false);
  if (trendSwatch instanceof HTMLElement) {
    trendSwatch.style.backgroundColor = applyColorOpacity(
      draft.fibTrendLineColor ?? "#808080",
      draft.fibTrendLineOpacity ?? 100,
    );
  }
  setTvCheck(useOneBtn, Boolean(draft.fibUseOneColor));
  if (useOneSwatchWrap instanceof HTMLElement) {
    useOneSwatchWrap.hidden = !draft.fibUseOneColor;
  }
  if (useOneSwatch instanceof HTMLElement) {
    useOneSwatch.style.backgroundColor = applyColorOpacity(
      draft.color ?? "#2962FF",
      draft.colorOpacity ?? 100,
    );
  }
  setTvCheck(bgBtn, draft.showFibBackground !== false);
  if (bgSwatch instanceof HTMLElement) {
    bgSwatch.style.backgroundColor = applyColorOpacity(
      draft.fibBackgroundColor ?? draft.color ?? "#2962FF",
      draft.fibBackgroundOpacity ?? 20,
    );
  }
  setTvCheck(reverseBtn, Boolean(draft.fibReverse));
  setTvCheck(pricesBtn, draft.showFibPrices !== false);
  setTvCheck(levelsBtn, draft.showFibLevelLabels !== false);

  const displayMode = draft.fibLevelsDisplayMode === "percents" ? "percents" : "values";
  const displayItem =
    FIB_LEVELS_DISPLAY_ITEMS.find((i) => i.id === displayMode) ?? FIB_LEVELS_DISPLAY_ITEMS[0];
  if (displayLabel) displayLabel.textContent = displayItem.label;

  const lineWidth = Number(draft.fibLevelsLineWidth ?? 2);
  const lineStyle = Number(draft.fibLevelsLineStyle ?? 0);
  if (widthPreview instanceof HTMLElement) {
    widthPreview.style.borderTopWidth = `${lineWidth}px`;
  }
  if (stylePreview instanceof HTMLElement) {
    stylePreview.innerHTML = lineStylePreviewHtml(lineStyle);
  }

  const alignH = TEXT_ALIGN_H_ITEMS.find((i) => i.id === draft.fibLabelAlignH) ?? TEXT_ALIGN_H_ITEMS[0];
  const alignV = TEXT_ALIGN_V_ITEMS.find((i) => i.id === draft.fibLabelAlignV) ?? TEXT_ALIGN_V_ITEMS[1];
  if (alignHLabel) alignHLabel.textContent = alignH.label;
  if (alignVLabel) alignVLabel.textContent = alignV.label;

  buildFibRetracementLevelsList(root, draft);
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncFibTextTabUi(root, draft) {
  const show = isFibRetracementTool(String(draft.drawingType ?? ""));
  const textColorBtn = root.querySelector("[data-text-color]");
  const textInput = root.querySelector("[data-text-input]");
  const textSectionTitle = root.querySelector("[data-text-section-title]");
  const alignSection = root.querySelector("[data-text-align-section]");

  if (textColorBtn instanceof HTMLElement) textColorBtn.hidden = show;
  if (textInput instanceof HTMLTextAreaElement) textInput.hidden = show;
  if (textSectionTitle instanceof HTMLElement) {
    textSectionTitle.textContent = show ? "Labels" : "Text";
  }
  if (alignSection instanceof HTMLElement) alignSection.hidden = show;
}

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function readFibRetracementDraftFromUi(root, draft) {
  const trendBtn = root.querySelector("[data-fib-trend-btn]");
  const useOneBtn = root.querySelector("[data-fib-use-one-color-btn]");
  const bgBtn = root.querySelector("[data-fib-background-btn]");
  const reverseBtn = root.querySelector("[data-fib-reverse-btn]");
  const pricesBtn = root.querySelector("[data-fib-prices-btn]");
  const levelsBtn = root.querySelector("[data-fib-level-labels-btn]");
  return {
    showFibTrendLine: trendBtn?.classList.contains("tv-set__check--on") ?? draft.showFibTrendLine,
    fibUseOneColor: useOneBtn?.classList.contains("tv-set__check--on") ?? draft.fibUseOneColor,
    showFibBackground: bgBtn?.classList.contains("tv-set__check--on") ?? draft.showFibBackground,
    fibReverse: reverseBtn?.classList.contains("tv-set__check--on") ?? draft.fibReverse,
    showFibPrices: pricesBtn?.classList.contains("tv-set__check--on") ?? draft.showFibPrices,
    showFibLevelLabels: levelsBtn?.classList.contains("tv-set__check--on") ?? draft.showFibLevelLabels,
    fibTrendLineColor: draft.fibTrendLineColor,
    fibTrendLineWidth: draft.fibTrendLineWidth,
    fibTrendLineStyle: draft.fibTrendLineStyle,
    fibTrendLineOpacity: draft.fibTrendLineOpacity,
    fibLevels: normalizeFibLevels(draft.fibLevels, String(draft.drawingType ?? "fib-retracement")),
    fibLevelsLineWidth: draft.fibLevelsLineWidth,
    fibLevelsLineStyle: draft.fibLevelsLineStyle,
    fibLevelsDisplayMode: draft.fibLevelsDisplayMode,
    fibBackgroundColor: draft.fibBackgroundColor,
    fibBackgroundOpacity: draft.fibBackgroundOpacity,
    fibLabelAlignH: draft.fibLabelAlignH,
    fibLabelAlignV: draft.fibLabelAlignV,
  };
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getDraft: () => Record<string, unknown>,
 *   patchDrawing: (patch: Record<string, unknown>) => void,
 *   colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>,
 *   tvMenu: ReturnType<typeof import("../menu/tv.js").createTvMenu>,
 *   syncColorUi: () => void,
 * }} ctx
 */
export function wireFibRetracementSettings(root, ctx) {
  const { getDraft, patchDrawing, colorPicker, tvMenu, syncColorUi } = ctx;
  const levelsList = root.querySelector("[data-fib-levels-list]");
  const trendBtn = root.querySelector("[data-fib-trend-btn]");
  const trendColorBtn = root.querySelector("[data-fib-trend-color]");
  const useOneBtn = root.querySelector("[data-fib-use-one-color-btn]");
  const useOneSwatchWrap = root.querySelector("[data-fib-use-one-swatch-wrap]");
  const bgBtn = root.querySelector("[data-fib-background-btn]");
  const bgColorBtn = root.querySelector("[data-fib-background-color]");
  const reverseBtn = root.querySelector("[data-fib-reverse-btn]");
  const pricesBtn = root.querySelector("[data-fib-prices-btn]");
  const levelsBtn = root.querySelector("[data-fib-level-labels-btn]");
  const displayBtn = root.querySelector("[data-fib-levels-display-btn]");
  const lineWidthBtn = root.querySelector("[data-fib-levels-line-width-btn]");
  const lineStyleBtn = root.querySelector("[data-fib-levels-line-style-btn]");
  const alignHBtn = root.querySelector("[data-fib-label-align-h-btn]");
  const alignVBtn = root.querySelector("[data-fib-label-align-v-btn]");

  trendBtn?.addEventListener("click", () => {
    if (!(trendBtn instanceof HTMLButtonElement)) return;
    const next = !trendBtn.classList.contains("tv-set__check--on");
    setTvCheck(trendBtn, next);
    patchDrawing({ showFibTrendLine: next });
  });

  trendColorBtn?.addEventListener("click", (ev) => {
    const draft = getDraft();
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openLine(
      btn,
      {
        color: draft.fibTrendLineColor ?? "#808080",
        width: draft.fibTrendLineWidth ?? 2,
        opacity: draft.fibTrendLineOpacity ?? 100,
        style: draft.fibTrendLineStyle ?? 1,
      },
      {
        showOpacity: true,
        showLineStyle: true,
        onChange: (value) => {
          patchDrawing({
            fibTrendLineColor: value.color,
            fibTrendLineOpacity: value.opacity,
            fibTrendLineWidth: value.width,
            fibTrendLineStyle: value.style,
          });
          draft.fibTrendLineColor = value.color;
          draft.fibTrendLineOpacity = value.opacity;
          draft.fibTrendLineWidth = value.width;
          draft.fibTrendLineStyle = value.style;
          syncFibRetracementDialogUi(root, draft);
        },
      },
    );
  });

  displayBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(displayBtn instanceof HTMLElement)) return;
    const mode = draft.fibLevelsDisplayMode === "percents" ? "percents" : "values";
    tvMenu.open(displayBtn, FIB_LEVELS_DISPLAY_ITEMS, {
      activeId: mode,
      onSelect: (id) => {
        draft.fibLevelsDisplayMode = id;
        patchDrawing({ fibLevelsDisplayMode: id });
        syncFibRetracementDialogUi(root, draft);
      },
    });
  });

  lineWidthBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(lineWidthBtn instanceof HTMLElement)) return;
    tvMenu.open(lineWidthBtn, LINE_WIDTH_MENU_ITEMS, {
      activeId: String(draft.fibLevelsLineWidth ?? 2),
      onSelect: (id) => {
        const width = Number(id) || 2;
        draft.fibLevelsLineWidth = width;
        patchDrawing({ fibLevelsLineWidth: width });
        syncFibRetracementDialogUi(root, draft);
      },
    });
  });

  lineStyleBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(lineStyleBtn instanceof HTMLElement)) return;
    tvMenu.open(lineStyleBtn, LINE_STYLE_MENU_ITEMS, {
      activeId: String(draft.fibLevelsLineStyle ?? 0),
      onSelect: (id) => {
        const style = Number(id) || 0;
        draft.fibLevelsLineStyle = style;
        patchDrawing({ fibLevelsLineStyle: style });
        syncFibRetracementDialogUi(root, draft);
      },
    });
  });

  alignHBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(alignHBtn instanceof HTMLElement)) return;
    tvMenu.open(alignHBtn, TEXT_ALIGN_H_ITEMS, {
      activeId: String(draft.fibLabelAlignH ?? "left"),
      onSelect: (id) => {
        draft.fibLabelAlignH = id;
        patchDrawing({ fibLabelAlignH: id });
        syncFibRetracementDialogUi(root, draft);
      },
    });
  });

  alignVBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(alignVBtn instanceof HTMLElement)) return;
    tvMenu.open(alignVBtn, TEXT_ALIGN_V_ITEMS, {
      activeId: String(draft.fibLabelAlignV ?? "middle"),
      onSelect: (id) => {
        draft.fibLabelAlignV = id;
        patchDrawing({ fibLabelAlignV: id });
        syncFibRetracementDialogUi(root, draft);
      },
    });
  });

  useOneBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(useOneBtn instanceof HTMLButtonElement)) return;
    const next = !useOneBtn.classList.contains("tv-set__check--on");
    setTvCheck(useOneBtn, next);
    draft.fibUseOneColor = next;
    patchDrawing({ fibUseOneColor: next });
    syncFibRetracementDialogUi(root, draft);
  });

  useOneSwatchWrap?.addEventListener("click", (ev) => {
    const draft = getDraft();
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openLine(
      btn,
      {
        color: draft.color ?? "#2962FF",
        width: draft.lineWidth ?? 2,
        opacity: draft.colorOpacity ?? 100,
        style: draft.lineStyle ?? 0,
      },
      {
        showOpacity: true,
        showLineStyle: true,
        onChange: (value) => {
          patchDrawing({
            color: value.color,
            colorOpacity: value.opacity,
            lineWidth: value.width,
            lineStyle: value.style,
          });
          draft.color = value.color;
          draft.colorOpacity = value.opacity;
          draft.lineWidth = value.width;
          draft.lineStyle = value.style;
          syncFibRetracementDialogUi(root, draft);
          syncColorUi();
        },
      },
    );
  });

  bgBtn?.addEventListener("click", () => {
    if (!(bgBtn instanceof HTMLButtonElement)) return;
    const next = !bgBtn.classList.contains("tv-set__check--on");
    setTvCheck(bgBtn, next);
    patchDrawing({ showFibBackground: next });
  });

  bgColorBtn?.addEventListener("click", (ev) => {
    const draft = getDraft();
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openSwatch(
      btn,
      {
        color: draft.fibBackgroundColor ?? draft.color ?? "#2962FF",
        opacity: draft.fibBackgroundOpacity ?? 20,
      },
      {
        onChange: (value) => {
          patchDrawing({
            fibBackgroundColor: value.color,
            fibBackgroundOpacity: value.opacity,
          });
          draft.fibBackgroundColor = value.color;
          draft.fibBackgroundOpacity = value.opacity;
          syncFibRetracementDialogUi(root, draft);
        },
      },
    );
  });

  reverseBtn?.addEventListener("click", () => {
    if (!(reverseBtn instanceof HTMLButtonElement)) return;
    const next = !reverseBtn.classList.contains("tv-set__check--on");
    setTvCheck(reverseBtn, next);
    patchDrawing({ fibReverse: next });
  });

  pricesBtn?.addEventListener("click", () => {
    if (!(pricesBtn instanceof HTMLButtonElement)) return;
    const next = !pricesBtn.classList.contains("tv-set__check--on");
    setTvCheck(pricesBtn, next);
    patchDrawing({ showFibPrices: next });
  });

  levelsBtn?.addEventListener("click", () => {
    if (!(levelsBtn instanceof HTMLButtonElement)) return;
    const next = !levelsBtn.classList.contains("tv-set__check--on");
    setTvCheck(levelsBtn, next);
    patchDrawing({ showFibLevelLabels: next });
  });

  levelsList?.addEventListener("click", (ev) => {
    const draft = getDraft();
    const enableBtn = ev.target.closest("[data-fib-level-enable]");
    if (enableBtn instanceof HTMLButtonElement) {
      const i = Number(enableBtn.dataset.fibLevelEnable);
      const levels = normalizeFibLevels(draft.fibLevels, String(draft.drawingType ?? "fib-retracement"));
      if (!Number.isFinite(i) || !levels[i]) return;
      levels[i] = { ...levels[i], enabled: !levels[i].enabled };
      draft.fibLevels = levels;
      patchDrawing({ fibLevels: levels });
      syncFibRetracementDialogUi(root, draft);
      return;
    }
    const colorBtn = ev.target.closest("[data-fib-level-color]");
    if (colorBtn instanceof HTMLButtonElement) {
      const i = Number(colorBtn.dataset.fibLevelColor);
      const levels = normalizeFibLevels(draft.fibLevels, String(draft.drawingType ?? "fib-retracement"));
      if (!Number.isFinite(i) || !levels[i]) return;
      colorPicker.openSwatch(
        colorBtn,
        {
          color: levels[i].color ?? "#808080",
          opacity: levels[i].colorOpacity ?? 100,
        },
        {
          onChange: (value) => {
            levels[i] = { ...levels[i], color: value.color, colorOpacity: value.opacity };
            draft.fibLevels = levels;
            patchDrawing({ fibLevels: levels });
            syncFibRetracementDialogUi(root, draft);
          },
        },
      );
    }
  });

  levelsList?.addEventListener("change", (ev) => {
    const draft = getDraft();
    const input = ev.target.closest("[data-fib-level-offset]");
    if (!(input instanceof HTMLInputElement)) return;
    const i = Number(input.dataset.fibLevelOffset);
    const levels = normalizeFibLevels(draft.fibLevels, String(draft.drawingType ?? "fib-retracement"));
    if (!Number.isFinite(i) || !levels[i]) return;
    const displayMode = draft.fibLevelsDisplayMode === "percents" ? "percents" : "values";
    const offset = parseFibLevelOffsetInput(input.value, displayMode);
    if (offset == null) return;
    levels[i] = { ...levels[i], offset };
    draft.fibLevels = levels;
    patchDrawing({ fibLevels: levels });
    syncFibRetracementDialogUi(root, draft);
  });
}
