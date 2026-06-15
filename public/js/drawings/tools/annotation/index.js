export {
  distToSegment,
  drawPolyline,
  labelText,
  drawLabelAt,
  rectFromTwoPoints,
  strokeRectFromTwoPoints,
  drawArrowHead,
  drawDirectionArrow,
  drawMarkerArrow,
  drawParallelogram,
  drawEllipseFromBox,
  arcThroughThreePoints,
  sampleCurve,
  drawSpeechBubble,
  drawTableGrid,
  drawPin,
  drawFlag,
  drawSignpost,
  drawPostX,
  drawIdeaBulb,
  drawImagePlaceholder,
} from "./geometry.js";

export {
  hitPolyline,
  hitRectBorder,
  hitRectArea,
  hitEllipseBox,
  hitParallelogram,
  hitArcThreePoints,
  hitSampledCurve,
  hitPointMarker,
} from "./hitTest.js";

export { renderAnnotationDrawing } from "./render.js";

import { hitAnnotationDrawing as hitAnnotationDrawingCore } from "./hitTest.js";

/** @param {string} type */
export function isAnnotationDrawingType(type) {
  return (
    type === "brush" ||
    type === "highlighter" ||
    type === "arrow-marker" ||
    type === "line-arrow" ||
    type === "arrow-mark-up" ||
    type === "arrow-mark-down" ||
    type === "rectangle" ||
    type === "rotated-rectangle" ||
    type === "path" ||
    type === "polyline" ||
    type === "circle" ||
    type === "ellipse" ||
    type === "triangle" ||
    type === "arc" ||
    type === "curve" ||
    type === "double-curve" ||
    type === "text" ||
    type === "text-annotation" ||
    type === "note" ||
    type === "price-note" ||
    type === "pin" ||
    type === "table" ||
    type === "callout" ||
    type === "comment" ||
    type === "price-label" ||
    type === "signpost" ||
    type === "flag-mark" ||
    type === "image" ||
    type === "post" ||
    type === "idea"
  );
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {number} [_right]
 * @param {number} [_bottom]
 */
export function hitAnnotationDrawing(type, pts, px, py, threshold, _right, _bottom) {
  return hitAnnotationDrawingCore(type, pts, px, py, threshold);
}
