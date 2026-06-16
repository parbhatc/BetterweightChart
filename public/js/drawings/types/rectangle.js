/**
 * Rectangle drawing type — thin facade over shape geometry.
 * Follow this pattern when adding new two-point shape tools.
 */

import { hitRectArea, hitRectBorder } from "../tools/annotation/hitTest.js";
import { RECTANGLE_DEFAULTS, renderRectangleShape } from "../tools/shape/index.js";

export const RECTANGLE_TYPE = "rectangle";
export const RECTANGLE_DEFAULTS_EXPORT = RECTANGLE_DEFAULTS;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../types.js").UserDrawing} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 */
export function renderRectangle(ctx, drawing, pts, right) {
  renderRectangleShape(ctx, drawing, pts, right);
}

/**
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function hitRectangle(px, py, threshold, a, b) {
  return hitRectArea(a, b, px, py, 2) || hitRectBorder(a, b, px, py, threshold);
}

/** @type {import("./handler.js").DrawingTypeHandler} */
export const rectangleDrawingType = {
  types: [RECTANGLE_TYPE],
  render(ctx, drawing, timeToX, priceToY, right) {
    const pts = drawing.points
      .map((p) => {
        const x = timeToX(p.time);
        const y = priceToY(p.price);
        return x != null && y != null ? { x, y } : null;
      })
      .filter(Boolean);
    if (pts.length >= 2) renderRectangle(ctx, drawing, pts, right);
  },
  hit(drawing, px, py, threshold, timeToX, priceToY) {
    const p0 = drawing.points[0];
    const p1 = drawing.points[1];
    if (!p0 || !p1) return false;
    const ax = timeToX(p0.time);
    const ay = priceToY(p0.price);
    const bx = timeToX(p1.time);
    const by = priceToY(p1.price);
    if (ax == null || ay == null || bx == null || by == null) return false;
    return hitRectangle(px, py, threshold, { x: ax, y: ay }, { x: bx, y: by });
  },
};
