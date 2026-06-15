import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  annotationDefaultsForType,
  annotationDraftFromDrawing,
  BRUSH_DEFAULTS,
  HIGHLIGHTER_DEFAULTS,
  HIGHLIGHTER_WIDTH_ITEMS,
  isBrushTool,
  isDirectionArrowMarkTool,
  isHighlighterTool,
  supportsAnnotationStyleSettings,
} from "../../tools/annotation/style.js";
import { setTvCheck } from "../dialog/utils.js";

export { annotationDraftFromDrawing };

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function syncAnnotationDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const show = supportsAnnotationStyleSettings(drawingType);
  const isBrush = isBrushTool(drawingType);
  const isHighlighter = isHighlighterTool(drawingType);
  const isColorOnly = isDirectionArrowMarkTool(drawingType) || drawingType === "arrow-marker";

  root.querySelectorAll("[data-annotation-brush-section]").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !show || !isBrush;
  });
  root.querySelectorAll("[data-annotation-highlighter-section]").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !show || !isHighlighter;
  });

  const textTab = root.querySelector('[data-tab="text"]');
  const coordsTab = root.querySelector('[data-tab="coordinates"]');
  if (show) {
    if (textTab instanceof HTMLElement) textTab.hidden = true;
    if (coordsTab instanceof HTMLElement) coordsTab.hidden = true;
  }

  if (!show) return;

  const lineSection = root.querySelector("[data-line-section]");
  if (lineSection instanceof HTMLElement) lineSection.hidden = false;

  const styleSwatch = root.querySelector("[data-style-swatch]");
  const styleLine = root.querySelector("[data-style-line]");
  const defaults = annotationDefaultsForType(drawingType);
  const color = draft.color ?? defaults.color;
  const opacity = draft.colorOpacity ?? defaults.colorOpacity ?? 100;
  const lineWidth = draft.lineWidth ?? defaults.lineWidth ?? 2;

  if (styleSwatch instanceof HTMLElement) {
    styleSwatch.style.backgroundColor = applyColorOpacity(color, opacity);
  }
  if (styleLine instanceof HTMLElement) {
    styleLine.style.backgroundColor = applyColorOpacity(color, opacity);
    styleLine.style.height = `${isHighlighter ? lineWidth : lineWidth}px`;
    styleLine.style.width = isHighlighter ? "30px" : "";
  }

  if (isBrush) {
    const bgBtn = root.querySelector("[data-brush-background-btn]");
    const bgColorBtn = root.querySelector("[data-brush-background-color]");
    const bgSwatch = root.querySelector("[data-brush-background-swatch]");
    const showBg = Boolean(draft.showBrushBackground);
    setTvCheck(bgBtn, showBg);
    if (bgColorBtn instanceof HTMLButtonElement) bgColorBtn.disabled = !showBg;
    if (bgSwatch instanceof HTMLElement) {
      bgSwatch.style.backgroundColor = applyColorOpacity(
        draft.brushBackgroundColor ?? draft.color ?? BRUSH_DEFAULTS.brushBackgroundColor,
        draft.brushBackgroundOpacity ?? BRUSH_DEFAULTS.brushBackgroundOpacity,
      );
    }
  }

  if (isHighlighter) {
    const label = root.querySelector("[data-highlighter-thickness-label]");
    const item =
      HIGHLIGHTER_WIDTH_ITEMS.find((i) => Number(i.id) === lineWidth) ??
      HIGHLIGHTER_WIDTH_ITEMS.find((i) => i.id === "20");
    if (label) label.textContent = item?.label ?? `${lineWidth}px`;
  }

  if (isColorOnly) {
    const leftEndBtn = root.querySelector("[data-left-end-btn]");
    const rightEndBtn = root.querySelector("[data-right-end-btn]");
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = true;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = true;
  }
}

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function readAnnotationDraftFromUi(root, draft) {
  if (!supportsAnnotationStyleSettings(String(draft.drawingType ?? ""))) return {};
  const patch = annotationDraftFromDrawing(
    /** @type {import("../../types.js").UserDrawing} */ ({ ...draft, type: draft.drawingType }),
  );
  if (isBrushTool(String(draft.drawingType ?? ""))) {
    const bgBtn = root.querySelector("[data-brush-background-btn]");
    patch.showBrushBackground = bgBtn?.classList.contains("tv-set__check--on") ?? false;
  }
  return patch;
}

/**
 * @param {HTMLElement} root
 * @param {{ getDraft: () => Record<string, unknown>, patchDrawing: (patch: Record<string, unknown>) => void, colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>, tvMenu: ReturnType<typeof import("../menu/tv.js").createTvMenu>, syncColorUi: () => void }} ctx
 */
export function wireAnnotationSettings(root, ctx) {
  root.querySelector("[data-brush-background-btn]")?.addEventListener("click", () => {
    const draft = ctx.getDraft();
    if (!isBrushTool(String(draft.drawingType ?? ""))) return;
    const btn = root.querySelector("[data-brush-background-btn]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const next = !btn.classList.contains("tv-set__check--on");
    setTvCheck(btn, next);
    ctx.patchDrawing({ showBrushBackground: next });
    syncAnnotationDialogUi(root, ctx.getDraft());
  });

  root.querySelector("[data-brush-background-color]")?.addEventListener("click", (ev) => {
    const draft = ctx.getDraft();
    if (!isBrushTool(String(draft.drawingType ?? "")) || !draft.showBrushBackground) return;
    const target = ev.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    ctx.colorPicker.openSwatch(
      target,
      {
        color: String(draft.brushBackgroundColor ?? draft.color ?? BRUSH_DEFAULTS.brushBackgroundColor),
        opacity: Number(draft.brushBackgroundOpacity ?? BRUSH_DEFAULTS.brushBackgroundOpacity),
      },
      {
        onChange: (value) => {
          ctx.patchDrawing({
            brushBackgroundColor: value.color,
            brushBackgroundOpacity: value.opacity,
          });
          syncAnnotationDialogUi(root, ctx.getDraft());
        },
      },
    );
  });

  root.querySelector("[data-highlighter-thickness-btn]")?.addEventListener("click", () => {
    const draft = ctx.getDraft();
    if (!isHighlighterTool(String(draft.drawingType ?? ""))) return;
    const btn = root.querySelector("[data-highlighter-thickness-btn]");
    if (!(btn instanceof HTMLElement)) return;
    ctx.tvMenu.open(
      btn,
      HIGHLIGHTER_WIDTH_ITEMS.map((item) => ({ id: item.id, label: item.label })),
      {
        activeId: String(draft.lineWidth ?? HIGHLIGHTER_DEFAULTS.lineWidth),
        onSelect: (id) => {
          ctx.patchDrawing({ lineWidth: Number(id) || HIGHLIGHTER_DEFAULTS.lineWidth });
          syncAnnotationDialogUi(root, ctx.getDraft());
          ctx.syncColorUi();
        },
      },
    );
  });
}
