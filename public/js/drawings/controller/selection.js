import { ensureTrendAngleDrawing } from "../tools/line/trendAngle.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachSelection(ctx) {
  function syncDrawingsToPrimitive(opts = {}) {
    ctx.primitive.setDrawings(ctx.drawings, opts);
    if (!opts.skipPriceLines) {
      ctx.primitive.setDrawingsHidden(ctx.drawingsHidden || ctx.hideAll);
    }
  }

  function selectDrawing(id, opts = {}) {
    if (ctx.selectedId === id && opts.silent) return;
    if (id) {
      const idx = ctx.drawings.findIndex((d) => d.id === id);
      if (idx >= 0) {
        const { barSec = 60 } = ctx.getContext();
        const next = ensureTrendAngleDrawing(ctx.drawings[idx], barSec);
        if (next !== ctx.drawings[idx]) {
          ctx.drawings = ctx.drawings.map((d, i) => (i === idx ? next : d));
          syncDrawingsToPrimitive();
        }
      }
    }
    ctx.selectedId = id;
    ctx.primitive.setSelectedId(id);
    if (!opts.silent) ctx.emit("selectionChange");
  }

  function setHoveredDrawing(id) {
    if (ctx.hoveredId === id) return;
    ctx.hoveredId = id;
    ctx.primitive.setHoveredId(id);
  }

  function getSelectedDrawing() {
    return ctx.drawings.find((d) => d.id === ctx.selectedId) ?? null;
  }

  Object.assign(ctx, {
    syncDrawingsToPrimitive,
    selectDrawing,
    setHoveredDrawing,
    getSelectedDrawing,
  });
}
