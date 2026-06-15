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
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {string} profitColor
 * @param {string} lossColor
 * @param {boolean} isLong
 */
function drawRiskReward(ctx, a, b, profitColor, lossColor, isLong) {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const entry = a.y;
  const exit = b.y;
  const top = Math.min(entry, exit);
  const bot = Math.max(entry, exit);
  const mid = (entry + exit) / 2;

  ctx.save();
  ctx.fillStyle = isLong ? profitColor : lossColor;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(x1, isLong ? top : mid, x2 - x1, isLong ? mid - top : bot - mid);
  ctx.fillStyle = isLong ? lossColor : profitColor;
  ctx.fillRect(x1, isLong ? mid : top, x2 - x1, isLong ? bot - mid : mid - top);
  ctx.globalAlpha = 1;
  ctx.strokeRect(x1, top, x2 - x1, bot - top);
  ctx.beginPath();
  ctx.moveTo(x1, entry);
  ctx.lineTo(x2, entry);
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 * @param {number} bottom
 */
export function renderForecastDrawing(ctx, drawing, pts, right, bottom) {
  const a = pts[0];
  const b = pts[1];
  if (!a) return;

  const profit = "rgba(38, 166, 154, 0.35)";
  const loss = "rgba(242, 54, 69, 0.35)";

  switch (drawing.type) {
    case "long-position":
      if (b) drawRiskReward(ctx, a, b, profit, loss, true);
      break;
    case "short-position":
      if (b) drawRiskReward(ctx, a, b, profit, loss, false);
      break;
    case "position-forecast":
      if (b) {
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "bars-pattern":
      if (b) {
        const n = 5;
        const dx = (b.x - a.x) / n;
        const h = (a.y - b.y) / 3;
        for (let i = 0; i < n; i += 1) {
          const x = a.x + dx * i + dx * 0.2;
          const w = dx * 0.6;
          const up = i % 2 === 0;
          const y0 = up ? a.y : a.y - h;
          const y1 = up ? a.y - h * (1 + (i % 3) * 0.3) : a.y;
          ctx.fillRect(x, Math.min(y0, y1), w, Math.abs(y1 - y0) || 2);
        }
      }
      break;
    case "ghost-feed":
      if (b) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        const n = 4;
        for (let i = 0; i < n; i += 1) {
          const t = i / (n - 1);
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const h = 8 + i * 4;
          ctx.fillRect(x - 2, y - h, 4, h);
          ctx.fillRect(x - 2, y, 4, h * 0.6);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      break;
    case "sector":
    case "projection":
      if (b) {
        const x1 = Math.min(a.x, b.x);
        const y1 = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.save();
        ctx.globalAlpha *= 0.12;
        ctx.fillRect(x1, y1, w, h);
        ctx.globalAlpha /= 0.12;
        ctx.strokeRect(x1, y1, w, h);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
      break;
    case "anchored-vwap":
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(right, a.y);
      ctx.stroke();
      break;
    case "fixed-range-volume-profile":
    case "anchored-volume-profile":
      if (b) {
        const x1 = Math.min(a.x, b.x);
        const y1 = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.strokeRect(x1, y1, w, h);
        const rows = 6;
        for (let i = 0; i < rows; i += 1) {
          const barW = (w * (0.3 + (i % 3) * 0.2)) / 2;
          const y = y1 + (h * i) / rows + h / rows / 4;
          ctx.fillRect(x1, y, barW, h / rows / 2);
          ctx.fillRect(x1 + w - barW, y, barW, h / rows / 2);
        }
      }
      break;
    default:
      if (b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
  }
}

/** @param {string} type */
export function isForecastDrawingType(type) {
  return (
    type === "long-position" ||
    type === "short-position" ||
    type === "position-forecast" ||
    type === "bars-pattern" ||
    type === "ghost-feed" ||
    type === "sector" ||
    type === "projection" ||
    type === "anchored-vwap" ||
    type === "fixed-range-volume-profile" ||
    type === "anchored-volume-profile"
  );
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 */
export function hitForecastDrawing(type, pts, px, py, threshold) {
  const a = pts[0];
  const b = pts[1];
  if (!a) return false;

  if (
    type === "long-position" ||
    type === "short-position" ||
    type === "sector" ||
    type === "projection" ||
    type === "fixed-range-volume-profile" ||
    type === "anchored-volume-profile"
  ) {
    if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
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

  if (!b) return Math.hypot(px - a.x, py - a.y) <= threshold;
  return distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold;
}
