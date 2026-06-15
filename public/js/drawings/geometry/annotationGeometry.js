export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function drawPolyline(ctx, pts, close = false) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

export function labelText(drawing, fallback = "") {
  const raw = drawing.label;
  if (raw != null && String(raw).trim()) return String(raw);
  return fallback;
}

export function drawLabelAt(ctx, drawing, x, y, fallback = "") {
  const text = labelText(drawing, fallback);
  if (!text) return;
  const fontSize = drawing.fontSize ?? 12;
  ctx.save();
  ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
  ctx.fillStyle = drawing.textColor ?? ctx.fillStyle;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(text, x + 4, y + 4);
  ctx.restore();
}

export function rectFromTwoPoints(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function strokeRectFromTwoPoints(ctx, a, b) {
  const { x, y, w, h } = rectFromTwoPoints(a, b);
  ctx.strokeRect(x, y, w, h);
}

export function drawArrowHead(ctx, from, to, size = 8) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x + Math.cos(a1) * size, to.y + Math.sin(a1) * size);
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x + Math.cos(a2) * size, to.y + Math.sin(a2) * size);
  ctx.stroke();
}

export function drawDirectionArrow(ctx, p, up) {
  const s = 10;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(p.x, p.y - s);
    ctx.lineTo(p.x - s * 0.65, p.y + s * 0.55);
    ctx.lineTo(p.x + s * 0.65, p.y + s * 0.55);
  } else {
    ctx.moveTo(p.x, p.y + s);
    ctx.lineTo(p.x - s * 0.65, p.y - s * 0.55);
    ctx.lineTo(p.x + s * 0.65, p.y - s * 0.55);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawMarkerArrow(ctx, p) {
  const s = 9;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - s);
  ctx.lineTo(p.x + s * 0.55, p.y);
  ctx.lineTo(p.x, p.y + s * 0.35);
  ctx.lineTo(p.x - s * 0.55, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawParallelogram(ctx, p0, p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const p3 = { x: p0.x + dx, y: p0.y + dy };
  drawPolyline(ctx, [p0, p1, p2, p3], true);
}

export function drawEllipseFromBox(ctx, a, b, forceCircle = false) {
  const { x, y, w, h } = rectFromTwoPoints(a, b);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = forceCircle ? Math.min(w, h) / 2 : w / 2;
  const ry = forceCircle ? Math.min(w, h) / 2 : h / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function arcThroughThreePoints(ctx, p0, p1, p2) {
  const ax = p0.x;
  const ay = p0.y;
  const bx = p1.x;
  const by = p1.y;
  const cx = p2.x;
  const cy = p2.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) {
    drawPolyline(ctx, [p0, p1, p2]);
    return;
  }
  const ux =
    ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const a0 = Math.atan2(ay - uy, ax - ux);
  const a1 = Math.atan2(by - uy, bx - ux);
  const am = Math.atan2(cy - uy, cx - ux);
  let start = a0;
  let end = a1;
  const norm = (a) => {
    let v = a;
    while (v < 0) v += Math.PI * 2;
    while (v >= Math.PI * 2) v -= Math.PI * 2;
    return v;
  };
  const s = norm(start);
  const e = norm(end);
  const m = norm(am);
  const ccw = s < e ? m < s || m > e : m > e && m < s;
  ctx.beginPath();
  ctx.arc(ux, uy, r, start, end, ccw);
  ctx.stroke();
}

export function sampleCurve(fn, steps = 24) {
  /** @type {{ x: number, y: number }[]} */
  const pts = [];
  for (let i = 0; i <= steps; i += 1) pts.push(fn(i / steps));
  return pts;
}

export function drawSpeechBubble(ctx, a, b, rounded = false) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(Math.abs(b.x - a.x), 48);
  const h = Math.max(Math.abs(b.y - a.y), 28);
  const tailX = a.x;
  const tailY = a.y;
  const r = rounded ? 8 : 2;
  ctx.beginPath();
  if (rounded) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x + w * 0.2, y + h);
  ctx.lineTo(x + w * 0.35, y + h);
  ctx.stroke();
}

export function drawTableGrid(ctx, a, b, rows = 3, cols = 3) {
  const { x, y, w, h } = rectFromTwoPoints(a, b);
  ctx.strokeRect(x, y, w, h);
  for (let c = 1; c < cols; c += 1) {
    const gx = x + (w * c) / cols;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r += 1) {
    const gy = y + (h * r) / rows;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }
}

export function drawPin(ctx, p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y - 6, 6, Math.PI, 0);
  ctx.lineTo(p.x, p.y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawFlag(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 14);
  ctx.lineTo(p.x, p.y + 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 14);
  ctx.lineTo(p.x + 16, p.y - 8);
  ctx.lineTo(p.x, p.y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawSignpost(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 4);
  ctx.lineTo(p.x, p.y + 14);
  ctx.stroke();
  ctx.strokeRect(p.x - 14, p.y - 16, 28, 12);
}

export function drawPostX(ctx, p) {
  const s = 8;
  ctx.beginPath();
  ctx.moveTo(p.x - s, p.y - s);
  ctx.lineTo(p.x + s, p.y + s);
  ctx.moveTo(p.x + s, p.y - s);
  ctx.lineTo(p.x - s, p.y + s);
  ctx.stroke();
}

export function drawIdeaBulb(ctx, p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y - 2, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - 4, p.y + 8);
  ctx.lineTo(p.x + 4, p.y + 8);
  ctx.stroke();
}

export function drawImagePlaceholder(ctx, a, b) {
  const { x, y, w, h } = rectFromTwoPoints(a, b);
  ctx.save();
  ctx.globalAlpha *= 0.08;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha /= 0.08;
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.restore();
  ctx.font = "600 10px system-ui,sans-serif";
  ctx.fillText("IMG", x + w / 2 - 10, y + h / 2 - 5);
}
