import { isMultiPointTool } from "../registry/tools.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachKeyboard(ctx) {
  function shouldHandleDrawingShortcut(ev) {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return false;
    if (document.querySelector(".tv-settings:not([hidden])")) return false;
    if (document.querySelector(".tv-drawing-settings:not([hidden])")) return false;
    return true;
  }

  function onKeyDown(ev) {
    if (ev.key === "Escape") {
      if (isMultiPointTool(ctx.activeTool) && ctx.placementStaged.length >= 2) {
        ctx.finishMultiPointPlacement();
        ctx.unpinValuesTooltip();
        ctx.drag.forceEnd();
        ctx.syncChartPointerHandling();
        return;
      }
      ctx.resetPlacement();
      ctx.setMeasureOverlay(null);
      ctx.measureDragActive = false;
      ctx.unpinValuesTooltip();
      ctx.drag.forceEnd();
      if (!ctx.isCursorTool(ctx.activeTool) && !ctx.measureMode && !isMultiPointTool(ctx.activeTool)) {
        ctx.setActiveTool("cursor");
      } else if (ctx.isCursorTool(ctx.activeTool)) {
        ctx.selectDrawing(null);
      }
      ctx.syncChartPointerHandling();
    }
    if (ev.key === "Enter" && isMultiPointTool(ctx.activeTool)) {
      ctx.finishMultiPointPlacement();
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && ctx.drawings.length) {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      ev.preventDefault();
      ctx.removeDrawings({ includeLocked: ctx.getAlwaysRemoveLocked() });
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c") {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (ctx.copySelectedDrawing()) ev.preventDefault();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      ev.preventDefault();
      if (!ctx.pasteDrawing()) void ctx.pasteDrawingFromSystemClipboard();
    }
    if (shouldHandleDrawingShortcut(ev) && (ev.ctrlKey || ev.metaKey)) {
      const key = ev.key.toLowerCase();
      const isUndo = key === "z" && !ev.shiftKey;
      const isRedo = key === "y" || (key === "z" && ev.shiftKey);
      if (isUndo && ctx.undoDrawing()) {
        ev.preventDefault();
      } else if (isRedo && ctx.redoDrawing()) {
        ev.preventDefault();
      }
    }
  }

  function bindKeyboard() {
    document.addEventListener("keydown", onKeyDown);
    const onWindowBlur = () => ctx.drag.finishPointerDrag();
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onWindowBlur);
    };
  }

  Object.assign(ctx, { bindKeyboard });
}
