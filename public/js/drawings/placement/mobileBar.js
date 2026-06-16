import { isMultiPointTool } from "../registry/tools.js";
import { TOOL_LABELS } from "../catalog/tools.js";

const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");

/**
 * Bottom bar while placing drawings on touch devices.
 * @param {object} controller
 * @param {HTMLElement} mountEl
 */
export function mountMobilePlacementBar(controller, mountEl) {
  if (!COARSE_POINTER_MQ.matches || !mountEl) return null;

  const bar = document.createElement("div");
  bar.className = "tv-draw-placement-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Drawing placement");
  bar.innerHTML = `<div class="tv-draw-placement-bar__inner">
    <span class="tv-draw-placement-bar__hint"></span>
    <div class="tv-draw-placement-bar__actions">
      <button type="button" class="tv-draw-placement-bar__btn tv-draw-placement-bar__btn--cancel" data-action="cancel">Cancel</button>
      <button type="button" class="tv-draw-placement-bar__btn tv-draw-placement-bar__btn--done" data-action="done" hidden>Done</button>
    </div>
  </div>`;
  mountEl.appendChild(bar);

  const hintEl = bar.querySelector(".tv-draw-placement-bar__hint");
  const doneBtn = bar.querySelector('[data-action="done"]');
  const cancelBtn = bar.querySelector('[data-action="cancel"]');

  function cancelHintSuffix() {
    return controller.getStayInDrawingMode?.() ? "" : " · Cancel exits";
  }

  function sync() {
    if (!controller.getShowMobilePlacementBar?.()) {
      bar.hidden = true;
      return;
    }
    if (controller.isCursorTool?.()) {
      bar.hidden = true;
      return;
    }
    const staged = controller.getPlacementStaged?.() ?? [];
    const tool = controller.getActiveTool?.() ?? "cursor";
    const multi = isMultiPointTool(tool);
    const active = staged.length > 0 || controller.hasPreview?.();

    bar.hidden = !active;
    if (!active || !hintEl) return;

    const label = controller.getToolLabel?.() ?? TOOL_LABELS[tool] ?? tool;
    const cancelSuffix = cancelHintSuffix();
    if (multi) {
      hintEl.textContent =
        staged.length < 2
          ? `${label}: tap to add points${cancelSuffix}`
          : `${label}: ${staged.length} points · tap Done${cancelSuffix}`;
      if (doneBtn) doneBtn.hidden = staged.length < 2;
    } else if (staged.length === 1) {
      hintEl.textContent = `${label}: tap to set second point${cancelSuffix}`;
      if (doneBtn) doneBtn.hidden = true;
    } else {
      hintEl.textContent = `${label}: tap chart to place${cancelSuffix}`;
      if (doneBtn) doneBtn.hidden = true;
    }
  }

  cancelBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    controller.cancelPlacement?.();
    if (!controller.getStayInDrawingMode?.()) {
      controller.setActiveTool?.("cursor");
    }
    sync();
  });

  doneBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    controller.finishMultiPointPlacement?.();
    sync();
  });

  controller.on?.("toolChange", sync);
  controller.on?.("placementChange", sync);
  controller.on?.("utilityChange", sync);
  sync();

  return { sync, el: bar };
}
