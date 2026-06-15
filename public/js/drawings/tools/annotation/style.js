import { isFreehandTool } from "../../registry/tools.js";

export const BRUSH_DEFAULTS = {
  color: "#00BCD4",
  colorOpacity: 100,
  lineWidth: 2,
  leftEnd: "normal",
  rightEnd: "normal",
  showBrushBackground: false,
  brushBackgroundColor: "#00BCD4",
  brushBackgroundOpacity: 20,
};

export const HIGHLIGHTER_DEFAULTS = {
  color: "#FFEB3B",
  colorOpacity: 35,
  lineWidth: 20,
};

export const ARROW_MARKER_DEFAULTS = {
  color: "#2962FF",
  colorOpacity: 100,
  lineWidth: 2,
};

export const ARROW_MARK_UP_DEFAULTS = {
  color: "#089981",
  colorOpacity: 100,
  lineWidth: 2,
};

export const ARROW_MARK_DOWN_DEFAULTS = {
  color: "#F23645",
  colorOpacity: 100,
  lineWidth: 2,
};

export const HIGHLIGHTER_WIDTH_ITEMS = [
  { id: "8", label: "8px" },
  { id: "12", label: "12px" },
  { id: "20", label: "20px" },
  { id: "32", label: "32px" },
  { id: "48", label: "48px" },
  { id: "64", label: "64px" },
  { id: "80", label: "80px" },
  { id: "96", label: "96px" },
];

/** @param {string} type */
export function isBrushTool(type) {
  return type === "brush";
}

/** @param {string} type */
export function isHighlighterTool(type) {
  return type === "highlighter";
}

/** @param {string} type */
export function isArrowMarkerTool(type) {
  return type === "arrow-marker";
}

/** @param {string} type */
export function isDirectionArrowMarkTool(type) {
  return type === "arrow-mark-up" || type === "arrow-mark-down";
}

/** @param {string} type */
export function supportsAnnotationStyleSettings(type) {
  return (
    isFreehandTool(type) ||
    isArrowMarkerTool(type) ||
    isDirectionArrowMarkTool(type)
  );
}

/** @param {string} type */
export function annotationDefaultsForType(type) {
  if (type === "brush") return { ...BRUSH_DEFAULTS };
  if (type === "highlighter") return { ...HIGHLIGHTER_DEFAULTS };
  if (type === "arrow-marker") return { ...ARROW_MARKER_DEFAULTS };
  if (type === "arrow-mark-up") return { ...ARROW_MARK_UP_DEFAULTS };
  if (type === "arrow-mark-down") return { ...ARROW_MARK_DOWN_DEFAULTS };
  return {};
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function annotationDraftFromDrawing(drawing) {
  const base = annotationDefaultsForType(drawing.type);
  return {
    ...base,
    color: drawing.color ?? base.color,
    colorOpacity: drawing.colorOpacity ?? base.colorOpacity,
    lineWidth: drawing.lineWidth ?? base.lineWidth,
    leftEnd: drawing.leftEnd ?? base.leftEnd ?? "normal",
    rightEnd: drawing.rightEnd ?? base.rightEnd ?? "normal",
    showBrushBackground: drawing.showBrushBackground ?? base.showBrushBackground ?? false,
    brushBackgroundColor: drawing.brushBackgroundColor ?? base.brushBackgroundColor ?? base.color,
    brushBackgroundOpacity: drawing.brushBackgroundOpacity ?? base.brushBackgroundOpacity ?? 20,
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizeAnnotationDrawing(drawing) {
  if (!supportsAnnotationStyleSettings(drawing.type)) return drawing;
  return { ...annotationDraftFromDrawing(drawing), ...drawing };
}

/** Tools that stay active after placing (TradingView brush/highlighter/path behavior). */
export { keepsToolAfterCommit } from "../shape/index.js";
