import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  MEASURE_STATS_FIELD_ITEMS,
  MEASURE_STYLE_DEFAULTS,
  isMeasureTool,
  measureDraftFromDrawing,
  measureStatsSummaryLabel,
  resolveMeasureStatsFields,
  supportsMeasureStyleSettings,
} from "../../tools/measure/index.js";
import { setTvCheck, syncLineStylePreview } from "../dialog/utils.js";
import { createTvMenu } from "../menu/tv.js";

export { measureDraftFromDrawing };

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function syncMeasureDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const show = supportsMeasureStyleSettings(drawingType);

  root.querySelectorAll("[data-measure-section]").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !show;
  });

  const textTab = root.querySelector('[data-tab="text"]');
  const borderSection = root.querySelector("[data-measure-border-section]");
  if (textTab instanceof HTMLElement && show) textTab.hidden = true;
  if (borderSection instanceof HTMLElement) {
    borderSection.hidden = !show || drawingType !== "date-price-range";
  }

  if (!show) return;

  const styleSwatch = root.querySelector("[data-style-swatch]");
  const styleLine = root.querySelector("[data-style-line]");
  const color = draft.color ?? MEASURE_STYLE_DEFAULTS.color;
  const opacity = draft.colorOpacity ?? 100;
  const lineWidth = draft.lineWidth ?? 2;

  if (styleSwatch instanceof HTMLElement) {
    styleSwatch.style.backgroundColor = applyColorOpacity(color, opacity);
  }
  syncLineStylePreview(styleLine, {
    color,
    opacity,
    width: lineWidth,
    style: Number(draft.lineStyle ?? 0),
  });

  const bgBtn = root.querySelector("[data-measure-background-btn]");
  const bgSwatch = root.querySelector("[data-measure-background-swatch]");
  const borderBtn = root.querySelector("[data-measure-border-btn]");
  const labelBgBtn = root.querySelector("[data-measure-label-bg-btn]");
  const labelBgSwatch = root.querySelector("[data-measure-label-bg-swatch]");
  const labelSwatch = root.querySelector("[data-measure-label-color-swatch]");
  const fontSizeEl = root.querySelector("[data-measure-font-size]");
  const statsLabel = root.querySelector("[data-measure-stats-label]");

  if (bgBtn instanceof HTMLButtonElement) {
    setTvCheck(bgBtn, draft.showMeasureBackground !== false);
  }
  if (bgSwatch instanceof HTMLElement) {
    bgSwatch.style.backgroundColor = applyColorOpacity(
      String(draft.measureBackgroundColor ?? color),
      draft.measureBackgroundOpacity ?? 15,
    );
  }
  if (borderBtn instanceof HTMLButtonElement) {
    setTvCheck(borderBtn, Boolean(draft.showMeasureBorder));
  }
  if (labelBgBtn instanceof HTMLButtonElement) {
    setTvCheck(labelBgBtn, draft.showMeasureLabelBackground !== false);
  }
  if (labelBgSwatch instanceof HTMLElement) {
    labelBgSwatch.style.backgroundColor = String(
      draft.measureLabelBgColor ?? MEASURE_STYLE_DEFAULTS.measureLabelBgColor,
    );
  }
  if (labelSwatch instanceof HTMLElement) {
    labelSwatch.style.backgroundColor = String(draft.textColor ?? MEASURE_STYLE_DEFAULTS.textColor);
  }
  if (fontSizeEl instanceof HTMLSelectElement) {
    fontSizeEl.value = String(draft.fontSize ?? 12);
  }

  const fields = resolveMeasureStatsFields(
    /** @type {import("../../types.js").UserDrawing} */ ({ ...draft, type: drawingType }),
  );
  if (statsLabel instanceof HTMLElement) {
    statsLabel.textContent = measureStatsSummaryLabel(fields, drawingType);
  }
}

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function readMeasureDraftFromUi(root, draft) {
  if (!isMeasureTool(String(draft.drawingType ?? ""))) return {};
  return measureDraftFromDrawing(
    /** @type {import("../../types.js").UserDrawing} */ ({ ...draft, type: draft.drawingType }),
  );
}

/**
 * @param {HTMLElement} root
 * @param {{ getDraft: () => Record<string, unknown>, patchDrawing: (patch: Record<string, unknown>) => void, colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker> }} ctx
 */
export function wireMeasureSettings(root, ctx) {
  const tvMenu = createTvMenu();

  root.querySelector("[data-measure-background-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLButtonElement)) return;
    if (!isMeasureTool(String(ctx.getDraft().drawingType ?? ""))) return;
    setTvCheck(btn, !btn.classList.contains("tv-set__check--on"));
    ctx.patchDrawing({ showMeasureBackground: btn.classList.contains("tv-set__check--on") });
  });

  root.querySelector("[data-measure-border-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLButtonElement)) return;
    if (ctx.getDraft().drawingType !== "date-price-range") return;
    setTvCheck(btn, !btn.classList.contains("tv-set__check--on"));
    ctx.patchDrawing({ showMeasureBorder: btn.classList.contains("tv-set__check--on") });
  });

  root.querySelector("[data-measure-label-bg-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLButtonElement)) return;
    if (!isMeasureTool(String(ctx.getDraft().drawingType ?? ""))) return;
    setTvCheck(btn, !btn.classList.contains("tv-set__check--on"));
    ctx.patchDrawing({ showMeasureLabelBackground: btn.classList.contains("tv-set__check--on") });
  });

  root.querySelector("[data-measure-background-color]")?.addEventListener("click", (ev) => {
    const draft = ctx.getDraft();
    if (!isMeasureTool(String(draft.drawingType ?? ""))) return;
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    ctx.colorPicker.openSwatch(
      btn,
      {
        color: String(draft.measureBackgroundColor ?? draft.color ?? MEASURE_STYLE_DEFAULTS.color),
        opacity: Number(draft.measureBackgroundOpacity ?? 15),
      },
      {
        onChange: (value) => {
          ctx.patchDrawing({
            measureBackgroundColor: value.color,
            measureBackgroundOpacity: value.opacity,
          });
          syncMeasureDialogUi(root, ctx.getDraft());
        },
      },
    );
  });

  root.querySelector("[data-measure-label-bg-color]")?.addEventListener("click", (ev) => {
    const draft = ctx.getDraft();
    if (!isMeasureTool(String(draft.drawingType ?? ""))) return;
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    ctx.colorPicker.openSwatch(
      btn,
      { color: String(draft.measureLabelBgColor ?? MEASURE_STYLE_DEFAULTS.measureLabelBgColor), opacity: 100 },
      {
        onChange: (value) => {
          ctx.patchDrawing({ measureLabelBgColor: value.color });
          syncMeasureDialogUi(root, ctx.getDraft());
        },
      },
    );
  });

  root.querySelector("[data-measure-label-color]")?.addEventListener("click", (ev) => {
    const draft = ctx.getDraft();
    if (!isMeasureTool(String(draft.drawingType ?? ""))) return;
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    ctx.colorPicker.openSwatch(
      btn,
      { color: String(draft.textColor ?? MEASURE_STYLE_DEFAULTS.textColor), opacity: 100 },
      {
        onChange: (value) => {
          ctx.patchDrawing({ textColor: value.color });
          syncMeasureDialogUi(root, ctx.getDraft());
        },
      },
    );
  });

  root.querySelector("[data-measure-font-size]")?.addEventListener("change", (ev) => {
    const el = ev.currentTarget;
    if (!(el instanceof HTMLSelectElement)) return;
    if (!isMeasureTool(String(ctx.getDraft().drawingType ?? ""))) return;
    ctx.patchDrawing({ fontSize: Number(el.value) || 12 });
  });

  root.querySelector("[data-measure-stats-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = ctx.getDraft();
    const drawingType = String(draft.drawingType ?? "");
    if (!isMeasureTool(drawingType)) return;
    const items = MEASURE_STATS_FIELD_ITEMS[drawingType] ?? [];
    const fields = resolveMeasureStatsFields(
      /** @type {import("../../types.js").UserDrawing} */ ({ ...draft, type: drawingType }),
    );
    tvMenu.openCheckboxMenu(
      btn,
      items.map((item) => ({ id: item.id, label: item.label })),
      {
        checked: fields,
        onChange: (id, checked) => {
          const next = {
            ...resolveMeasureStatsFields(
              /** @type {import("../../types.js").UserDrawing} */ ({ ...ctx.getDraft(), type: drawingType }),
            ),
          };
          next[id] = checked;
          ctx.patchDrawing({ measureStatsFields: next });
          syncMeasureDialogUi(root, ctx.getDraft());
        },
      },
    );
  });
}
