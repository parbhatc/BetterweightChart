import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  ELLIOTT_DEGREE_OPTIONS,
  isElliottPatternTool,
  isHarmonicPatternTool,
  supportsElliottPatternStyleSettings,
  supportsHarmonicPatternStyleSettings,
  supportsPatternStyleSettings,
} from "../../tools/pattern/index.js";
import { CHECK_SVG, setTvCheck } from "../dialog/utils.js";
import { LINE_WIDTH_MENU_ITEMS } from "../menu/tv.js";

const HARMONIC_WITH_BACKGROUND = new Set([
  "xabcd-pattern",
  "cypher-pattern",
  "head-and-shoulders",
  "triangle-pattern",
]);

const PATTERN_SECTION_SELECTORS = [
  "[data-pattern-label-section]",
  "[data-pattern-border-section]",
  "[data-pattern-background-section]",
  "[data-elliott-color-section]",
  "[data-elliott-wave-section]",
  "[data-elliott-degree-section]",
];

/** @param {import("../../types.js").UserDrawing} drawing */
export function patternDraftFromDrawing(drawing) {
  const color = drawing.color ?? "#2962FF";
  return {
    showPatternWave: drawing.showPatternWave ?? true,
    showPatternBackground: drawing.showPatternBackground ?? HARMONIC_WITH_BACKGROUND.has(drawing.type),
    patternBackgroundColor: drawing.patternBackgroundColor ?? color,
    patternBackgroundOpacity: drawing.patternBackgroundOpacity ?? 15,
    showPatternRatios: drawing.showPatternRatios ?? true,
    patternLabelBold: Boolean(drawing.patternLabelBold),
    patternLabelItalic: Boolean(drawing.patternLabelItalic),
    elliottDegree: drawing.elliottDegree ?? "intermediate",
  };
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncPatternDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const harmonic = supportsHarmonicPatternStyleSettings(drawingType);
  const elliott = supportsElliottPatternStyleSettings(drawingType);
  const show = harmonic || elliott;

  for (const selector of PATTERN_SECTION_SELECTORS) {
    const section = root.querySelector(selector);
    if (section instanceof HTMLElement) section.hidden = !show;
  }

  const lineSection = root.querySelector("[data-line-section]");
  const textTab = root.querySelector('[data-tab="text"]');
  if (show) {
    if (lineSection instanceof HTMLElement) lineSection.hidden = true;
    if (textTab instanceof HTMLElement) textTab.hidden = true;
  }

  const labelSection = root.querySelector("[data-pattern-label-section]");
  const borderSection = root.querySelector("[data-pattern-border-section]");
  const bgSection = root.querySelector("[data-pattern-background-section]");
  const elliottColor = root.querySelector("[data-elliott-color-section]");
  const elliottWave = root.querySelector("[data-elliott-wave-section]");
  const elliottDegree = root.querySelector("[data-elliott-degree-section]");

  if (labelSection instanceof HTMLElement) labelSection.hidden = !harmonic;
  if (borderSection instanceof HTMLElement) borderSection.hidden = !harmonic;
  if (bgSection instanceof HTMLElement) bgSection.hidden = !harmonic || !HARMONIC_WITH_BACKGROUND.has(drawingType);
  if (elliottColor instanceof HTMLElement) elliottColor.hidden = !elliott;
  if (elliottWave instanceof HTMLElement) elliottWave.hidden = !elliott;
  if (elliottDegree instanceof HTMLElement) elliottDegree.hidden = !elliott;

  if (!show) return;

  const labelSwatch = root.querySelector("[data-pattern-label-swatch]");
  const borderSwatch = root.querySelector("[data-pattern-border-swatch]");
  const borderLine = root.querySelector("[data-pattern-border-line]");
  const bgBtn = root.querySelector("[data-pattern-background-btn]");
  const bgSwatch = root.querySelector("[data-pattern-background-swatch]");
  const waveBtn = root.querySelector("[data-pattern-wave-btn]");
  const waveWidthPreview = root.querySelector("[data-pattern-wave-width-preview]");
  const elliottSwatch = root.querySelector("[data-elliott-color-swatch]");
  const boldBtn = root.querySelector("[data-pattern-label-bold-btn]");
  const italicBtn = root.querySelector("[data-pattern-label-italic-btn]");
  const fontSizeEl = root.querySelector("[data-pattern-font-size]");
  const degreeLabel = root.querySelector("[data-elliott-degree-label]");

  const labelColor = draft.textColor ?? "#ffffff";
  const labelOpacity = draft.textColorOpacity ?? 100;
  const borderColor = draft.color ?? "#2962FF";
  const borderOpacity = draft.colorOpacity ?? 100;
  const lineWidth = draft.lineWidth ?? 2;

  if (labelSwatch instanceof HTMLElement) {
    labelSwatch.style.backgroundColor = applyColorOpacity(labelColor, labelOpacity);
  }
  if (borderSwatch instanceof HTMLElement) {
    borderSwatch.style.backgroundColor = applyColorOpacity(borderColor, borderOpacity);
  }
  if (borderLine instanceof HTMLElement) {
    borderLine.style.backgroundColor = applyColorOpacity(borderColor, borderOpacity);
    borderLine.style.height = `${lineWidth}px`;
  }
  if (bgBtn instanceof HTMLButtonElement) {
    setTvCheck(bgBtn, draft.showPatternBackground !== false);
  }
  if (bgSwatch instanceof HTMLElement) {
    bgSwatch.style.backgroundColor = applyColorOpacity(
      draft.patternBackgroundColor ?? borderColor,
      draft.patternBackgroundOpacity ?? 15,
    );
  }
  if (waveBtn instanceof HTMLButtonElement) {
    setTvCheck(waveBtn, draft.showPatternWave !== false);
  }
  if (waveWidthPreview instanceof HTMLElement) {
    waveWidthPreview.style.borderTopWidth = `${lineWidth}px`;
  }
  if (elliottSwatch instanceof HTMLElement) {
    elliottSwatch.style.backgroundColor = applyColorOpacity(borderColor, borderOpacity);
  }
  if (boldBtn instanceof HTMLButtonElement) {
    boldBtn.classList.toggle("is-active", Boolean(draft.patternLabelBold));
    boldBtn.setAttribute("aria-pressed", draft.patternLabelBold ? "true" : "false");
  }
  if (italicBtn instanceof HTMLButtonElement) {
    italicBtn.classList.toggle("is-active", Boolean(draft.patternLabelItalic));
    italicBtn.setAttribute("aria-pressed", draft.patternLabelItalic ? "true" : "false");
  }
  if (fontSizeEl instanceof HTMLSelectElement) {
    fontSizeEl.value = String(draft.fontSize ?? 12);
  }
  if (degreeLabel instanceof HTMLElement) {
    const opt =
      ELLIOTT_DEGREE_OPTIONS.find((o) => o.id === String(draft.elliottDegree ?? "intermediate")) ??
      ELLIOTT_DEGREE_OPTIONS[7];
    degreeLabel.textContent = opt.label;
  }
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function readPatternDraftFromUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  if (!supportsPatternStyleSettings(drawingType)) return {};

  const bgBtn = root.querySelector("[data-pattern-background-btn]");
  const waveBtn = root.querySelector("[data-pattern-wave-btn]");
  const fontSizeEl = root.querySelector("[data-pattern-font-size]");

  return {
    showPatternBackground: bgBtn?.classList.contains("tv-set__check--on") ?? draft.showPatternBackground,
    showPatternWave: waveBtn?.classList.contains("tv-set__check--on") ?? draft.showPatternWave,
    fontSize:
      fontSizeEl instanceof HTMLSelectElement
        ? Number(fontSizeEl.value) || 12
        : draft.fontSize,
    patternLabelBold: Boolean(draft.patternLabelBold),
    patternLabelItalic: Boolean(draft.patternLabelItalic),
    elliottDegree: draft.elliottDegree ?? "intermediate",
    patternBackgroundColor: draft.patternBackgroundColor,
    patternBackgroundOpacity: draft.patternBackgroundOpacity,
    showPatternRatios: draft.showPatternRatios,
  };
}

/**
 * @param {HTMLElement} root
 * @param {{ getDraft: () => Record<string, unknown>, patchDrawing: (p: Record<string, unknown>) => void, colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>, tvMenu: ReturnType<typeof import("../menu/tv.js").createTvMenu>, syncUi: () => void }} ctx
 */
export function wirePatternSettings(root, ctx) {
  const { getDraft, patchDrawing, colorPicker, tvMenu, syncUi } = ctx;

  root.querySelector("[data-pattern-label-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = getDraft();
    colorPicker.openSwatch(
      btn,
      {
        color: draft.textColor ?? "#ffffff",
        opacity: draft.textColorOpacity ?? 100,
      },
      {
        onChange: (value) => {
          patchDrawing({ textColor: value.color, textColorOpacity: value.opacity });
          syncUi();
        },
      },
    );
  });

  root.querySelector("[data-pattern-border-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = getDraft();
    colorPicker.openSwatch(
      btn,
      { color: draft.color ?? "#2962FF", opacity: draft.colorOpacity ?? 100 },
      {
        onChange: (value) => {
          patchDrawing({ color: value.color, colorOpacity: value.opacity });
          syncUi();
        },
      },
    );
  });

  root.querySelector("[data-pattern-background-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = getDraft();
    colorPicker.openSwatch(
      btn,
      {
        color: draft.patternBackgroundColor ?? draft.color ?? "#2962FF",
        opacity: draft.patternBackgroundOpacity ?? 15,
      },
      {
        onChange: (value) => {
          patchDrawing({
            patternBackgroundColor: value.color,
            patternBackgroundOpacity: value.opacity,
          });
          syncUi();
        },
      },
    );
  });

  root.querySelector("[data-elliott-color-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = getDraft();
    colorPicker.openSwatch(
      btn,
      { color: draft.color ?? "#3D85C6", opacity: draft.colorOpacity ?? 100 },
      {
        onChange: (value) => {
          patchDrawing({ color: value.color, colorOpacity: value.opacity });
          syncUi();
        },
      },
    );
  });

  root.querySelector("[data-pattern-background-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-pattern-background-btn]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const on = !btn.classList.contains("tv-set__check--on");
    setTvCheck(btn, on);
    patchDrawing({ showPatternBackground: on });
  });

  root.querySelector("[data-pattern-wave-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-pattern-wave-btn]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const on = !btn.classList.contains("tv-set__check--on");
    setTvCheck(btn, on);
    patchDrawing({ showPatternWave: on });
  });

  root.querySelector("[data-pattern-label-bold-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLButtonElement)) return;
    const draft = getDraft();
    const next = !draft.patternLabelBold;
    patchDrawing({ patternLabelBold: next });
    syncUi();
  });

  root.querySelector("[data-pattern-label-italic-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLButtonElement)) return;
    const draft = getDraft();
    const next = !draft.patternLabelItalic;
    patchDrawing({ patternLabelItalic: next });
    syncUi();
  });

  root.querySelector("[data-pattern-font-size]")?.addEventListener("change", (ev) => {
    const el = ev.currentTarget;
    if (!(el instanceof HTMLSelectElement)) return;
    patchDrawing({ fontSize: Number(el.value) || 12 });
  });

  root.querySelector("[data-pattern-wave-width-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = getDraft();
    tvMenu.open(btn, LINE_WIDTH_MENU_ITEMS, {
      activeId: String(draft.lineWidth ?? 2),
      onSelect: (id) => {
        patchDrawing({ lineWidth: Number(id) || 2 });
        syncUi();
      },
    });
  });

  root.querySelector("[data-elliott-degree-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = getDraft();
    tvMenu.open(
      btn,
      ELLIOTT_DEGREE_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
      {
        activeId: String(draft.elliottDegree ?? "intermediate"),
        onSelect: (id) => {
          patchDrawing({ elliottDegree: id });
          syncUi();
        },
      },
    );
  });
}

export {
  isHarmonicPatternTool,
  isElliottPatternTool,
  supportsHarmonicPatternStyleSettings,
  supportsElliottPatternStyleSettings,
  supportsPatternStyleSettings,
};
