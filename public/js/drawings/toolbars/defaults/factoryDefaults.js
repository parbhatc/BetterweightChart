import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { getDrawingExtendDefaults } from "../../controller/factory/index.js";
import { isFlatTopBottomTool, FLAT_TOP_BOTTOM_COLOR } from "../../tools/channel/flatTopBottom.js";
import { annotationDefaultsForType } from "../../tools/annotation/style.js";
import { shapeDefaultsForType } from "../../tools/shape/index.js";
import { getSavableToolKeys } from "./store.js";

/**
 * Out-of-box style defaults for a tool (no saved templates, layout scope, or global tool defaults).
 * @param {string} toolType
 */
export function factoryDrawingDefaults(toolType) {
  const extend = getDrawingExtendDefaults(toolType);
  const annotationDefaults = annotationDefaultsForType(toolType);
  const shapeDefaults = shapeDefaultsForType(toolType);
  const defaultColor = isFlatTopBottomTool(toolType)
    ? FLAT_TOP_BOTTOM_COLOR
    : (annotationDefaults.color ?? shapeDefaults.color ?? DEFAULT_DRAWING_COLOR);
  const colorOpacity = annotationDefaults.colorOpacity ?? shapeDefaults.colorOpacity ?? 100;
  /** @type {Record<string, unknown>} */
  const base = {
    color: defaultColor,
    colorOpacity,
    textColor: defaultColor,
    textColorOpacity: colorOpacity,
    lineWidth: annotationDefaults.lineWidth ?? shapeDefaults.lineWidth ?? 2,
    lineStyle: 0,
  };
  const merged = { ...extend, ...base };
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of getSavableToolKeys(toolType)) {
    if (merged[key] !== undefined) out[key] = merged[key];
  }
  return out;
}
