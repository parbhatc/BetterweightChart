import { applyColorOpacity } from "../../../ui/color/picker.js";
import { isCycleTool, supportsCycleStyleSettings } from "../../tools/cycle/index.js";
import { setTvCheck } from "../dialog/utils.js";

/** @param {import("../../types.js").UserDrawing} drawing */
export function cycleDraftFromDrawing(drawing) {
  const color = drawing.color ?? "#159980";
  return {
    showCycleBackground: drawing.showCycleBackground ?? drawing.type === "time-cycles",
    cycleBackgroundColor: drawing.cycleBackgroundColor ?? "#6AA84F",
    cycleBackgroundOpacity: drawing.cycleBackgroundOpacity ?? 50,
    color,
  };
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncCycleDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const show = supportsCycleStyleSettings(drawingType);
  const isTimeCycles = drawingType === "time-cycles";
  const usesLinesLabel = drawingType === "cyclic-lines" || drawingType === "sine-line";

  const bgSection = root.querySelector("[data-cycle-background-section]");
  if (bgSection instanceof HTMLElement) bgSection.hidden = !isTimeCycles;

  const lineSection = root.querySelector("[data-line-section]");
  const lineHead = lineSection?.querySelector(".tv-set__section-head");
  const textTab = root.querySelector('[data-tab="text"]');
  if (show && lineSection instanceof HTMLElement) {
    lineSection.hidden = false;
    if (lineHead instanceof HTMLElement) {
      lineHead.textContent = usesLinesLabel ? "Lines" : "Line";
    }
    if (textTab instanceof HTMLElement) textTab.hidden = true;
  }

  if (!show) return;

  const bgBtn = root.querySelector("[data-cycle-background-btn]");
  const bgSwatch = root.querySelector("[data-cycle-background-swatch]");
  if (bgBtn instanceof HTMLButtonElement) {
    setTvCheck(bgBtn, draft.showCycleBackground !== false);
  }
  if (bgSwatch instanceof HTMLElement) {
    bgSwatch.style.backgroundColor = applyColorOpacity(
      draft.cycleBackgroundColor ?? "#6AA84F",
      draft.cycleBackgroundOpacity ?? 50,
    );
  }
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function readCycleDraftFromUi(root, draft) {
  if (!isCycleTool(String(draft.drawingType ?? ""))) return {};
  const bgBtn = root.querySelector("[data-cycle-background-btn]");
  return {
    showCycleBackground: bgBtn?.classList.contains("tv-set__check--on") ?? draft.showCycleBackground,
    cycleBackgroundColor: draft.cycleBackgroundColor,
    cycleBackgroundOpacity: draft.cycleBackgroundOpacity,
  };
}

/**
 * @param {HTMLElement} root
 * @param {{ getDraft: () => Record<string, unknown>, patchDrawing: (p: Record<string, unknown>) => void, colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>, syncUi: () => void }} ctx
 */
export function wireCycleSettings(root, ctx) {
  const { getDraft, patchDrawing, colorPicker, syncUi } = ctx;

  root.querySelector("[data-cycle-background-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const draft = getDraft();
    colorPicker.openSwatch(
      btn,
      {
        color: draft.cycleBackgroundColor ?? "#6AA84F",
        opacity: draft.cycleBackgroundOpacity ?? 50,
      },
      {
        onChange: (value) => {
          patchDrawing({
            cycleBackgroundColor: value.color,
            cycleBackgroundOpacity: value.opacity,
          });
          syncUi();
        },
      },
    );
  });

  root.querySelector("[data-cycle-background-btn]")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-cycle-background-btn]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const on = !btn.classList.contains("tv-set__check--on");
    setTvCheck(btn, on);
    patchDrawing({ showCycleBackground: on });
  });
}

export { isCycleTool, supportsCycleStyleSettings };
