import { newDrawingDefaults } from "../../toolbars/defaults/store.js";
import { allStatsFieldsEnabled, defaultStatsFields } from "../../tools/line/trendStats.js";
import { AXIS_LINE_DEFAULTS } from "../../tools/axis/lines.js";
import { finalizeParallelChannelDrawing } from "../../tools/channel/parallel.js";
import { finalizeFlatTopBottomDrawing } from "../../tools/channel/flatTopBottom.js";
import { finalizeDisjointChannelDrawing } from "../../tools/channel/disjoint.js";
import { finalizeFibRetracementDrawing, isFibRetracementTool } from "../../tools/fib/retracement.js";
import { finalizeGannDrawing, isGannTool } from "../../tools/gann/index.js";
import { finalizePatternDrawing, isPatternTool } from "../../tools/pattern/index.js";
import { finalizeCycleDrawing, isCycleTool } from "../../tools/cycle/index.js";
import { normalizeRegressionDrawing } from "../../tools/regression/trend.js";
import {
  buildOneClickPosition,
  defaultPositionStatsFields,
  finalizePositionDrawing,
  isPositionTool,
  POSITION_INPUT_DEFAULTS,
} from "../../tools/position/barrel.js";
import { finalizeForecastDrawing, isForecastTool, FORECAST_STYLE_DEFAULTS } from "../../tools/forecast/index.js";
import { finalizeMeasureDrawing, isMeasureTool, MEASURE_STYLE_DEFAULTS } from "../../tools/measure/index.js";
import {
  finalizeAnnotationDrawing,
  supportsAnnotationStyleSettings,
  BRUSH_DEFAULTS,
  HIGHLIGHTER_DEFAULTS,
  ARROW_MARKER_DEFAULTS,
  ARROW_MARK_UP_DEFAULTS,
  ARROW_MARK_DOWN_DEFAULTS,
} from "../../tools/annotation/style.js";
import {
  finalizeShapeDrawing,
  supportsShapeStyleSettings,
  RECTANGLE_DEFAULTS,
  ROTATED_RECTANGLE_DEFAULTS,
  CIRCLE_DEFAULTS,
  PATH_DEFAULTS,
  POLYLINE_DEFAULTS,
  ELLIPSE_DEFAULTS,
  TRIANGLE_DEFAULTS,
  ARC_DEFAULTS,
  CURVE_DEFAULTS,
  DOUBLE_CURVE_DEFAULTS,
} from "../../tools/shape/index.js";

let idSeq = 1;

/** @param {Record<string, unknown>} [overrides] */
function trendLineStyleDefaults(overrides = {}) {
  return {
    leftEnd: "normal",
    rightEnd: "normal",
    showMiddlePoint: false,
    showPriceLabels: false,
    statsFields: defaultStatsFields(),
    statsPosition: "auto",
    alwaysShowStats: false,
    ...overrides,
  };
}

/** @type {Record<string, Record<string, unknown>>} */
const TREND_LINE_FAMILY_DEFAULTS = {
  "trend-line": trendLineStyleDefaults({ extendLeft: false, extendRight: false }),
  ray: trendLineStyleDefaults({ extendLeft: false, extendRight: true }),
  "info-line": trendLineStyleDefaults({
    extendLeft: true,
    extendRight: true,
    statsFields: allStatsFieldsEnabled(),
    statsPosition: "center",
    alwaysShowStats: true,
  }),
  "extended-line": trendLineStyleDefaults({ extendLeft: true, extendRight: true }),
  "trend-angle": trendLineStyleDefaults({ angle: 45 }),
  "long-position": {
    showPriceLabels: true,
    statsFields: defaultPositionStatsFields(),
    statsPosition: "center",
    alwaysShowStats: false,
    ...POSITION_INPUT_DEFAULTS,
  },
  "short-position": {
    showPriceLabels: true,
    statsFields: defaultPositionStatsFields(),
    statsPosition: "center",
    alwaysShowStats: false,
    ...POSITION_INPUT_DEFAULTS,
  },
  "position-forecast": { ...FORECAST_STYLE_DEFAULTS },
  "price-range": { ...MEASURE_STYLE_DEFAULTS },
  "date-range": { ...MEASURE_STYLE_DEFAULTS },
  "date-price-range": { ...MEASURE_STYLE_DEFAULTS },
  brush: { ...BRUSH_DEFAULTS },
  highlighter: { ...HIGHLIGHTER_DEFAULTS },
  "arrow-marker": { ...ARROW_MARKER_DEFAULTS },
  "arrow-mark-up": { ...ARROW_MARK_UP_DEFAULTS },
  "arrow-mark-down": { ...ARROW_MARK_DOWN_DEFAULTS },
  rectangle: { ...RECTANGLE_DEFAULTS },
  "rotated-rectangle": { ...ROTATED_RECTANGLE_DEFAULTS },
  circle: { ...CIRCLE_DEFAULTS },
  path: { ...PATH_DEFAULTS },
  polyline: { ...POLYLINE_DEFAULTS },
  ellipse: { ...ELLIPSE_DEFAULTS },
  triangle: { ...TRIANGLE_DEFAULTS },
  arc: { ...ARC_DEFAULTS },
  curve: { ...CURVE_DEFAULTS },
  "double-curve": { ...DOUBLE_CURVE_DEFAULTS },
};

/** @param {string} type @param {import("../types.js").DrawPoint[]} points */
export function newDrawing(type, points) {
  /** @type {Record<string, unknown>} */
  const extendDefaults =
    TREND_LINE_FAMILY_DEFAULTS[type] ??
    AXIS_LINE_DEFAULTS[type] ??
    (type === "text" || type === "text-annotation"
      ? { label: "Text" }
      : type === "note"
        ? { label: "Note" }
        : type === "callout" || type === "comment"
          ? { label: "Comment" }
          : {});
  const drawing = {
    id: `d${idSeq++}`,
    type,
    points,
    locked: false,
    ...extendDefaults,
    ...newDrawingDefaults(type),
  };
  if (type === "parallel-channel") return finalizeParallelChannelDrawing(drawing);
  if (type === "flat-top-bottom") return finalizeFlatTopBottomDrawing(drawing);
  if (type === "disjoint-channel") return finalizeDisjointChannelDrawing(drawing);
  if (isFibRetracementTool(type)) return finalizeFibRetracementDrawing(drawing);
  if (isGannTool(type)) return finalizeGannDrawing(drawing);
  if (isPatternTool(type)) return finalizePatternDrawing(drawing);
  if (isCycleTool(type)) return finalizeCycleDrawing(drawing);
  if (type === "regression-trend") return normalizeRegressionDrawing(drawing);
  if (isPositionTool(type)) return finalizePositionDrawing(drawing);
  if (isForecastTool(type)) return finalizeForecastDrawing(drawing);
  if (isMeasureTool(type)) return finalizeMeasureDrawing(drawing);
  if (supportsAnnotationStyleSettings(type)) return finalizeAnnotationDrawing(drawing);
  if (supportsShapeStyleSettings(type)) return finalizeShapeDrawing(drawing);
  return drawing;
}

const CLIPBOARD_PREFIX = "bwc-drawing:";

/**
 * Clone a drawing with a new id and optional time/price offset.
 * @param {import("../types.js").UserDrawing} drawing
 * @param {{ timeDelta?: number, priceDelta?: number }} [offsets]
 */
export function cloneDrawing(drawing, offsets = {}) {
  const timeDelta = offsets.timeDelta ?? 0;
  const priceDelta = offsets.priceDelta ?? 0;
  const points = drawing.points.map((p) => ({
    ...p,
    time: p.time + timeDelta,
    price: p.price + priceDelta,
  }));
  const dup = newDrawing(drawing.type, points);
  const styleKeys = Object.keys(drawing).filter(
    (k) => !["id", "type", "points", "locked"].includes(k),
  );
  for (const k of styleKeys) {
    if (drawing[k] !== undefined) dup[k] = drawing[k];
  }
  dup.locked = false;
  return dup;
}

export { CLIPBOARD_PREFIX };

/**
 * @param {"long-position" | "short-position"} type
 * @param {{ time: number, price: number }} entry
 * @param {{ bars?: { high?: number, low?: number, close?: number }[], barSec?: number }} [ctx]
 */
export function newPositionDrawing(type, entry, ctx = {}) {
  const built = buildOneClickPosition(type, entry, ctx);
  return finalizePositionDrawing({
    ...newDrawing(type, built.points),
    positionEntryPrice: built.positionEntryPrice,
  });
}
