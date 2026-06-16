import { TOOL_LABELS } from "../catalog/tools.js";
import { isMultiPointTool } from "../registry/tools.js";
import {
  loadAlwaysRemoveLocked,
  saveAlwaysRemoveLocked,
  saveDrawingsVisibility,
  saveShowMobilePlacementBar,
  saveStayInDrawingMode,
} from "../toolbars/utility/settings/store.js";
import { debugDrawings, drawingTypeLabel } from "../../debug/chart/drawings.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachUtility(ctx) {
  function getLockedCount() {
    return ctx.drawings.filter((d) => d.locked).length;
  }

  function setMagnetMode(mode) {
    ctx.magnetMode = mode === "off" || mode === "strong" ? mode : "weak";
    ctx.emit("utilityChange");
  }

  function setMeasureMode(on) {
    ctx.measureMode = Boolean(on);
    if (!ctx.measureMode) {
      ctx.setMeasureOverlay(null);
      ctx.measureDragActive = false;
    }
    ctx.emit("utilityChange");
    ctx.syncChartPointerHandling();
  }

  function setDrawingsHidden(hidden) {
    ctx.drawingsHidden = Boolean(hidden);
    ctx.hideAll = false;
    ctx.syncDrawingsToPrimitive();
    saveDrawingsVisibility({ drawingsHidden: ctx.drawingsHidden, hideAll: ctx.hideAll });
    ctx.emit("utilityChange");
  }

  function setHideAll(hidden) {
    ctx.hideAll = Boolean(hidden);
    if (ctx.hideAll) ctx.drawingsHidden = true;
    ctx.syncDrawingsToPrimitive();
    saveDrawingsVisibility({ drawingsHidden: ctx.drawingsHidden, hideAll: ctx.hideAll });
    ctx.emit("utilityChange");
  }

  function setStayInDrawingMode(on) {
    ctx.stayInDrawingMode = Boolean(on);
    saveStayInDrawingMode(ctx.stayInDrawingMode);
    ctx.emit("utilityChange");
  }

  function setShowMobilePlacementBar(on) {
    ctx.showMobilePlacementBar = Boolean(on);
    saveShowMobilePlacementBar(ctx.showMobilePlacementBar);
    ctx.emit("utilityChange");
  }

  function setLockAllDrawings(locked) {
    ctx.lockAllActive = Boolean(locked);
    ctx.drawings = ctx.drawings.map((d) => ({ ...d, locked: ctx.lockAllActive }));
    ctx.syncDrawingsToPrimitive();
    ctx.emit("change");
    ctx.emit("utilityChange");
  }

  function setAlwaysRemoveLocked(value) {
    saveAlwaysRemoveLocked(Boolean(value));
    ctx.emit("utilityChange");
  }

  function setValuesTooltipOnLongPress(on) {
    ctx.valuesTooltipOnLongPress = Boolean(on);
  }

  function armChartPlacementSuppress(ms = 450) {
    ctx.suppressChartPlacementUntil = performance.now() + ms;
  }

  function isChartPlacementSuppressed() {
    return performance.now() < ctx.suppressChartPlacementUntil;
  }

  function recentTouchInteraction() {
    return performance.now() - ctx.lastTouchEndAt < 700;
  }

  function setActiveTool(tool) {
    ctx.activeTool = tool || "cursor";
    if (!ctx.isCursorTool(ctx.activeTool)) {
      debugDrawings(`tool ${drawingTypeLabel(ctx.activeTool)}`);
    }
    ctx.drag.forceEnd();
    ctx.resetPlacement();
    ctx.unpinValuesTooltip();
    ctx.updateCursorMarkVisibility();
    if (!ctx.isCursorTool(ctx.activeTool)) {
      ctx.selectDrawing(null);
      ctx.suppressChartPlacementUntil = performance.now() + 450;
      requestAnimationFrame(() => {
        ctx.initDrawCrosshairAtCenter();
        requestAnimationFrame(ctx.initDrawCrosshairAtCenter);
      });
    } else {
      ctx.pinnedDrawCrosshair = null;
      ctx.chart.clearCrosshairPosition();
      ctx.drawCrosshairDot.hidden = true;
    }
    ctx.syncChartPointerHandling();
    ctx.emit("toolChange");
    ctx.emit("cursorOverlay");
    if (!ctx.isCursorTool(ctx.activeTool)) {
      requestAnimationFrame(() => ctx.syncChartPointerHandling());
    }
  }

  function setDraggingDrawing(active) {
    if (ctx.draggingDrawing === active) return;
    const wasDragging = ctx.draggingDrawing;
    ctx.draggingDrawing = active;
    if (wasDragging && !active) ctx.syncDrawingsToPrimitive();
    ctx.emit("dragChange");
  }

  Object.assign(ctx, {
    getLockedCount,
    setMagnetMode,
    getMagnetMode: () => ctx.magnetMode,
    setMeasureMode,
    getMeasureMode: () => ctx.measureMode,
    setDrawingsHidden,
    getDrawingsHidden: () => ctx.drawingsHidden,
    setHideAll,
    getHideAll: () => ctx.hideAll,
    setStayInDrawingMode,
    getStayInDrawingMode: () => ctx.stayInDrawingMode,
    setShowMobilePlacementBar,
    getShowMobilePlacementBar: () => ctx.showMobilePlacementBar,
    setLockAllDrawings,
    getLockAllDrawings: () => ctx.lockAllActive,
    setAlwaysRemoveLocked,
    getAlwaysRemoveLocked: () => loadAlwaysRemoveLocked(),
    getIndicatorCount: () => 0,
    setActiveTool,
    getActiveTool: () => ctx.activeTool,
    getToolLabel: () => TOOL_LABELS[ctx.activeTool] ?? ctx.activeTool,
    setValuesTooltipOnLongPress,
    getValuesTooltipOnLongPress: () => ctx.valuesTooltipOnLongPress,
    armChartPlacementSuppress,
    isChartPlacementSuppressed,
    recentTouchInteraction,
    setDraggingDrawing,
    isDraggingDrawing: () => ctx.draggingDrawing,
  });
}
