/**
 * Long/short position drawing type — modular handler for render, hit-test, drag, and finalize.
 * @typedef {import("../handler.js").DrawingTypeHandler} DrawingTypeHandler
 */

export * from "./constants.js";
export * from "./geometry.js";
export * from "./placement.js";
export * from "./quantity.js";
export * from "./stats.js";
export * from "./finalize.js";
export * from "./render.js";
export * from "./interaction.js";

import { POSITION_TOOL_TYPES } from "./constants.js";
import { positionAnchorPoints } from "./geometry.js";
import { finalizePositionDrawing } from "./finalize.js";
import { positionPriceAxisLabels, renderPositionDrawing } from "./render.js";
import { hitPositionDrawing, hitPositionStatsBox, positionDragUpdate } from "./interaction.js";
import { buildOneClickPosition } from "./placement.js";

/** @type {DrawingTypeHandler} */
export const positionDrawingType = {
  types: [...POSITION_TOOL_TYPES],
  render: renderPositionDrawing,
  hit: hitPositionDrawing,
  hitStats: hitPositionStatsBox,
  finalize: finalizePositionDrawing,
  dragUpdate: positionDragUpdate,
  anchorPoints: positionAnchorPoints,
  priceAxisLabels: positionPriceAxisLabels,
  buildOneClick: buildOneClickPosition,
};
