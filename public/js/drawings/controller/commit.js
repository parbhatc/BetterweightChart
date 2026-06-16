import { isMultiPointTool } from "../registry/tools.js";
import { keepsToolAfterCommit } from "../tools/shape/index.js";
import {
  extractToolDefaults,
  saveToolDefaults,
} from "../toolbars/defaults/store.js";
import { finalizeRegressionDrawing, isRegressionTrendTool } from "../tools/regression/trend.js";
import { newDrawing, cloneDrawing, CLIPBOARD_PREFIX } from "./factory/index.js";
import { debugDrawingAction } from "../../debug/chart/drawings.js";
import { COARSE_POINTER_MQ } from "./state.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachCommit(ctx) {
  function snapshotState() {
    return { drawings: structuredClone(ctx.drawings), selectedId: ctx.selectedId };
  }

  /** @param {{ drawings: import("../types.js").UserDrawing[], selectedId: string | null }} snap */
  function restoreSnapshot(snap) {
    ctx.drawings = structuredClone(snap.drawings);
    ctx.selectedId = snap.selectedId;
    ctx.primitive.setSelectedId(ctx.selectedId);
    ctx.syncDrawingsToPrimitive();
    ctx.emit("change");
    ctx.emit("selectionChange");
  }

  function recordHistory() {
    ctx.history.record(snapshotState());
  }

  function undoDrawing() {
    const snap = ctx.history.undo(snapshotState());
    if (snap) restoreSnapshot(snap);
    return Boolean(snap);
  }

  function redoDrawing() {
    const snap = ctx.history.redo(snapshotState());
    if (snap) restoreSnapshot(snap);
    return Boolean(snap);
  }

  function commitDrawing(drawing) {
    recordHistory();
    let committed = drawing;
    if (isRegressionTrendTool(drawing.type)) {
      const { bars, barSec } = ctx.getContext();
      committed = finalizeRegressionDrawing(drawing, bars, barSec);
    }
    saveToolDefaults(committed.type, extractToolDefaults(committed));
    ctx.drawings = [...ctx.drawings, committed];
    ctx.syncDrawingsToPrimitive();
    debugDrawingAction(committed, "added");
    ctx.resetPlacement();
    if (ctx.stayInDrawingMode) {
      ctx.selectDrawing(null);
    } else {
      ctx.selectDrawing(committed.id);
      if (!keepsToolAfterCommit(committed.type)) ctx.setActiveTool("cursor");
    }
    ctx.emit("change");
    if (COARSE_POINTER_MQ.matches) {
      ctx.clearDrawCrosshair();
      if (ctx.stayInDrawingMode && !ctx.isCursorTool(ctx.activeTool)) {
        requestAnimationFrame(() => ctx.initDrawCrosshairAtCenter());
      }
    } else if (
      ctx.shouldSyncDrawCrosshair() &&
      ctx.isCursorTool(ctx.activeTool) === false
    ) {
      requestAnimationFrame(() => {
        ctx.repinDrawCrosshair();
        requestAnimationFrame(ctx.repinDrawCrosshair);
      });
    }
  }

  function finishMultiPointPlacement() {
    if (!isMultiPointTool(ctx.activeTool) || ctx.placementStaged.length < 2) {
      ctx.resetPlacement();
      return;
    }
    commitDrawing(newDrawing(ctx.activeTool, [...ctx.placementStaged]));
    ctx.resetPlacement();
  }

  function copySelectedDrawing() {
    const sel = ctx.getSelectedDrawing();
    if (!sel) return false;
    ctx.drawingClipboard = JSON.parse(JSON.stringify(sel));
    try {
      navigator.clipboard.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(ctx.drawingClipboard)}`);
    } catch {
      /* ignore */
    }
    return true;
  }

  function hasDrawingClipboard() {
    return ctx.drawingClipboard != null;
  }

  /** @param {import("../types.js").UserDrawing} [source] */
  function pasteDrawing(source) {
    const src = source ?? ctx.drawingClipboard;
    if (!src) return false;
    const { barSec = 60 } = ctx.getContext();
    const pasted = cloneDrawing(src, { timeDelta: barSec });
    commitDrawing(pasted);
    ctx.drawingClipboard = JSON.parse(JSON.stringify(src));
    return true;
  }

  async function pasteDrawingFromSystemClipboard() {
    if (ctx.drawingClipboard && pasteDrawing()) return true;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.startsWith(CLIPBOARD_PREFIX)) return false;
      const parsed = JSON.parse(text.slice(CLIPBOARD_PREFIX.length));
      if (!parsed?.type || !Array.isArray(parsed.points)) return false;
      ctx.drawingClipboard = parsed;
      return pasteDrawing(parsed);
    } catch {
      return false;
    }
  }

  Object.assign(ctx, {
    snapshotState,
    restoreSnapshot,
    recordHistory,
    undoDrawing,
    redoDrawing,
    commitDrawing,
    finishMultiPointPlacement,
    copySelectedDrawing,
    hasDrawingClipboard,
    pasteDrawing,
    pasteDrawingFromSystemClipboard,
  });
}
