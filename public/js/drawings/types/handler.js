/**
 * @typedef {object} DrawingTypeHandler
 * @property {string[]} types
 * @property {(ctx: CanvasRenderingContext2D, drawing: import("../types.js").UserDrawing, timeToX: (t: number) => number | null, priceToY: (p: number) => number | null, right: number, state?: object) => void} [render]
 * @property {(drawing: import("../types.js").UserDrawing, px: number, py: number, threshold: number, timeToX: (t: number) => number | null, priceToY: (p: number) => number | null) => boolean} [hit]
 * @property {(drawing: import("../types.js").UserDrawing, px: number, py: number, timeToX: (t: number) => number | null, priceToY: (p: number) => number | null, state?: object) => boolean} [hitStats]
 * @property {(drawing: import("../types.js").UserDrawing) => import("../types.js").UserDrawing} [finalize]
 * @property {(anchorIndex: number, startAnchors: import("../types.js").DrawPoint[], point: import("../types.js").DrawPoint, drawing: import("../types.js").UserDrawing, precision?: number) => { points: import("../types.js").DrawPoint[], positionEntryPrice?: number }} [dragUpdate]
 * @property {(drawing: import("../types.js").UserDrawing) => import("../types.js").DrawPoint[]} [anchorPoints]
 * @property {(drawing: import("../types.js").UserDrawing, state?: object) => { id: string, price: number, color: string }[]} [priceAxisLabels]
 * @property {(type: string, entry: { time: number, price: number }, ctx?: object) => { points: import("../types.js").DrawPoint[], positionEntryPrice: number }} [buildOneClick]
 */

export {};
