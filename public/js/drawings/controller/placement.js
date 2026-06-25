/** @param {import("./state.js").ControllerState} ctx */
export function attachPlacement(ctx) {
  function emitPlacementChange() {
    ctx.emit("placementChange");
  }

  function setPreview(p, opts = {}) {
    ctx.preview = p;
    ctx.syncDrawingPrimitiveAttachment?.();
    if (ctx._primitiveAttached) ctx.primitive.setPreview(p);
    ctx.syncChartPointerHandling();
    if (!opts.silent) emitPlacementChange();
  }

  function setMeasureOverlay(overlay) {
    ctx.measureOverlay = overlay;
    ctx.syncDrawingPrimitiveAttachment?.();
    if (ctx._primitiveAttached) ctx.primitive.setMeasureOverlay(overlay);
  }

  function resetPlacement() {
    ctx.placementStaged = [];
    ctx.freehandPoints = [];
    ctx.freehandDrawing = false;
    ctx.freehandLastClient = null;
    setPreview(null);
    ctx.resetMobilePlacementGestureFn();
  }

  function getPlacementSyncSnapshot() {
    return {
      preview: ctx.preview ? structuredClone(ctx.preview) : null,
    };
  }

  /** @param {{ preview?: import("../types.js").UserDrawing | null }} snapshot */
  function applyPlacementSyncSnapshot(snapshot) {
    ctx.preview = snapshot.preview ? structuredClone(snapshot.preview) : null;
    ctx.syncDrawingPrimitiveAttachment?.();
    if (ctx._primitiveAttached) ctx.primitive.setPreview(ctx.preview);
  }

  function cancelPlacement() {
    resetPlacement();
    setMeasureOverlay(null);
    ctx.measureDragActive = false;
    ctx.drag.forceEnd();
    ctx.syncChartPointerHandling();
  }

  Object.assign(ctx, {
    emitPlacementChange,
    setPreview,
    setMeasureOverlay,
    resetPlacement,
    getPlacementSyncSnapshot,
    applyPlacementSyncSnapshot,
    cancelPlacement,
  });
}
