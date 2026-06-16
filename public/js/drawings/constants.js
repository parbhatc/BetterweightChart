/** CSS selector for drawing UI that should not pass chart pointer events through. */
export const DRAWING_UI_SELECTOR =
  ".drawing-toolbar, .draw-tools, .draw-tools__flyout, .tv-floating-toolbar, .tv-drawing-edit-toolbar";

export const DEFAULT_DRAWING_COLOR = "#2962FF";
export const ANCHOR_BORDER_COLOR = "#2962FF";
export const ANCHOR_FILL_COLOR = "#000000";
/** Visual radius of endpoint anchor circles (TradingView-style). */
export const ANCHOR_RADIUS = 6;
export const ANCHOR_BORDER_WIDTH = 2;
export const DRAWING_HIT_THRESHOLD = 10;
export const ANCHOR_HIT_PADDING = 5;
/** Extra hit slop for touch devices when dragging endpoint anchors. */
export const ANCHOR_HIT_PADDING_COARSE = 14;
export const VALUES_TOOLTIP_LONG_PRESS_MS = 500;
export const VALUES_TOOLTIP_MOVE_THRESHOLD = 6;
export const DRAWING_DRAG_ACTIVATION_PX = 3;
