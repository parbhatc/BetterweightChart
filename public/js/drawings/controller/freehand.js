import { newDrawing } from "./factory/index.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachFreehand(ctx) {
  function appendFreehandPoint(clientX, clientY, point) {
    if (ctx.freehandLastClient) {
      const dist = Math.hypot(clientX - ctx.freehandLastClient.x, clientY - ctx.freehandLastClient.y);
      if (dist < 3) return;
    }
    ctx.freehandLastClient = { x: clientX, y: clientY };
    ctx.freehandPoints.push(point);
    ctx.setPreview(newDrawing(ctx.activeTool, [...ctx.freehandPoints]));
  }

  /** @param {import("../types.js").DrawPoint} point */
  function startFreehand(point, clientX, clientY, ev) {
    ctx.freehandDrawing = true;
    ctx.freehandPoints = [point];
    ctx.freehandLastClient = { x: clientX, y: clientY };
    if (ev) ctx.drag.beginPointerSession(ev);
    ctx.setPreview(newDrawing(ctx.activeTool, [point]));
    ctx.syncChartPointerHandling();
    bindFreehandDocumentListeners();
  }

  function finishFreehand() {
    if (!ctx.freehandDrawing) return;
    ctx.freehandDrawing = false;
    unbindFreehandDocumentListeners();
    ctx.drag.endPointerSession();
    if (ctx.freehandPoints.length >= 2) {
      ctx.commitDrawing(newDrawing(ctx.activeTool, [...ctx.freehandPoints]));
    }
    ctx.freehandPoints = [];
    ctx.freehandLastClient = null;
    ctx.setPreview(null);
    ctx.syncChartPointerHandling();
  }

  /** @param {MouseEvent | PointerEvent} ev */
  function onFreehandDocumentMove(ev) {
    if (!ctx.freehandDrawing) return;
    ctx.syncDrawCrosshair(ev.clientX, ev.clientY);
    const point = ctx.resolvePoint(ev.clientX, ev.clientY);
    if (point) appendFreehandPoint(ev.clientX, ev.clientY, point);
  }

  function onFreehandDocumentUp() {
    if (ctx.freehandDrawing) finishFreehand();
  }

  function bindFreehandDocumentListeners() {
    if (ctx.freehandDocumentListenersBound) return;
    ctx.freehandDocumentListenersBound = true;
    document.addEventListener("pointermove", onFreehandDocumentMove);
    document.addEventListener("mousemove", onFreehandDocumentMove);
    document.addEventListener("pointerup", onFreehandDocumentUp);
    document.addEventListener("mouseup", onFreehandDocumentUp);
    document.addEventListener("pointercancel", onFreehandDocumentUp);
  }

  function unbindFreehandDocumentListeners() {
    if (!ctx.freehandDocumentListenersBound) return;
    ctx.freehandDocumentListenersBound = false;
    document.removeEventListener("pointermove", onFreehandDocumentMove);
    document.removeEventListener("mousemove", onFreehandDocumentMove);
    document.removeEventListener("pointerup", onFreehandDocumentUp);
    document.removeEventListener("mouseup", onFreehandDocumentUp);
    document.removeEventListener("pointercancel", onFreehandDocumentUp);
  }

  Object.assign(ctx, {
    appendFreehandPoint,
    startFreehand,
    finishFreehand,
    getFreehandDrawing: () => ctx.freehandDrawing,
  });
}

/** @param {import("./state.js").ControllerState} ctx */
export function attachCursorMark(ctx) {
  function updateCursorMark(clientX, clientY, point) {
    if (!["dot", "demonstration"].includes(ctx.activeTool)) {
      ctx.cursorMark.hidden = true;
      return;
    }
    const rect = ctx.container.getBoundingClientRect();
    const x = point?.x ?? clientX - rect.left;
    const y = point?.y ?? clientY - rect.top;
    ctx.cursorMark.style.left = `${x}px`;
    ctx.cursorMark.style.top = `${y}px`;
    ctx.cursorMark.classList.toggle("chart-cursor-mark--demo", ctx.activeTool === "demonstration");
    ctx.cursorMark.hidden = false;
  }

  function hideCursorMark() {
    ctx.cursorMark.hidden = true;
  }

  function updateCursorMarkVisibility() {
    if (!["dot", "demonstration"].includes(ctx.activeTool)) {
      ctx.cursorMark.hidden = true;
    }
  }

  Object.assign(ctx, {
    updateCursorMark,
    hideCursorMark,
    updateCursorMarkVisibility,
  });
}
