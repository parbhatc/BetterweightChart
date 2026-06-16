import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { loadLayoutScopedToolDefaults } from "./layoutScope.js";
import { isAxisLineTool } from "../../tools/axis/lines.js";
import { isTrendLineFamilyType } from "../../tools/line/trendStats.js";
import { isParallelChannelTool } from "../../tools/channel/parallel.js";
import { FLAT_TOP_BOTTOM_COLOR, isFlatTopBottomTool } from "../../tools/channel/flatTopBottom.js";
import { isRegressionTrendTool } from "../../tools/regression/trend.js";
import { isFibRetracementTool } from "../../tools/fib/retracement.js";
import { isGannTool } from "../../tools/gann/index.js";
import { isPatternTool } from "../../tools/pattern/index.js";
import { isCycleTool } from "../../tools/cycle/index.js";
import { isPositionTool } from "../../tools/position/barrel.js";
import { supportsChannelLineStyleSettings } from "../../tools/channel/family.js";
import { annotationDefaultsForType, isBrushTool } from "../../tools/annotation/style.js";
import {
  isRectangleTool,
  isRotatedRectangleTool,
  isCircleShapeTool,
  isPathTool,
  isPolylineTool,
  isEllipseTool,
  isTriangleTool,
  isArcTool,
  isCurveTool,
  shapeDefaultsForType,
} from "../../tools/shape/index.js";

export const TOOL_DEFAULTS_KEY = "tv-draw-tool-defaults";

const STYLE_KEYS = [
  "color",
  "colorOpacity",
  "textColor",
  "textColorOpacity",
  "lineWidth",
  "lineStyle",
];

const TREND_LINE_OPTION_KEYS = [
  "extendLeft",
  "extendRight",
  "leftEnd",
  "rightEnd",
  "showMiddlePoint",
  "showPriceLabels",
  "statsFields",
  "statsPosition",
  "alwaysShowStats",
];

const AXIS_LINE_OPTION_KEYS = ["showPriceLabels", "showTimeLabel"];

const PARALLEL_CHANNEL_OPTION_KEYS = [
  "extendLeft",
  "extendRight",
  "channelLevels",
  "showChannelBackground",
  "channelBackgroundColor",
  "channelBackgroundOpacity",
];

const CHANNEL_LINE_OPTION_KEYS = [
  "extendLeft",
  "extendRight",
  "leftEnd",
  "rightEnd",
  "showPriceLabels",
  "showChannelBackground",
  "channelBackgroundColor",
  "channelBackgroundOpacity",
];

const REGRESSION_TREND_OPTION_KEYS = [
  "regressionUpperDeviation",
  "regressionLowerDeviation",
  "regressionUseUpperDeviation",
  "regressionUseLowerDeviation",
  "regressionSource",
  "regressionBaseEnabled",
  "regressionBaseColor",
  "regressionBaseOpacity",
  "regressionBaseWidth",
  "regressionBaseStyle",
  "regressionUpEnabled",
  "regressionUpColor",
  "regressionUpOpacity",
  "regressionUpWidth",
  "regressionUpStyle",
  "regressionDownEnabled",
  "regressionDownColor",
  "regressionDownOpacity",
  "regressionDownWidth",
  "regressionDownStyle",
  "regressionExtendLines",
  "regressionShowPearsons",
  "regressionUpperFillOpacity",
  "regressionLowerFillOpacity",
];

const FIB_RETRACEMENT_OPTION_KEYS = [
  "extendLeft",
  "extendRight",
  "showFibTrendLine",
  "fibTrendLineColor",
  "fibTrendLineWidth",
  "fibTrendLineStyle",
  "fibTrendLineOpacity",
  "fibLevels",
  "fibLevelsLineWidth",
  "fibLevelsLineStyle",
  "fibUseOneColor",
  "showFibBackground",
  "fibBackgroundColor",
  "fibBackgroundOpacity",
  "fibReverse",
  "showFibPrices",
  "showFibLevelLabels",
  "fibLabelAlignH",
  "fibLabelAlignV",
  "fibLevelsDisplayMode",
];

const GANN_OPTION_KEYS = [
  "gannPriceLevels",
  "gannTimeLevels",
  "gannLevels",
  "gannFanLevels",
  "gannFanLineLevels",
  "gannArcLevels",
  "gannUseOneColor",
  "showGannBackground",
  "gannBackgroundColor",
  "gannBackgroundOpacity",
  "gannReverse",
  "showGannAngles",
  "gannAnglesColor",
  "gannAnglesOpacity",
  "showGannLeftLabels",
  "showGannRightLabels",
  "showGannTopLabels",
  "showGannBottomLabels",
  "showGannLabels",
  "showGannRangesText",
  "gannLineWidth",
  "scaleRatio",
  "fontSize",
];

const PATTERN_OPTION_KEYS = [
  "showPatternWave",
  "showPatternBackground",
  "patternBackgroundColor",
  "patternBackgroundOpacity",
  "showPatternRatios",
  "patternLabelBold",
  "patternLabelItalic",
  "elliottDegree",
  "fontSize",
];

const CYCLE_OPTION_KEYS = [
  "showCycleBackground",
  "cycleBackgroundColor",
  "cycleBackgroundOpacity",
];

const POSITION_OPTION_KEYS = [
  "showPriceLabels",
  "statsFields",
  "statsPosition",
  "alwaysShowStats",
  "profitColor",
  "stopColor",
  "fontSize",
  "positionQty",
  "positionDurationSec",
  "positionAccountSize",
  "positionLotSize",
  "positionRisk",
  "positionRiskUnit",
  "positionLeverage",
  "positionQtyPrecision",
];

const BRUSH_OPTION_KEYS = [
  "leftEnd",
  "rightEnd",
  "showBrushBackground",
  "brushBackgroundColor",
  "brushBackgroundOpacity",
];

const RECTANGLE_OPTION_KEYS = [
  "extendLeft",
  "extendRight",
  "showShapeBackground",
  "shapeBackgroundColor",
  "shapeBackgroundOpacity",
  "showRectangleMiddleLine",
  "middleLineColor",
  "middleLineWidth",
  "middleLineStyle",
  "middleLineOpacity",
];

const SHAPE_FILL_OPTION_KEYS = [
  "showShapeBackground",
  "shapeBackgroundColor",
  "shapeBackgroundOpacity",
];

const PATH_OPTION_KEYS = ["leftEnd", "rightEnd"];

const CURVE_OPTION_KEYS = [
  "extendLeft",
  "extendRight",
  "leftEnd",
  "rightEnd",
  "showShapeBackground",
  "shapeBackgroundColor",
  "shapeBackgroundOpacity",
];

/** @param {string} toolType */
export function getSavableToolKeys(toolType) {
  const keys = [...STYLE_KEYS];
  if (isTrendLineFamilyType(toolType)) keys.push(...TREND_LINE_OPTION_KEYS);
  else if (isAxisLineTool(toolType)) keys.push(...AXIS_LINE_OPTION_KEYS);
  else if (isParallelChannelTool(toolType)) keys.push(...PARALLEL_CHANNEL_OPTION_KEYS);
  else if (isFibRetracementTool(toolType)) keys.push(...FIB_RETRACEMENT_OPTION_KEYS);
  else if (isGannTool(toolType)) keys.push(...GANN_OPTION_KEYS);
  else if (isPatternTool(toolType)) keys.push(...PATTERN_OPTION_KEYS);
  else if (isCycleTool(toolType)) keys.push(...CYCLE_OPTION_KEYS);
  else if (isPositionTool(toolType)) keys.push(...POSITION_OPTION_KEYS);
  else if (supportsChannelLineStyleSettings(toolType)) keys.push(...CHANNEL_LINE_OPTION_KEYS);
  else if (isRegressionTrendTool(toolType)) keys.push(...REGRESSION_TREND_OPTION_KEYS);
  else if (isBrushTool(toolType)) keys.push(...BRUSH_OPTION_KEYS);
  else if (isRectangleTool(toolType)) keys.push(...RECTANGLE_OPTION_KEYS);
  else if (
    isRotatedRectangleTool(toolType) ||
    isCircleShapeTool(toolType) ||
    isPolylineTool(toolType) ||
    isEllipseTool(toolType) ||
    isTriangleTool(toolType) ||
    isArcTool(toolType)
  ) {
    keys.push(...SHAPE_FILL_OPTION_KEYS);
  } else if (isPathTool(toolType)) keys.push(...PATH_OPTION_KEYS);
  else if (isCurveTool(toolType)) keys.push(...CURVE_OPTION_KEYS);
  return keys;
}

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
  const keys = getSavableToolKeys(toolType);
  const all = loadAllToolDefaults();
  const prev = all[toolType] && typeof all[toolType] === "object" ? all[toolType] : {};
  const next = { ...prev };
  for (const key of keys) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  all[toolType] = next;
  localStorage.setItem(TOOL_DEFAULTS_KEY, JSON.stringify(all));
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function extractToolDefaults(drawing) {
  const keys = getSavableToolKeys(drawing.type);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of keys) {
    if (drawing[key] !== undefined) out[key] = drawing[key];
  }
  return out;
}

/** @deprecated use extractToolDefaults */
export function extractStyleDefaults(drawing) {
  return extractToolDefaults(drawing);
}

/** @param {Record<string, unknown>} patch @param {string} [toolType] */
export function isToolDefaultsPatch(patch, toolType) {
  const keys = toolType
    ? getSavableToolKeys(toolType)
    : [
        ...STYLE_KEYS,
        ...TREND_LINE_OPTION_KEYS,
        ...AXIS_LINE_OPTION_KEYS,
        ...PARALLEL_CHANNEL_OPTION_KEYS,
        ...CHANNEL_LINE_OPTION_KEYS,
        ...FIB_RETRACEMENT_OPTION_KEYS,
        ...GANN_OPTION_KEYS,
        ...PATTERN_OPTION_KEYS,
        ...CYCLE_OPTION_KEYS,
        ...REGRESSION_TREND_OPTION_KEYS,
      ];
  return Object.keys(patch).some((key) => keys.includes(key));
}

/** @deprecated use isToolDefaultsPatch */
export function isStylePatch(patch) {
  return STYLE_KEYS.some((key) => patch[key] !== undefined);
}

/**
 * Saved + base style defaults for a new drawing (type-specific overrides applied separately).
 * @param {string} toolType
 */
export function newDrawingDefaults(toolType) {
  const saved = { ...loadToolDefaults(toolType), ...loadLayoutScopedToolDefaults(toolType) };
  const annotationDefaults = annotationDefaultsForType(toolType);
  const shapeDefaults = shapeDefaultsForType(toolType);
  const defaultColor = isFlatTopBottomTool(toolType)
    ? FLAT_TOP_BOTTOM_COLOR
    : (annotationDefaults.color ?? shapeDefaults.color ?? DEFAULT_DRAWING_COLOR);
  const color = saved.color ?? defaultColor;
  const colorOpacity = saved.colorOpacity ?? annotationDefaults.colorOpacity ?? shapeDefaults.colorOpacity ?? 100;
  /** @type {Record<string, unknown>} */
  const out = {
    color,
    colorOpacity,
    textColor: saved.textColor ?? color,
    textColorOpacity: saved.textColorOpacity ?? colorOpacity,
    lineWidth: saved.lineWidth ?? annotationDefaults.lineWidth ?? shapeDefaults.lineWidth ?? 2,
    lineStyle: saved.lineStyle ?? 0,
  };
  for (const key of getSavableToolKeys(toolType)) {
    if (STYLE_KEYS.includes(key)) continue;
    if (saved[key] !== undefined) out[key] = saved[key];
  }
  return out;
}

/** @deprecated use newDrawingDefaults */
export function newDrawingStyleDefaults(toolType) {
  return newDrawingDefaults(toolType);
}
