import { isCursorTool as isCursorToolType } from "../registry/tools.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachPointerHandling(ctx) {
  function isCursorTool(tool = ctx.activeTool) {
    return isCursorToolType(tool);
  }

  /** Block time-axis pan / chart scroll (not price zoom). */
  function shouldBlockChartScroll() {
    if (ctx.isValuesTooltipPinned()) return true;
    if (ctx.measureDragActive || ctx.freehandDrawing || ctx.drag?.isDragging?.()) return true;
    if (ctx.placementStaged.length > 0 || ctx.preview != null) return true;
    if (!isCursorTool(ctx.activeTool) && ctx.activeTool !== "eraser") return true;
    return false;
  }

  /** Block pinch / wheel zoom — only when freehand (drawing mode allows zoom like values tooltip). */
  function shouldBlockChartScale() {
    return ctx.freehandDrawing;
  }

  function shouldBlockChartPan() {
    return shouldBlockChartScroll();
  }

  function syncChartPointerHandling() {
    const blockScroll = shouldBlockChartScroll();
    const blockScale = shouldBlockChartScale();
    const allowPinchZoom = blockScroll && !blockScale;
    const touchAction = allowPinchZoom ? "pinch-zoom" : blockScroll ? "none" : "";
    ctx.container.style.touchAction = touchAction;
    const stage = ctx.container.closest(".tv-chart-wrap__stage");
    if (stage instanceof HTMLElement) {
      stage.style.touchAction = touchAction;
    }
    ctx.chart.applyOptions({
      handleScroll: {
        mouseWheel: !blockScroll,
        pressedMouseMove: !blockScroll,
        horzTouchDrag: !blockScroll,
        vertTouchDrag: !blockScroll,
      },
      kineticScroll: {
        mouse: true,
        touch: !blockScroll,
      },
      handleScale: {
        mouseWheel: !blockScale,
        pinch: !blockScale,
        axisPressedMouseMove: { time: !blockScroll, price: !blockScale },
      },
    });
  }

  /** @param {MouseEvent} ev */
  function swallowChartPointer(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  Object.assign(ctx, {
    isCursorTool,
    shouldBlockChartPan,
    shouldBlockChartScroll,
    shouldBlockChartScale,
    syncChartPointerHandling,
    swallowChartPointer,
  });
}
