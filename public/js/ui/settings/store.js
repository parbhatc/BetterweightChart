import {
  DEFAULT_SETTINGS,
  SETTINGS_SECTIONS,
  cloneSettingsDefaults,
} from "./defaults.js";

const MAX_UNDO = 100;

export function createChartSettings() {
  /** @type {typeof DEFAULT_SETTINGS} */
  let settings = cloneSettingsDefaults();
  /** @type {typeof DEFAULT_SETTINGS[]} */
  let undoStack = [];
  /** @type {typeof DEFAULT_SETTINGS[]} */
  let redoStack = [];
  const listeners = new Set();

  function emit() {
    listeners.forEach((fn) => fn(settings));
  }

  function pushUndo() {
    undoStack.push(structuredClone(settings));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  return {
    get() {
      return settings;
    },
    getDefaults() {
      return cloneSettingsDefaults();
    },
    getSections() {
      return SETTINGS_SECTIONS;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    getUndoDepth() {
      return undoStack.length;
    },
    trimUndo(depth) {
      if (depth < undoStack.length) undoStack.length = depth;
    },
    clearRedo() {
      redoStack = [];
    },
    markHistory() {
      pushUndo();
    },
    undo() {
      if (!undoStack.length) return false;
      redoStack.push(structuredClone(settings));
      settings = undoStack.pop();
      emit();
      return true;
    },
    redo() {
      if (!redoStack.length) return false;
      undoStack.push(structuredClone(settings));
      settings = redoStack.pop();
      emit();
      return true;
    },
    /** @param {string} section @param {string} key @param {unknown} value @param {{ skipHistory?: boolean }} [opts] */
    set(section, key, value, opts = {}) {
      if (!settings[section] || !(key in settings[section])) return;
      if (!opts.skipHistory) pushUndo();
      settings[section][key] = value;
      emit();
    },
    /** @param {Partial<typeof DEFAULT_SETTINGS>} patch @param {{ skipHistory?: boolean }} [opts] */
    merge(patch, opts = {}) {
      if (!opts.skipHistory) pushUndo();
      for (const [section, values] of Object.entries(patch)) {
        if (settings[section] && values && typeof values === "object") {
          Object.assign(settings[section], values);
        }
      }
      emit();
    },
    /** @param {typeof DEFAULT_SETTINGS} next @param {{ skipHistory?: boolean }} [opts] */
    replace(next, opts = {}) {
      if (!opts.skipHistory) pushUndo();
      settings = structuredClone(next);
      emit();
    },
    reset() {
      pushUndo();
      settings = cloneSettingsDefaults();
      emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
