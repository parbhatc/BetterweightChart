/** @param {import("../../types.js").UserDrawing} drawing */
export function resolveExtendFlags(drawing) {
  if (drawing.type === "extended-line") {
    return {
      extendLeft: drawing.extendLeft !== false,
      extendRight: drawing.extendRight !== false,
    };
  }
  if (drawing.type === "ray") {
    return {
      extendLeft: Boolean(drawing.extendLeft),
      extendRight: drawing.extendRight !== false,
    };
  }
  if (drawing.type === "info-line") {
    const legacy =
      !drawing.statsFields && drawing.extendLeft === false && drawing.extendRight === false;
    if (legacy) {
      return { extendLeft: true, extendRight: true };
    }
    return {
      extendLeft: Boolean(drawing.extendLeft),
      extendRight: Boolean(drawing.extendRight),
    };
  }
  return {
    extendLeft: Boolean(drawing.extendLeft),
    extendRight: Boolean(drawing.extendRight),
  };
}

/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ extendLeft: boolean, extendRight: boolean }} extend
 * @param {number} leftX
 * @param {number} rightX
 * @param {number} bottom
 */
export function extendedSegmentEndpoints(a, b, extend, leftX, rightX, bottom) {
  let x1 = a.x;
  let y1 = a.y;
  let x2 = b.x;
  let y2 = b.y;
  const { extendLeft, extendRight } = extend;
  if (!extendLeft && !extendRight) return { x1, y1, x2, y2 };

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.001) {
    if (extendLeft) y1 = 0;
    if (extendRight) y2 = bottom;
    return { x1, y1, x2, y2 };
  }
  if (extendLeft) {
    const t = (leftX - a.x) / dx;
    x1 = leftX;
    y1 = a.y + dy * t;
  }
  if (extendRight) {
    const t = (rightX - a.x) / dx;
    x2 = rightX;
    y2 = a.y + dy * t;
  }
  return { x1, y1, x2, y2 };
}

/** @param {boolean} extendLeft @param {boolean} extendRight */
export function extendSummaryLabel(extendLeft, extendRight) {
  if (!extendLeft && !extendRight) return "Don't extend";
  if (extendLeft && extendRight) return "Extend left and right";
  if (extendLeft) return "Extend left line";
  return "Extend right line";
}

/** @param {string} drawingType */
export function supportsExtendSettings(drawingType) {
  return (
    drawingType === "trend-line" ||
    drawingType === "ray" ||
    drawingType === "info-line" ||
    drawingType === "extended-line" ||
    drawingType === "parallel-channel" ||
    drawingType === "flat-top-bottom" ||
    drawingType === "disjoint-channel" ||
    drawingType === "fib-retracement" ||
    drawingType === "fib-extension" ||
    drawingType === "fib-channel" ||
    drawingType === "rectangle" ||
    drawingType === "curve" ||
    drawingType === "double-curve"
  );
}
