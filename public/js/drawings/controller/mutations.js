import {
  finalizeParallelChannelDrawing,
} from "../tools/channel/parallel.js";
import {
  finalizeFlatTopBottomDrawing,
} from "../tools/channel/flatTopBottom.js";
import { finalizeDisjointChannelDrawing } from "../tools/channel/disjoint.js";
import { finalizeFibRetracementDrawing, isFibRetracementTool } from "../tools/fib/retracement.js";
import { finalizeGannDrawing, isGannTool } from "../tools/gann/index.js";
import { finalizePatternDrawing, isPatternTool } from "../tools/pattern/index.js";
import { finalizeCycleDrawing, isCycleTool } from "../tools/cycle/index.js";
import { normalizeRegressionDrawing } from "../tools/regression/trend.js";
import { finalizePositionDrawing, isPositionTool } from "../tools/position/barrel.js";
import { finalizeForecastDrawing, isForecastTool } from "../tools/forecast/index.js";
import { finalizeMeasureDrawing, isMeasureTool } from "../tools/measure/index.js";
import {
  extractToolDefaults,
  isToolDefaultsPatch,
  saveToolDefaults,
} from "../toolbars/defaults/store.js";
import { shouldShowLockedRemoveConfirm, showRemoveLockedConfirmDialog } from "../settings/confirm/remove.js";
import { debugDrawingAction, debugDrawings, debugDrawingsLoaded } from "../../debug/chart/drawings.js";

/** @param {import("../types.js").UserDrawing[]} a @param {import("../types.js").UserDrawing[]} b */
function drawingsSnapshotEqual(a, b) {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** @param {import("./state.js").ControllerState} ctx */
export function attachMutations(ctx) {
  function applyDrawingsSync(next, selId) {
    ctx.drawings = structuredClone(next);
    if (ctx.selectedId !== selId) {
      ctx.selectedId = selId ?? null;
      ctx.primitive.setSelectedId(ctx.selectedId, { skipPriceLines: true });
    }
    ctx.primitive.setDrawings(ctx.drawings, { skipPriceLines: true });
  }

  function clearAll() {
    const n = ctx.drawings.length;
    if (ctx.drawings.length) ctx.recordHistory();
    ctx.drawings = [];
    ctx.resetPlacement();
    ctx.setMeasureOverlay(null);
    ctx.measureDragActive = false;
    ctx.selectDrawing(null);
    ctx.syncDrawingsToPrimitive();
    if (n) debugDrawings(`cleared ${n} drawing${n === 1 ? "" : "s"}`);
    ctx.emit("change");
  }

  function removeDrawings(opts = {}) {
    const includeLocked = Boolean(opts.includeLocked);
    if (!ctx.drawings.length) return;

    const lockedCount = ctx.drawings.filter((d) => d.locked).length;
    const unlockedCount = ctx.drawings.length - lockedCount;

    const doRemoveAll = () => {
      const n = ctx.drawings.length;
      ctx.recordHistory();
      ctx.drawings = [];
      ctx.setMeasureOverlay(null);
      ctx.measureDragActive = false;
      ctx.selectDrawing(null);
      ctx.syncDrawingsToPrimitive();
      if (n) debugDrawings(`removed ${n} drawing${n === 1 ? "" : "s"} (all)`);
      ctx.emit("change");
    };

    const doRemoveUnlocked = () => {
      if (!unlockedCount) return;
      ctx.recordHistory();
      ctx.drawings = ctx.drawings.filter((d) => !d.locked);
      ctx.selectDrawing(null);
      ctx.syncDrawingsToPrimitive();
      debugDrawings(`removed ${unlockedCount} unlocked drawing${unlockedCount === 1 ? "" : "s"}`);
      ctx.emit("change");
    };

    if (includeLocked) {
      doRemoveAll();
      return;
    }

    if (lockedCount > 0) {
      if (!unlockedCount) {
        if (shouldShowLockedRemoveConfirm()) {
          showRemoveLockedConfirmDialog({ onYes: doRemoveAll, onNo: () => {} });
          return;
        }
        doRemoveAll();
        return;
      }
      if (shouldShowLockedRemoveConfirm()) {
        showRemoveLockedConfirmDialog({ onYes: doRemoveAll, onNo: doRemoveUnlocked });
        return;
      }
      doRemoveUnlocked();
      return;
    }

    doRemoveAll();
  }

  function removeDrawingAt(index) {
    ctx.recordHistory();
    const removed = ctx.drawings[index];
    ctx.drawings = ctx.drawings.filter((_, i) => i !== index);
    if (removed?.id === ctx.selectedId) ctx.selectDrawing(null);
    ctx.syncDrawingsToPrimitive();
    if (removed) debugDrawingAction(removed, "removed");
    ctx.emit("change");
  }

  function removeDrawingById(id) {
    const idx = ctx.drawings.findIndex((d) => d.id === id);
    if (idx >= 0) removeDrawingAt(idx);
  }

  /** @param {import("../types.js").UserDrawing[]} next @param {{ silent?: boolean, source?: string }} [opts] */
  function replaceDrawings(next, opts = {}) {
    const cloned = structuredClone(next);
    if (opts.silent && drawingsSnapshotEqual(ctx.drawings, cloned)) return;
    ctx.drawings = cloned;
    if (!ctx.drawings.some((d) => d.id === ctx.selectedId)) ctx.selectDrawing(null, { silent: opts.silent });
    ctx.syncDrawingsToPrimitive();
    debugDrawingsLoaded(ctx.drawings.length, opts.source ?? (opts.silent ? "sync" : "replace"));
    if (!opts.silent) ctx.emit("change");
  }

  function updateDrawing(id, patch, opts = {}) {
    const idx = ctx.drawings.findIndex((d) => d.id === id);
    if (idx < 0) return;
    if (!opts.silent) ctx.recordHistory();
    ctx.drawings = ctx.drawings.map((d) => {
      if (d.id !== id) return d;
      const merged = { ...d, ...patch };
      if (d.type === "parallel-channel") return finalizeParallelChannelDrawing(merged);
      if (d.type === "flat-top-bottom") return finalizeFlatTopBottomDrawing(merged);
      if (d.type === "disjoint-channel") return finalizeDisjointChannelDrawing(merged);
      if (isFibRetracementTool(d.type)) return finalizeFibRetracementDrawing(merged);
      if (isGannTool(d.type)) return finalizeGannDrawing(merged);
      if (isPatternTool(d.type)) return finalizePatternDrawing(merged);
      if (isCycleTool(d.type)) return finalizeCycleDrawing(merged);
      if (d.type === "regression-trend") return normalizeRegressionDrawing(merged);
      if (isPositionTool(d.type)) return finalizePositionDrawing(merged);
      if (isForecastTool(d.type)) return finalizeForecastDrawing(merged);
      if (isMeasureTool(d.type)) return finalizeMeasureDrawing(merged);
      return merged;
    });
    const updated = ctx.drawings.find((d) => d.id === id);
    if (updated && isToolDefaultsPatch(patch, updated.type)) {
      saveToolDefaults(updated.type, extractToolDefaults(updated));
    }
    const skipPriceLines = Boolean(opts.silent && ctx.draggingDrawing);
    ctx.primitive.setDrawings(ctx.drawings, { skipPriceLines });
    if (!opts.silent) ctx.emit("change");
    else if (ctx.draggingDrawing) ctx.emit("dragSync");
  }

  Object.assign(ctx, {
    applyDrawingsSync,
    clearAll,
    removeDrawings,
    removeDrawingAt,
    removeDrawingById,
    replaceDrawings,
    updateDrawing,
  });
}
