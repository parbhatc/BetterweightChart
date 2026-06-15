function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 * @param {number} bottom
 * @param {{ precision?: number }} state
 */
export function renderMeasureDrawing(ctx, drawing, pts, right, bottom, state = {}) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return;

  const precision = state.precision ?? 2;
  const fmt = (n) => Number(n).toFixed(precision);

  switch (drawing.type) {
    case "price-range": {
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      const x = a.x;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 6, y1);
      ctx.lineTo(x + 6, y1);
      ctx.moveTo(x - 6, y2);
      ctx.lineTo(x + 6, y2);
      ctx.stroke();
      ctx.font = "500 10px system-ui,sans-serif";
      const priceA = drawing.points[0]?.price ?? 0;
      const priceB = drawing.points[1]?.price ?? 0;
      ctx.fillText(fmt(Math.abs(priceB - priceA)), x + 8, (y1 + y2) / 2);
      break;
    }
    case "date-range": {
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      const y = a.y;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y - 6);
      ctx.lineTo(x1, y + 6);
      ctx.moveTo(x2, y - 6);
      ctx.lineTo(x2, y + 6);
      ctx.stroke();
      break;
    }
    case "date-price-range": {
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      ctx.save();
      ctx.globalAlpha *= 0.1;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha /= 0.1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.restore();
      ctx.font = "500 10px system-ui,sans-serif";
      const priceA = drawing.points[0]?.price ?? 0;
      const priceB = drawing.points[1]?.price ?? 0;
      ctx.fillText(fmt(Math.abs(priceB - priceA)), x2 + 4, (y1 + y2) / 2);
      break;
    }
    default:
      break;
  }
}

/** @param {string} type */
export function isMeasureDrawingType(type) {
  return type === "price-range" || type === "date-range" || type === "date-price-range";
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 */
export function hitMeasureDrawing(type, pts, px, py, threshold) {
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return false;

  if (type === "price-range") {
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    return Math.abs(px - a.x) <= threshold && py >= y1 - threshold && py <= y2 + threshold;
  }

  if (type === "date-range") {
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    return Math.abs(py - a.y) <= threshold && px >= x1 - threshold && px <= x2 + threshold;
  }

  const x1 = Math.min(a.x, b.x) - threshold;
  const x2 = Math.max(a.x, b.x) + threshold;
  const y1 = Math.min(a.y, b.y) - threshold;
  const y2 = Math.max(a.y, b.y) + threshold;
  return (
    distToSegment(px, py, x1, y1, x2, y1) <= threshold ||
    distToSegment(px, py, x2, y1, x2, y2) <= threshold ||
    distToSegment(px, py, x2, y2, x1, y2) <= threshold ||
    distToSegment(px, py, x1, y2, x1, y1) <= threshold
  );
}
