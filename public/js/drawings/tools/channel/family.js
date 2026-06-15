import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { FLAT_TOP_BOTTOM_COLOR, isFlatTopBottomTool, renderFlatTopBottomDrawing } from "./flatTopBottom.js";
import { isDisjointChannelTool, renderDisjointChannelDrawing } from "./disjoint.js";

export {
  isFlatTopBottomTool,
  renderFlatTopBottomDrawing,
  isDisjointChannelTool,
  renderDisjointChannelDrawing,
};

export const CHANNEL_BACKGROUND_TOOL_TYPES = [
  "parallel-channel",
  "flat-top-bottom",
  "disjoint-channel",
];

export const CHANNEL_LINE_DEFAULTS = {
  extendLeft: false,
  extendRight: false,
  showChannelBackground: true,
  channelBackgroundColor: FLAT_TOP_BOTTOM_COLOR,
  channelBackgroundOpacity: 20,
  showPriceLabels: false,
  leftEnd: "normal",
  rightEnd: "normal",
};

/** @param {string} drawingType */
export function isChannelBackgroundTool(drawingType) {
  return CHANNEL_BACKGROUND_TOOL_TYPES.includes(drawingType);
}

/** @param {string} drawingType */
export function supportsChannelLineStyleSettings(drawingType) {
  return isFlatTopBottomTool(drawingType) || isDisjointChannelTool(drawingType);
}

/** @param {string} drawingType */
export function channelLineDefaultsForType(drawingType) {
  if (isFlatTopBottomTool(drawingType)) {
    return {
      ...CHANNEL_LINE_DEFAULTS,
      color: FLAT_TOP_BOTTOM_COLOR,
      channelBackgroundColor: FLAT_TOP_BOTTOM_COLOR,
    };
  }
  return { ...CHANNEL_LINE_DEFAULTS, color: DEFAULT_DRAWING_COLOR };
}
