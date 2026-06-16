const MAX_UNDO = 80;

/**
 * @typedef {{ drawings: import("../types.js").UserDrawing[], selectedId: string | null }} DrawingSnapshot
 */

export function createDrawingHistory() {
  /** @type {DrawingSnapshot[]} */
  let undoStack = [];
  /** @type {DrawingSnapshot[]} */
  let redoStack = [];
  let replaying = false;

  /** @param {DrawingSnapshot} snapshot */
  function record(snapshot) {
    if (replaying) return;
    undoStack.push(structuredClone(snapshot));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  /** @param {DrawingSnapshot} current */
  function undo(current) {
    if (!undoStack.length) return null;
    replaying = true;
    try {
      redoStack.push(structuredClone(current));
      const prev = undoStack.pop();
      return prev ? structuredClone(prev) : null;
    } finally {
      replaying = false;
    }
  }

  /** @param {DrawingSnapshot} current */
  function redo(current) {
    if (!redoStack.length) return null;
    replaying = true;
    try {
      undoStack.push(structuredClone(current));
      const next = redoStack.pop();
      return next ? structuredClone(next) : null;
    } finally {
      replaying = false;
    }
  }

  return {
    record,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear: () => {
      undoStack = [];
      redoStack = [];
    },
  };
}
