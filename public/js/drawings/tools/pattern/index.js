import { applyColorOpacity } from "../../../ui/color/picker.js";
import { clipLineThroughPoints, strokeSegment } from "../line/math.js";
import { hitCycleDrawing, isCycleTool, renderCycleDrawing } from "../cycle/index.js";

const PATTERN_TYPE_DEFAULTS = {
  "xabcd-pattern": { color: "#2962FF", patternBackgroundColor: "#2962FF", showPatternBackground: true },
  "cypher-pattern": { color: "#2962FF", patternBackgroundColor: "#2962FF", showPatternBackground: true },
  "head-and-shoulders": { color: "#089981", patternBackgroundColor: "#089981", showPatternBackground: true },
  "triangle-pattern": { color: "#673AB7", patternBackgroundColor: "#673AB7", showPatternBackground: true },
  "abcd-pattern": { color: "#089981", showPatternBackground: false },
  "three-drives": { color: "#673AB7", showPatternBackground: false },
  "elliott-impulse": { color: "#3D85C6", showPatternBackground: false },
  "elliott-correction": { color: "#3D85C6", showPatternBackground: false },
  "elliott-triangle": { color: "#FF9800", showPatternBackground: false },
  "elliott-double-combo": { color: "#6AA84F", showPatternBackground: false },
  "elliott-triple-combo": { color: "#6AA84F", showPatternBackground: false },
};

const HARMONIC_PATTERN_TYPES = new Set([
  "xabcd-pattern",
  "cypher-pattern",
  "head-and-shoulders",
  "triangle-pattern",
  "abcd-pattern",
  "three-drives",
]);

const ELLIOTT_PATTERN_TYPES = new Set([
  "elliott-impulse",
  "elliott-correction",
  "elliott-triangle",
  "elliott-double-combo",
  "elliott-triple-combo",
]);

const PATTERN_LABELS = {
  "xabcd-pattern": ["X", "A", "B", "C", "D"],
  "cypher-pattern": ["X", "A", "B", "C", "D"],
  "abcd-pattern": ["A", "B", "C", "D"],
  "triangle-pattern": ["A", "B", "C", "D"],
  "head-and-shoulders": ["", "Left Shoulder", "", "Head", "", "Right Shoulder", ""],
  "three-drives": ["1", "2", "3", "4", "5", "6", "7"],
  "elliott-impulse": ["(0)", "(1)", "(2)", "(3)", "(4)", "(5)"],
  "elliott-correction": ["(0)", "A", "B", "C"],
  "elliott-triangle": ["(0)", "A", "B", "C", "D", "E"],
  "elliott-double-combo": ["W", "X", "Y", "Z"],
  "elliott-triple-combo": ["W", "X", "Y", "X", "Z", "End"],
};

export const ELLIOTT_DEGREE_OPTIONS = [
  { id: "supermillennium", label: "Supermillennium" },
  { id: "millennium", label: "Millennium" },
  { id: "submillennium", label: "Submillennium" },
  { id: "grand-supercycle", label: "Grand supercycle" },
  { id: "supercycle", label: "Supercycle" },
  { id: "cycle", label: "Cycle" },
  { id: "primary", label: "Primary" },
  { id: "intermediate", label: "Intermediate" },
  { id: "minor", label: "Minor" },
  { id: "minute", label: "Minute" },
  { id: "minuette", label: "Minuette" },
  { id: "subminuette", label: "Subminuette" },
  { id: "micro", label: "Micro" },
  { id: "submicro", label: "Submicro" },
  { id: "minuscule", label: "Minuscule" },
];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function legSize(a, b) {
  return Math.abs(b.y - a.y);
}

function fillRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, w, h);
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(2);
  if (abs >= 10) return value.toFixed(3);
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function midPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function drawPolyline(ctx, pts, close = false) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

function fillPolygon(ctx, pts) {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

function withDashed(ctx, fn) {
  const prev = ctx.getLineDash();
  ctx.setLineDash([4, 4]);
  fn();
  ctx.setLineDash(prev);
}

function drawDottedSegment(ctx, a, b) {
  withDashed(ctx, () => strokeSegment(ctx, a, b));
}

function drawRatioLabel(ctx, a, b, ratio, borderColor, labelStyle) {
  if (!Number.isFinite(ratio)) return;
  const mid = midPoint(a, b);
  const text = formatRatio(ratio);
  const fontSize = labelStyle.fontSize ?? 10;
  const weight = labelStyle.bold ? "700" : "600";
  const style = labelStyle.italic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${fontSize}px system-ui,sans-serif`;
  const padX = 4;
  const padY = 2;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontSize + padY * 2;
  const rx = mid.x - w / 2;
  const ry = mid.y - h / 2;
  ctx.fillStyle = applyColorOpacity(borderColor, 92);
  fillRoundRect(ctx, rx, ry, w, h, 2);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, mid.x, mid.y + 0.5);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawPointLabelBadge(ctx, pt, text, borderColor, labelStyle) {
  if (!text) return;
  const fontSize = labelStyle.fontSize ?? 12;
  const weight = labelStyle.bold ? "700" : "600";
  const style = labelStyle.italic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${fontSize}px system-ui,sans-serif`;
  const padX = 5;
  const padY = 3;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontSize + padY * 2;
  const rx = pt.x - w / 2;
  const ry = pt.y - h - 8;
  ctx.fillStyle = applyColorOpacity(borderColor, 92);
  fillRoundRect(ctx, rx, ry, w, h, 3);
  ctx.fillStyle = labelStyle.color ?? "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pt.x, ry + h / 2 + 0.5);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawPointLabels(ctx, type, pts, borderColor, labelStyle) {
  const labels = PATTERN_LABELS[type];
  if (!labels) return;
  for (let i = 0; i < pts.length && i < labels.length; i += 1) {
    const text = labels[i];
    if (!text) continue;
    if (type.startsWith("elliott-")) {
      drawPointLabelBadge(ctx, pts[i], text, borderColor, { ...labelStyle, color: "#ffffff" });
    } else {
      drawPointLabelBadge(ctx, pts[i], text, borderColor, labelStyle);
    }
  }
}

function resolvePatternStyle(drawing) {
  const typeDefaults = PATTERN_TYPE_DEFAULTS[drawing.type] ?? {};
  const borderColor = drawing.color ?? typeDefaults.color ?? "#2962FF";
  const borderOpacity = drawing.colorOpacity ?? 100;
  const labelColor = drawing.textColor ?? "#ffffff";
  const labelOpacity = drawing.textColorOpacity ?? 100;
  const bgColor = drawing.patternBackgroundColor ?? borderColor;
  const bgOpacity = drawing.patternBackgroundOpacity ?? 15;
  return {
    borderColor: applyColorOpacity(borderColor, borderOpacity),
    lineWidth: drawing.lineWidth ?? 2,
    showWave: drawing.showPatternWave !== false,
    showBackground: drawing.showPatternBackground ?? typeDefaults.showPatternBackground ?? false,
    backgroundFill: applyColorOpacity(bgColor, bgOpacity),
    showRatios: drawing.showPatternRatios !== false,
    labelStyle: {
      color: applyColorOpacity(labelColor, labelOpacity),
      fontSize: drawing.fontSize ?? 12,
      bold: Boolean(drawing.patternLabelBold),
      italic: Boolean(drawing.patternLabelItalic),
    },
  };
}

function renderHarmonicFivePoint(ctx, pts, style, type) {
  if (pts.length < 5) {
    drawPolyline(ctx, pts);
    return;
  }
  const [x, a, b, c, d] = pts;
  const wave = [x, a, b, c, d, x];
  if (style.showBackground) {
    ctx.fillStyle = style.backgroundFill;
    fillPolygon(ctx, wave);
  }
  if (style.showWave) {
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.lineWidth;
    drawPolyline(ctx, wave, true);
  }
  if (style.showRatios) {
    const xa = legSize(x, a);
    const ab = legSize(a, b);
    const bc = legSize(b, c);
    const cd = legSize(c, d);
    const ratios = [
      { seg: [x, b], value: xa ? ab / xa : NaN },
      { seg: [a, c], value: ab ? bc / ab : NaN },
      { seg: [b, d], value: bc ? cd / bc : NaN },
      { seg: [x, d], value: xa ? legSize(x, d) / xa : NaN },
    ];
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = Math.max(1, style.lineWidth - 0.5);
    for (const { seg, value } of ratios) {
      drawDottedSegment(ctx, seg[0], seg[1]);
      drawRatioLabel(ctx, seg[0], seg[1], value, style.borderColor, style.labelStyle);
    }
  }
  drawPointLabels(ctx, type, pts, style.borderColor, style.labelStyle);
}

function renderAbcdPattern(ctx, pts, style) {
  if (pts.length < 4) {
    drawPolyline(ctx, pts);
    return;
  }
  const [a, b, c, d] = pts;
  if (style.showWave) {
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.lineWidth;
    drawPolyline(ctx, [a, b, c, d]);
  }
  const corner = { x: d.x, y: c.y };
  const triangle = [c, corner, d];
  if (style.showBackground) {
    ctx.fillStyle = style.backgroundFill;
    fillPolygon(ctx, triangle);
  }
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = Math.max(1, style.lineWidth - 0.5);
  withDashed(ctx, () => {
    drawPolyline(ctx, [c, corner, d]);
  });
  if (style.showRatios) {
    const ab = legSize(a, b);
    const bc = legSize(b, c);
    drawDottedSegment(ctx, a, c);
    drawRatioLabel(ctx, a, c, ab ? bc / ab : NaN, style.borderColor, style.labelStyle);
  }
  drawPointLabels(ctx, "abcd-pattern", pts, style.borderColor, style.labelStyle);
}

function renderTrianglePattern(ctx, pts, style) {
  if (pts.length < 4) {
    drawPolyline(ctx, pts);
    return;
  }
  const [a, b, c, d] = pts;
  const outline = [a, b, d, c];
  if (style.showBackground) {
    ctx.fillStyle = style.backgroundFill;
    fillPolygon(ctx, outline);
  }
  if (style.showWave) {
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.lineWidth;
    drawPolyline(ctx, [a, b]);
    drawPolyline(ctx, [c, d]);
    drawPolyline(ctx, [a, c]);
    drawPolyline(ctx, [b, d]);
  }
  drawPointLabels(ctx, "triangle-pattern", pts, style.borderColor, style.labelStyle);
}

function renderHeadAndShoulders(ctx, pts, style, right, bottom) {
  const count = pts.length;
  if (count < 5) {
    drawPolyline(ctx, pts);
    return;
  }
  const wavePts = count >= 7 ? pts.slice(0, 7) : pts.slice(0, 5);
  if (style.showBackground) {
    ctx.fillStyle = style.backgroundFill;
    if (count >= 7) {
      fillPolygon(ctx, wavePts);
    } else {
      fillPolygon(ctx, wavePts);
    }
  }
  if (style.showWave) {
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.lineWidth;
    drawPolyline(ctx, wavePts);
  }
  const necklineStart = wavePts[0];
  const necklineEnd = wavePts[wavePts.length - 1];
  const neckline = clipLineThroughPoints(necklineStart, necklineEnd, 0, right, 0, bottom);
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = Math.max(1, style.lineWidth - 0.5);
  withDashed(ctx, () => strokeSegment(ctx, neckline));
  drawPointLabels(ctx, "head-and-shoulders", wavePts, style.borderColor, style.labelStyle);
}

function renderThreeDrives(ctx, pts, style) {
  if (pts.length < 4) {
    drawPolyline(ctx, pts);
    return;
  }
  if (style.showWave) {
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.lineWidth;
    drawPolyline(ctx, pts);
  }
  if (style.showRatios && pts.length >= 7) {
    const pairs = [
      [pts[0], pts[2], pts[1], pts[2]],
      [pts[2], pts[4], pts[3], pts[4]],
      [pts[4], pts[6], pts[5], pts[6]],
    ];
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = Math.max(1, style.lineWidth - 0.5);
    for (const [from, to, driveStart, driveEnd] of pairs) {
      drawDottedSegment(ctx, from, to);
      const drive = legSize(driveStart, driveEnd);
      const retrace = legSize(driveEnd, to);
      drawRatioLabel(ctx, from, to, drive ? retrace / drive : NaN, style.borderColor, style.labelStyle);
    }
  }
  drawPointLabels(ctx, "three-drives", pts, style.borderColor, style.labelStyle);
}

function renderElliottWave(ctx, type, pts, style) {
  if (style.showWave) {
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.lineWidth;
    drawPolyline(ctx, pts);
  }
  drawPointLabels(ctx, type, pts, style.borderColor, style.labelStyle);
}

/** @param {string} drawingType */
export function isHarmonicPatternTool(drawingType) {
  return HARMONIC_PATTERN_TYPES.has(drawingType);
}

/** @param {string} drawingType */
export function isElliottPatternTool(drawingType) {
  return ELLIOTT_PATTERN_TYPES.has(drawingType);
}

/** @param {string} drawingType */
export function supportsHarmonicPatternStyleSettings(drawingType) {
  return isHarmonicPatternTool(drawingType);
}

/** @param {string} drawingType */
export function supportsElliottPatternStyleSettings(drawingType) {
  return isElliottPatternTool(drawingType);
}

/** @param {string} drawingType */
export function supportsPatternStyleSettings(drawingType) {
  return isHarmonicPatternTool(drawingType) || isElliottPatternTool(drawingType);
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function finalizePatternDrawing(drawing) {
  if (!supportsPatternStyleSettings(drawing.type)) {
    return drawing;
  }
  const typeDefaults = PATTERN_TYPE_DEFAULTS[drawing.type] ?? {};
  const color = drawing.color ?? typeDefaults.color ?? "#2962FF";
  return {
    ...drawing,
    color,
    colorOpacity: drawing.colorOpacity ?? 100,
    textColor: drawing.textColor ?? "#ffffff",
    textColorOpacity: drawing.textColorOpacity ?? 100,
    lineWidth: drawing.lineWidth ?? 2,
    fontSize: drawing.fontSize ?? 12,
    showPatternWave: drawing.showPatternWave ?? true,
    showPatternBackground:
      drawing.showPatternBackground ?? typeDefaults.showPatternBackground ?? false,
    patternBackgroundColor: drawing.patternBackgroundColor ?? color,
    patternBackgroundOpacity: drawing.patternBackgroundOpacity ?? 15,
    showPatternRatios: drawing.showPatternRatios ?? true,
    patternLabelBold: Boolean(drawing.patternLabelBold),
    patternLabelItalic: Boolean(drawing.patternLabelItalic),
    elliottDegree: drawing.elliottDegree ?? "intermediate",
  };
}

/** @param {string} type */
export function isPatternTool(type) {
  return supportsPatternStyleSettings(type);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} drawing
 * @param {{ x: number, y: number }[]} pts
 * @param {number} right
 * @param {number} bottom
 * @param {{ isPreview?: boolean }} [state]
 */
export function renderPatternDrawing(ctx, drawing, pts, right, bottom, state = {}) {
  if (!pts.length) return;
  const type = drawing.type;

  if (isCycleTool(type)) {
    renderCycleDrawing(ctx, drawing, pts, 0, right, bottom, state);
    return;
  }

  if (supportsPatternStyleSettings(type)) {
    const style = resolvePatternStyle(drawing);
    ctx.save();
    switch (type) {
      case "xabcd-pattern":
      case "cypher-pattern":
        renderHarmonicFivePoint(ctx, pts, style, type);
        break;
      case "abcd-pattern":
        renderAbcdPattern(ctx, pts, style);
        break;
      case "triangle-pattern":
        renderTrianglePattern(ctx, pts, style);
        break;
      case "head-and-shoulders":
        renderHeadAndShoulders(ctx, pts, style, right, bottom);
        break;
      case "three-drives":
        renderThreeDrives(ctx, pts, style);
        break;
      case "elliott-impulse":
      case "elliott-correction":
      case "elliott-triangle":
      case "elliott-double-combo":
      case "elliott-triple-combo":
        renderElliottWave(ctx, type, pts, style);
        break;
      default:
        drawPolyline(ctx, pts);
        drawPointLabels(ctx, type, pts, style.borderColor, style.labelStyle);
    }
    ctx.restore();
    return;
  }
}

/** @param {string} type */
export function isPatternDrawingType(type) {
  return (
    type === "xabcd-pattern" ||
    type === "cypher-pattern" ||
    type === "head-and-shoulders" ||
    type === "abcd-pattern" ||
    type === "triangle-pattern" ||
    type === "three-drives" ||
    type === "elliott-impulse" ||
    type === "elliott-correction" ||
    type === "elliott-triangle" ||
    type === "elliott-double-combo" ||
    type === "elliott-triple-combo" ||
    type === "cyclic-lines" ||
    type === "time-cycles" ||
    type === "sine-line"
  );
}

/**
 * @param {string} type
 * @param {{ x: number, y: number }[]} pts
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {number} right
 * @param {number} bottom
 */
export function hitPatternDrawing(type, pts, px, py, threshold, right, bottom) {
  if (!pts.length) return false;

  for (let i = 0; i < pts.length; i += 1) {
    if (Math.hypot(px - pts[i].x, py - pts[i].y) <= threshold * 2) return true;
  }

  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
  }

  if (type === "xabcd-pattern" || type === "cypher-pattern") {
    if (pts.length >= 5) {
      const diagonals = [
        [pts[0], pts[2]],
        [pts[1], pts[3]],
        [pts[2], pts[4]],
        [pts[0], pts[4]],
        [pts[4], pts[0]],
      ];
      for (const [a, b] of diagonals) {
        if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
      }
    }
  }

  if (type === "head-and-shoulders" && pts.length >= 5) {
    const necklineStart = pts[0];
    const necklineEnd = pts[pts.length >= 7 ? 6 : 4];
    const nl = clipLineThroughPoints(necklineStart, necklineEnd, 0, right, 0, bottom);
    if (distToSegment(px, py, nl.x1, nl.y1, nl.x2, nl.y2) <= threshold) return true;
  }

  if (type === "triangle-pattern" && pts.length >= 4) {
    const extras = [
      [pts[0], pts[2]],
      [pts[1], pts[3]],
    ];
    for (const [a, b] of extras) {
      if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
    }
  }

  if (type === "abcd-pattern" && pts.length >= 4) {
    const corner = { x: pts[3].x, y: pts[2].y };
    const extras = [
      [pts[2], corner],
      [corner, pts[3]],
      [pts[0], pts[2]],
    ];
    for (const [a, b] of extras) {
      if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
    }
  }

  if (type === "three-drives" && pts.length >= 7) {
    const extras = [
      [pts[0], pts[2]],
      [pts[2], pts[4]],
      [pts[4], pts[6]],
    ];
    for (const [a, b] of extras) {
      if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return true;
    }
  }

  if (isCycleTool(type)) {
    return hitCycleDrawing(type, pts, px, py, threshold, 0, right, bottom);
  }

  return false;
}
