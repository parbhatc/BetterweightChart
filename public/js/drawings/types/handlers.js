import { positionDrawingType } from "./position/index.js";
import { rectangleDrawingType } from "./rectangle.js";

/** @type {import("./handler.js").DrawingTypeHandler[]} */
const DRAWING_TYPE_HANDLERS = [positionDrawingType, rectangleDrawingType];

/** @type {Map<string, import("./handler.js").DrawingTypeHandler>} */
const handlerByType = new Map();
for (const handler of DRAWING_TYPE_HANDLERS) {
  for (const type of handler.types) {
    handlerByType.set(type, handler);
  }
}

/** @param {string} type */
export function getDrawingTypeHandler(type) {
  return handlerByType.get(type);
}

/** @param {string} type */
export function hasDrawingTypeHandler(type) {
  return handlerByType.has(type);
}

export { DRAWING_TYPE_HANDLERS };
