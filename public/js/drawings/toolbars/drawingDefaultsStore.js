import { DEFAULT_DRAWING_COLOR } from "../constants.js";

export const TOOL_DEFAULTS_KEY = "tv-draw-tool-defaults";

const STYLE_KEYS = [
  "color",
  "colorOpacity",
  "textColor",
  "textColorOpacity",
  "lineWidth",
  "lineStyle",
];

/** @returns {Record<string, Record<string, unknown>>} */
function loadAllToolDefaults() {
  try {
    const raw = localStorage.getItem(TOOL_DEFAULTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {string} toolType */
export function loadToolDefaults(toolType) {
  const saved = loadAllToolDefaults()[toolType];
  return saved && typeof saved === "object" ? saved : {};
}

/** @param {string} toolType @param {Record<string, unknown>} patch */
export function saveToolDefaults(toolType, patch) {
  const all = loadAllToolDefaults();
  const prev = all[toolType] && typeof all[toolType] === "object" ? all[toolType] : {};
  const next = { ...prev };
  for (const key of STYLE_KEYS) {
    if (patch[key] != null) next[key] = patch[key];
  }
  all[toolType] = next;
  localStorage.setItem(TOOL_DEFAULTS_KEY, JSON.stringify(all));
}

/** @param {import("../types.js").UserDrawing} drawing */
export function extractStyleDefaults(drawing) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of STYLE_KEYS) {
    if (drawing[key] != null) out[key] = drawing[key];
  }
  return out;
}

export function isStylePatch(patch) {
  return Object.keys(patch).some((key) => STYLE_KEYS.includes(key));
}

/** @param {string} toolType */
export function newDrawingStyleDefaults(toolType) {
  const saved = loadToolDefaults(toolType);
  return {
    color: saved.color ?? DEFAULT_DRAWING_COLOR,
    colorOpacity: saved.colorOpacity ?? 100,
    textColor: saved.textColor ?? saved.color ?? DEFAULT_DRAWING_COLOR,
    textColorOpacity: saved.textColorOpacity ?? saved.colorOpacity ?? 100,
    lineWidth: saved.lineWidth ?? 2,
    lineStyle: saved.lineStyle ?? 0,
  };
}
