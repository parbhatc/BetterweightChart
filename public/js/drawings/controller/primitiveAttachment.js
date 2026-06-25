/** @param {import("./state.js").ControllerState} ctx */
export function needsDrawingPrimitive(ctx) {
  if (ctx.drawings.length > 0) return true;
  if (ctx.measureMode) return true;
  if (ctx.placementStaged.length > 0) return true;
  if (ctx.preview) return true;
  if (ctx.freehandDrawing) return true;
  if (!ctx.isCursorTool(ctx.activeTool)) return true;
  return false;
}

/** @param {import("./state.js").ControllerState} ctx */
export function syncDrawingPrimitiveAttachment(ctx) {
  const needed = needsDrawingPrimitive(ctx);
  if (needed && !ctx._primitiveAttached) {
    ctx.series.attachPrimitive(ctx.primitive);
    ctx._primitiveAttached = true;
    ctx.syncDrawingsToPrimitive?.({ skipPriceLines: true });
    ctx.primitive.setDrawingsHidden(ctx.drawingsHidden || ctx.hideAll);
    return;
  }
  if (!needed && ctx._primitiveAttached) {
    ctx.series.detachPrimitive(ctx.primitive);
    ctx._primitiveAttached = false;
  }
}
