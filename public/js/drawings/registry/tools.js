import { SUPPORTED_DRAW_TOOLS } from "../catalog/tools.js";

export { SUPPORTED_DRAW_TOOLS };

export const CURSOR_TOOLS = new Set(["cursor", "dot", "arrow", "demonstration", "magic", "eraser"]);

export const FREEHAND_TOOLS = new Set(["brush", "highlighter"]);

export const MULTI_POINT_TOOLS = new Set(["path", "polyline"]);

export const POSITION_TOOLS = new Set(["long-position", "short-position"]);

export const ONE_POINT_TOOLS = new Set([
  "horizontal-line",
  "horizontal-ray",
  "vertical-line",
  "cross-line",
  "arrow-mark-up",
  "arrow-mark-down",
  "text",
  "text-annotation",
  "note",
  "price-note",
  "pin",
  "price-label",
  "signpost",
  "flag-mark",
  "post",
  "idea",
]);

export const TREND_ANGLE_TOOLS = new Set(["trend-angle"]);

export const TWO_POINT_TOOLS = new Set([
  "trend-line",
  "ray",
  "info-line",
  "extended-line",
  "regression-trend",
  "rectangle",
  "circle",
  "fib-retracement",
  "fib-time-zone",
  "fib-circles",
  "fib-spiral",
  "gann-box",
  "gann-square",
  "gann-square-fixed",
  "gann-fan",
  "cyclic-lines",
  "time-cycles",
  "sine-line",
  "position-forecast",
  "sector",
  "anchored-volume-profile",
  "price-range",
  "date-range",
  "date-price-range",
  "arrow-marker",
  "line-arrow",
  "ellipse",
  "callout",
  "comment",
  "table",
  "image",
]);

export const THREE_POINT_TOOLS = new Set([
  "parallel-channel",
  "flat-top-bottom",
  "disjoint-channel",
  "fib-extension",
  "fib-channel",
  "trend-based-fib-time",
  "fib-wedge",
  "rotated-rectangle",
  "triangle",
  "arc",
  "curve",
]);

export const FOUR_POINT_TOOLS = new Set([
  "abcd-pattern",
  "triangle-pattern",
  "elliott-correction",
  "elliott-double-combo",
  "double-curve",
]);

/** Explicit point counts for multi-point pattern / Elliott tools. */
export const TOOL_POINT_COUNTS = {
  "xabcd-pattern": 5,
  "cypher-pattern": 5,
  "head-and-shoulders": 7,
  "three-drives": 7,
  "elliott-impulse": 6,
  "elliott-triangle": 6,
  "elliott-triple-combo": 6,
};

export const LINE_STYLE_DASH = {
  0: [],
  1: [2, 3],
  2: [6, 4],
};

/** @param {string} type */
export function isFreehandTool(type) {
  return FREEHAND_TOOLS.has(type);
}

/** @param {string} type */
export function isMultiPointTool(type) {
  return MULTI_POINT_TOOLS.has(type);
}

/** @param {string} type */
export function isTrendAngleTool(type) {
  return TREND_ANGLE_TOOLS.has(type);
}

/** @param {string} type */
export function pointCountForTool(type) {
  if (isMultiPointTool(type)) return Number.POSITIVE_INFINITY;
  if (TOOL_POINT_COUNTS[type] != null) return TOOL_POINT_COUNTS[type];
  if (isTrendAngleTool(type)) return 2;
  if (isOnePointTool(type)) return 1;
  if (isTwoPointTool(type)) return 2;
  if (THREE_POINT_TOOLS.has(type)) return 3;
  if (FOUR_POINT_TOOLS.has(type)) return 4;
  return 2;
}

/** @param {string} type */
export function isCursorTool(type) {
  return CURSOR_TOOLS.has(type);
}

/** @param {string} type */
export function isPositionTool(type) {
  return POSITION_TOOLS.has(type);
}

/** @param {string} type */
export function isOnePointTool(type) {
  return ONE_POINT_TOOLS.has(type) || POSITION_TOOLS.has(type);
}

/** @param {string} type */
export function isTwoPointTool(type) {
  return TWO_POINT_TOOLS.has(type);
}

/** @param {string} type */
export function isSupportedDrawTool(type) {
  return SUPPORTED_DRAW_TOOLS.has(type);
}

/**
 * @param {string} type
 * @returns {"one" | "two" | "segment"}
 */
export function getToolPointMode(type) {
  if (isOnePointTool(type)) return "one";
  if (isTwoPointTool(type)) return "two";
  return "segment";
}
