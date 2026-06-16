import { createDrawingDrag } from "./drag/index.js";
import { createPointerHandlers } from "./pointer/handlers.js";
import { createTooltipOverlay } from "./tooltip/overlay.js";
import { resolvePriceOffset } from "../tools/channel/parallel.js";
import { resolveFlatPrice } from "../tools/channel/flatTopBottom.js";
import { COARSE_POINTER_MQ } from "./state.js";

/** @param {import("./state.js").ControllerState} ctx */
export function wireController(ctx) {
  ({
    hideValuesTooltip: ctx.hideValuesTooltip,
    unpinValuesTooltip: ctx.unpinValuesTooltip,
    isValuesTooltipPinned: ctx.isValuesTooltipPinned,
    updateValuesTooltipAt: ctx.updateValuesTooltipAt,
    clearLongPress: ctx.clearLongPress,
    scheduleLongPress: ctx.scheduleLongPress,
    cancelLongPressIfMoved: ctx.cancelLongPressIfMoved,
  } = createTooltipOverlay({
    getContext: () => ctx.getContext(),
    resolvePoint: (...args) => ctx.resolvePoint(...args),
    valuesTooltip: ctx.valuesTooltip,
    overlayRoot: ctx.overlayRoot,
    chart: ctx.chart,
    series: ctx.series,
    onBarHover: ctx.onValuesTooltipBarChange,
    onPinChange: () => ctx.syncChartPointerHandling(),
  }));

  const pointerApi = {
    container: ctx.container,
    overlayRoot: ctx.overlayRoot,
    chart: ctx.chart,
    DRAWING_UI_SELECTOR: ctx.DRAWING_UI_SELECTOR,
    getActiveTool: () => ctx.activeTool,
    setActiveTool: (...args) => ctx.setActiveTool(...args),
    isCursorTool: (...args) => ctx.isCursorTool(...args),
    getDrawings: () => ctx.drawings,
    getPlacementStaged: () => ctx.placementStaged,
    getPreview: () => ctx.preview,
    setPreview: (...args) => ctx.setPreview(...args),
    resetPlacement: () => ctx.resetPlacement(),
    commitDrawing: (...args) => ctx.commitDrawing(...args),
    finishMultiPointPlacement: () => ctx.finishMultiPointPlacement(),
    getContext: () => ctx.getContext(),
    resolvePoint: (...args) => ctx.resolvePoint(...args),
    shouldSyncDrawCrosshair: (...args) => ctx.shouldSyncDrawCrosshair(...args),
    syncDrawCrosshair: (...args) => ctx.syncDrawCrosshair(...args),
    setDrawCrosshairAtClient: (...args) => ctx.setDrawCrosshairAtClient(...args),
    applyCrosshairScrollDelta: (...args) => ctx.applyCrosshairScrollDelta(...args),
    syncDrawCrosshairAtMediaAnchor: () => ctx.syncDrawCrosshairAtMediaAnchor(),
    getDrawCrosshairMedia: () => ctx.getDrawCrosshairMedia(),
    resolveDrawCrosshairPoint: () => ctx.resolveDrawCrosshairPoint(),
    pinDrawCrosshairAt: (...args) => ctx.pinDrawCrosshairAt(...args),
    repinDrawCrosshair: () => ctx.repinDrawCrosshair(),
    clearDrawCrosshair: () => ctx.clearDrawCrosshair(),
    syncNativeCrosshairAt: (...args) => ctx.syncNativeCrosshairAt(...args),
    resolveRegressionPoint: (...args) => ctx.resolveRegressionPoint(...args),
    resolvePriceOffset,
    resolveFlatPrice,
    swallowChartPointer: (...args) => ctx.swallowChartPointer(...args),
    syncChartPointerHandling: () => ctx.syncChartPointerHandling(),
    findDrawingAtPointer: (...args) => ctx.findDrawingAtPointer(...args),
    updateDrawingHover: (...args) => ctx.updateDrawingHover(...args),
    setHoveredDrawing: (...args) => ctx.setHoveredDrawing(...args),
    findStatsHit: (...args) => ctx.findStatsHit(...args),
    findAnchorHit: (...args) => ctx.findAnchorHit(...args),
    selectDrawing: (...args) => ctx.selectDrawing(...args),
    removeDrawingAt: (...args) => ctx.removeDrawingAt(...args),
    getMeasureMode: () => ctx.measureMode,
    getMeasureDragActive: () => ctx.measureDragActive,
    setMeasureDragActive: (on) => {
      ctx.measureDragActive = on;
    },
    getMeasureOverlay: () => ctx.measureOverlay,
    setMeasureOverlay: (...args) => ctx.setMeasureOverlay(...args),
    getFreehandDrawing: () => ctx.freehandDrawing,
    startFreehand: (...args) => ctx.startFreehand(...args),
    appendFreehandPoint: (...args) => ctx.appendFreehandPoint(...args),
    finishFreehand: () => ctx.finishFreehand(),
    getValuesTooltipOnLongPress: () => ctx.valuesTooltipOnLongPress,
    scheduleLongPress: (...args) => ctx.scheduleLongPress(...args),
    cancelLongPressIfMoved: (...args) => ctx.cancelLongPressIfMoved(...args),
    clearLongPress: () => ctx.clearLongPress(),
    hideValuesTooltip: () => ctx.hideValuesTooltip(),
    unpinValuesTooltip: () => ctx.unpinValuesTooltip(),
    isValuesTooltipPinned: () => ctx.isValuesTooltipPinned(),
    updateValuesTooltipAt: (...args) => ctx.updateValuesTooltipAt(...args),
    updateCursorMark: (...args) => ctx.updateCursorMark(...args),
    hideCursorMark: () => ctx.hideCursorMark(),
    emitEditText: (drawing) => ctx.listeners.editText.forEach((fn) => fn(drawing)),
    emitChange: () => ctx.emit("change"),
    setDraggingDrawing: (...args) => ctx.setDraggingDrawing(...args),
    updateDrawing: (...args) => ctx.updateDrawing(...args),
    queuePendingDrag: (state) => ctx.drag.queuePendingDrag(state),
    beginPointerSession: (ev) => ctx.drag.beginPointerSession(ev),
    endPointerSession: (ev) => ctx.drag.endPointerSession(ev),
    tryActivateDrag: (x, y) => ctx.drag.tryActivateDrag(x, y),
    applyDrawingDrag: (x, y) => ctx.drag.applyDrawingDrag(x, y),
    finishPointerDrag: (ev) => ctx.drag.finishPointerDrag(ev),
    tryAnchorDrag: (ev, px, py) => ctx.drag.tryAnchorDrag(ev, px, py),
    isPrimaryButtonDown: (ev) => ctx.drag.isPrimaryButtonDown(ev),
    isDragging: () => ctx.drag.isDragging(),
    hasActiveDrag: () => ctx.drag.hasActiveDrag(),
    isChartPlacementSuppressed: () => ctx.isChartPlacementSuppressed(),
    recentTouchInteraction: () => ctx.recentTouchInteraction(),
    armChartPlacementSuppress: (...args) => ctx.armChartPlacementSuppress(...args),
    useMobileDragPlacement: () => COARSE_POINTER_MQ.matches,
  };

  ctx.pointerApi = pointerApi;

  ctx.drag = createDrawingDrag({
    getDrawings: () => ctx.drawings,
    updateDrawing: (...args) => ctx.updateDrawing(...args),
    resolvePoint: (...args) => ctx.resolvePoint(...args),
    syncChartPointerHandling: () => ctx.syncChartPointerHandling(),
    emitChange: () => ctx.emit("change"),
    setDraggingDrawing: (...args) => ctx.setDraggingDrawing(...args),
    clearLongPress: () => ctx.clearLongPress(),
    unpinValuesTooltip: () => ctx.unpinValuesTooltip(),
    selectDrawing: (...args) => ctx.selectDrawing(...args),
    setActiveTool: (...args) => ctx.setActiveTool(...args),
    isCursorTool: (...args) => ctx.isCursorTool(...args),
    swallowChartPointer: (...args) => ctx.swallowChartPointer(...args),
    findAnchorHit: (...args) => ctx.findAnchorHit(...args),
    setRegressionGuideDrawingId: (id) => ctx.primitive.setRegressionGuideDrawingId(id),
    getContext: () => ctx.getContext(),
    getContainer: () => ctx.container,
    recordHistorySnapshot: () => ctx.recordHistory(),
  });

  ({
    bindChartListeners: ctx.bindChartListeners,
    unbindChartListeners: ctx.unbindChartListeners,
    resetMobilePlacementGesture: ctx.resetMobilePlacementGestureFn,
  } = createPointerHandlers(pointerApi));

  ctx.bindChartListeners();
  ctx.bindDrawCrosshairDotSync();
}

/** @param {import("./state.js").ControllerState} ctx */
export function setControllerTarget(ctx, next) {
  if (next.chart === ctx.chart && next.container === ctx.container) return;
  ctx.drag.forceEnd();
  ctx.unbindChartListeners();
  ctx.unsubDrawCrosshairDotSync();
  ctx.series.detachPrimitive(ctx.primitive);

  ctx.chart = next.chart;
  ctx.series = next.series;
  ctx.container = next.container;
  if (next.getContext) ctx.getContext = next.getContext;

  const nextOverlay =
    ctx.container.closest(".tv-chart-wrap__stage") ??
    ctx.container.closest(".tv-chart-wrap") ??
    ctx.container;
  if (nextOverlay !== ctx.overlayRoot) {
    nextOverlay.appendChild(ctx.cursorMark);
    nextOverlay.appendChild(ctx.drawCrosshairDot);
    nextOverlay.appendChild(ctx.valuesTooltip);
    ctx.overlayRoot = nextOverlay;
  }

  ctx.pointerApi.container = ctx.container;
  ctx.pointerApi.overlayRoot = ctx.overlayRoot;
  ctx.pointerApi.chart = ctx.chart;

  ctx.series.attachPrimitive(ctx.primitive);
  ctx.bindChartListeners();
  ctx.bindDrawCrosshairDotSync();
  ctx.syncChartPointerHandling();
  ctx.primitive.setDrawings(ctx.drawings);
}

/** @param {import("./state.js").ControllerState} ctx */
export function destroyController(ctx) {
  ctx.drag.forceEnd();
  ctx.unbindChartListeners();
  ctx.unsubDrawCrosshairDotSync();
  ctx.container.style.touchAction = "";
  const stage = ctx.container.closest(".tv-chart-wrap__stage");
  if (stage instanceof HTMLElement) stage.style.touchAction = "";
  ctx.chart.applyOptions({
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
    },
  });
  ctx.series.detachPrimitive(ctx.primitive);
  ctx.cursorMark.remove();
  ctx.drawCrosshairDot.remove();
  ctx.valuesTooltip.remove();
}

/** @param {import("./state.js").ControllerState} ctx */
export function buildControllerApi(ctx) {
  return {
    setActiveTool: (...args) => ctx.setActiveTool(...args),
    armChartPlacementSuppress: (...args) => ctx.armChartPlacementSuppress(...args),
    getActiveTool: () => ctx.activeTool,
    isCursorTool: (...args) => ctx.isCursorTool(...args),
    getToolLabel: () => ctx.getToolLabel(),
    setValuesTooltipOnLongPress: (...args) => ctx.setValuesTooltipOnLongPress(...args),
    getValuesTooltipOnLongPress: () => ctx.valuesTooltipOnLongPress,
    getDrawings: () => ctx.drawings,
    getCount: () => ctx.drawings.length,
    getLockedCount: () => ctx.getLockedCount(),
    getIndicatorCount: () => ctx.getIndicatorCount(),
    setMagnetMode: (...args) => ctx.setMagnetMode(...args),
    getMagnetMode: () => ctx.getMagnetMode(),
    setMeasureMode: (...args) => ctx.setMeasureMode(...args),
    getMeasureMode: () => ctx.getMeasureMode(),
    setDrawingsHidden: (...args) => ctx.setDrawingsHidden(...args),
    getDrawingsHidden: () => ctx.getDrawingsHidden(),
    setHideAll: (...args) => ctx.setHideAll(...args),
    getHideAll: () => ctx.getHideAll(),
    setStayInDrawingMode: (...args) => ctx.setStayInDrawingMode(...args),
    getStayInDrawingMode: () => ctx.getStayInDrawingMode(),
    setShowMobilePlacementBar: (...args) => ctx.setShowMobilePlacementBar(...args),
    getShowMobilePlacementBar: () => ctx.getShowMobilePlacementBar(),
    setLockAllDrawings: (...args) => ctx.setLockAllDrawings(...args),
    getLockAllDrawings: () => ctx.getLockAllDrawings(),
    setAlwaysRemoveLocked: (...args) => ctx.setAlwaysRemoveLocked(...args),
    getAlwaysRemoveLocked: () => ctx.getAlwaysRemoveLocked(),
    removeDrawings: (...args) => ctx.removeDrawings(...args),
    getSelectedId: () => ctx.selectedId,
    getSelectedDrawing: () => ctx.getSelectedDrawing(),
    selectDrawing: (...args) => ctx.selectDrawing(...args),
    updateDrawing: (...args) => ctx.updateDrawing(...args),
    removeDrawingById: (...args) => ctx.removeDrawingById(...args),
    replaceDrawings: (...args) => ctx.replaceDrawings(...args),
    getPlacementSyncSnapshot: () => ctx.getPlacementSyncSnapshot(),
    applyPlacementSyncSnapshot: (...args) => ctx.applyPlacementSyncSnapshot(...args),
    applyDrawingsSync: (...args) => ctx.applyDrawingsSync(...args),
    getCrosshairSyncSnapshot: () => ctx.getCrosshairSyncSnapshot(),
    applyCrosshairSyncSnapshot: (...args) => ctx.applyCrosshairSyncSnapshot(...args),
    isApplyingCrosshairSync: () => ctx.isApplyingCrosshairSync(),
    getDrawingScreenAnchor: (...args) => ctx.getDrawingScreenAnchor(...args),
    getPlacementStaged: () => [...ctx.placementStaged],
    hasPreview: () => ctx.preview != null,
    cancelPlacement: () => ctx.cancelPlacement(),
    finishMultiPointPlacement: () => ctx.finishMultiPointPlacement(),
    isDraggingDrawing: () => ctx.draggingDrawing,
    undoDrawing: () => ctx.undoDrawing(),
    redoDrawing: () => ctx.redoDrawing(),
    canUndoDrawing: () => ctx.history.canUndo(),
    canRedoDrawing: () => ctx.history.canRedo(),
    clearAll: () => ctx.clearAll(),
    copySelectedDrawing: () => ctx.copySelectedDrawing(),
    hasDrawingClipboard: () => ctx.hasDrawingClipboard(),
    pasteDrawing: (...args) => ctx.pasteDrawing(...args),
    pasteDrawingFromSystemClipboard: () => ctx.pasteDrawingFromSystemClipboard(),
    setTarget: (next) => setControllerTarget(ctx, next),
    on(event, fn) {
      ctx.listeners[event]?.add(fn);
      return () => ctx.listeners[event]?.delete(fn);
    },
    destroy() {
      ctx.unbindKeyboard?.();
      destroyController(ctx);
    },
  };
}
