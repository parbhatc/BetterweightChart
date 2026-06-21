import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  isPathTool,
  isPolylineTool,
  isRectangleTool,
  shapeDefaultsForType,
  shapeDraftFromDrawing,
  shapeHidesCoordsTab,
  shapeHidesTextTab,
  shapeUsesLineSectionLabel,
  supportsShapeStyleSettings,
} from "../../tools/shape/index.js";
import { setTvCheck, syncLineStylePreview } from "../dialog/utils.js";

export { shapeDraftFromDrawing };

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function syncShapeDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const show = supportsShapeStyleSettings(drawingType);
  const isRect = isRectangleTool(drawingType);
  const isPath = isPathTool(drawingType);

  root.querySelectorAll("[data-shape-background-section]").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !show || isPath;
  });
  root.querySelectorAll("[data-shape-middle-line-section]").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !show || !isRect;
  });

  const lineHead = root.querySelector("[data-line-section-head]");
  if (lineHead) {
    lineHead.textContent = shapeUsesLineSectionLabel(drawingType) ? "Line" : show ? "Border" : "Line";
  }

  const textTab = root.querySelector('[data-tab="text"]');
  const coordsTab = root.querySelector('[data-tab="coordinates"]');
  if (show) {
    if (textTab instanceof HTMLElement) textTab.hidden = shapeHidesTextTab(drawingType);
    if (coordsTab instanceof HTMLElement) coordsTab.hidden = shapeHidesCoordsTab(drawingType);
  }

  if (!show) return;

  const defaults = shapeDefaultsForType(drawingType);
  const color = draft.color ?? defaults.color;
  const opacity = draft.colorOpacity ?? defaults.colorOpacity ?? 100;
  const lineWidth = draft.lineWidth ?? defaults.lineWidth ?? 2;

  const styleSwatch = root.querySelector("[data-style-swatch]");
  const styleLine = root.querySelector("[data-style-line]");
  if (styleSwatch instanceof HTMLElement) {
    styleSwatch.style.backgroundColor = applyColorOpacity(color, opacity);
  }
  syncLineStylePreview(styleLine, {
    color,
    opacity,
    width: lineWidth,
    style: Number(draft.lineStyle ?? 0),
  });

  if (!isPath) {
    const bgBtn = root.querySelector("[data-shape-background-btn]");
    const bgColorBtn = root.querySelector("[data-shape-background-color]");
    const bgSwatch = root.querySelector("[data-shape-background-swatch]");
    const showBg = draft.showShapeBackground !== false;
    setTvCheck(bgBtn, showBg);
    if (bgColorBtn instanceof HTMLButtonElement) bgColorBtn.disabled = !showBg;
    if (bgSwatch instanceof HTMLElement) {
      bgSwatch.style.backgroundColor = applyColorOpacity(
        draft.shapeBackgroundColor ?? color,
        draft.shapeBackgroundOpacity ?? 20,
      );
    }
  }

  if (isRect) {
    const midBtn = root.querySelector("[data-shape-middle-line-btn]");
    const midColorBtn = root.querySelector("[data-shape-middle-line-color]");
    const midSwatch = root.querySelector("[data-shape-middle-line-swatch]");
    const midLine = root.querySelector("[data-shape-middle-line-preview]");
    const showMid = Boolean(draft.showRectangleMiddleLine);
    setTvCheck(midBtn, showMid);
    if (midColorBtn instanceof HTMLButtonElement) midColorBtn.disabled = !showMid;
    const midColor = String(draft.middleLineColor ?? color);
    const midWidth = Number(draft.middleLineWidth ?? 1);
    if (midSwatch instanceof HTMLElement) midSwatch.style.backgroundColor = midColor;
    if (midLine instanceof HTMLElement) {
      midLine.style.backgroundColor = midColor;
      midLine.style.height = `${midWidth}px`;
    }
  }
}

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function readShapeDraftFromUi(root, draft) {
  if (!supportsShapeStyleSettings(String(draft.drawingType ?? ""))) return {};
  const patch = shapeDraftFromDrawing(
    /** @type {import("../../types.js").UserDrawing} */ ({ ...draft, type: draft.drawingType }),
  );
  const drawingType = String(draft.drawingType ?? "");
  if (!isPathTool(drawingType)) {
    const bgBtn = root.querySelector("[data-shape-background-btn]");
    patch.showShapeBackground = bgBtn?.classList.contains("tv-set__check--on") ?? true;
  }
  if (isRectangleTool(drawingType)) {
    const midBtn = root.querySelector("[data-shape-middle-line-btn]");
    patch.showRectangleMiddleLine = midBtn?.classList.contains("tv-set__check--on") ?? false;
  }
  return patch;
}

/**
 * @param {HTMLElement} root
 * @param {{ getDraft: () => Record<string, unknown>, patchDrawing: (patch: Record<string, unknown>) => void, colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>, syncColorUi: () => void }} ctx
 */
export function wireShapeSettings(root, ctx) {
  root.querySelector("[data-shape-background-btn]")?.addEventListener("click", () => {
    const draft = ctx.getDraft();
    if (isPathTool(String(draft.drawingType ?? ""))) return;
    const btn = root.querySelector("[data-shape-background-btn]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const next = !btn.classList.contains("tv-set__check--on");
    setTvCheck(btn, next);
    ctx.patchDrawing({ showShapeBackground: next });
    syncShapeDialogUi(root, ctx.getDraft());
  });

  root.querySelector("[data-shape-background-color]")?.addEventListener("click", (ev) => {
    const draft = ctx.getDraft();
    const drawingType = String(draft.drawingType ?? "");
    if (isPathTool(drawingType) || draft.showShapeBackground === false) return;
    const target = ev.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const defaults = shapeDefaultsForType(drawingType);
    ctx.colorPicker.openSwatch(
      target,
      {
        color: String(draft.shapeBackgroundColor ?? draft.color ?? defaults.color),
        opacity: Number(draft.shapeBackgroundOpacity ?? defaults.shapeBackgroundOpacity ?? 20),
      },
      {
        onChange: (value) => {
          ctx.patchDrawing({
            shapeBackgroundColor: value.color,
            shapeBackgroundOpacity: value.opacity,
          });
          syncShapeDialogUi(root, ctx.getDraft());
        },
      },
    );
  });

  root.querySelector("[data-shape-middle-line-btn]")?.addEventListener("click", () => {
    const draft = ctx.getDraft();
    if (!isRectangleTool(String(draft.drawingType ?? ""))) return;
    const btn = root.querySelector("[data-shape-middle-line-btn]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const next = !btn.classList.contains("tv-set__check--on");
    setTvCheck(btn, next);
    ctx.patchDrawing({ showRectangleMiddleLine: next });
    syncShapeDialogUi(root, ctx.getDraft());
  });

  root.querySelector("[data-shape-middle-line-color]")?.addEventListener("click", (ev) => {
    const draft = ctx.getDraft();
    if (!isRectangleTool(String(draft.drawingType ?? "")) || !draft.showRectangleMiddleLine) return;
    const target = ev.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    ctx.colorPicker.openSwatch(
      target,
      { color: String(draft.middleLineColor ?? draft.color ?? "#9C27B0"), opacity: 100 },
      {
        onChange: (value) => {
          ctx.patchDrawing({ middleLineColor: value.color });
          syncShapeDialogUi(root, ctx.getDraft());
        },
      },
    );
  });
}
