import { applyColorOpacity } from "../../../ui/color/picker.js";
import { clampTimeToBarRange, snapTimeToNearestBar } from "../../../chart/coords/timeScale.js";
import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { regressionBarValue, regressionInRange } from "../channel/index.js";
import { clipLineThroughPoints } from "../line/math.js";
import { LINE_STYLE_DASH } from "../../registry/tools.js";

export const REGRESSION_LOWER_FILL = "#f23645";

export const REGRESSION_SOURCE_ITEMS = [
  { id: "open", label: "Open" },
  { id: "high", label: "High" },
  { id: "low", label: "Low" },
  { id: "close", label: "Close" },
  { id: "hl2", label: "(H + L)/2" },
  { id: "hlc3", label: "(H + L + C)/3" },
  { id: "ohlc4", label: "(O + H + L + C)/4" },
];

export const REGRESSION_TREND_DEFAULTS = {
  regressionUpperDeviation: 2,
  regressionLowerDeviation: -2,
  regressionUseUpperDeviation: true,
  regressionUseLowerDeviation: true,
  regressionSource: "close",
  regressionBaseEnabled: true,
  regressionBaseColor: "#f23645",
  regressionBaseOpacity: 100,
  regressionBaseWidth: 1,
  regressionBaseStyle: 1,
  regressionUpEnabled: true,
  regressionUpColor: "#2962FF",
  regressionUpOpacity: 100,
  regressionUpWidth: 2,
  regressionUpStyle: 0,
  regressionDownEnabled: true,
  regressionDownColor: "#f23645",
  regressionDownOpacity: 100,
  regressionDownWidth: 2,
  regressionDownStyle: 0,
  regressionExtendLines: false,
  regressionShowPearsons: true,
  regressionUpperFillOpacity: 22,
  regressionLowerFillOpacity: 22,
  regressionPriceOffset: 0,
};

/** @param {string} drawingType */
export function isRegressionTrendTool(drawingType) {
  return drawingType === "regression-trend";
}

/** @param {string} drawingType */
export function supportsRegressionTrendSettings(drawingType) {
  return isRegressionTrendTool(drawingType);
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function normalizeRegressionDrawing(drawing) {
  if (!isRegressionTrendTool(drawing.type)) return drawing;
  const normalized = { ...REGRESSION_TREND_DEFAULTS, ...drawing };
  const baseColor = normalized.regressionBaseColor ?? REGRESSION_TREND_DEFAULTS.regressionBaseColor;
  const downColor = normalized.regressionDownColor;
  if (downColor === REGRESSION_TREND_DEFAULTS.regressionUpColor && baseColor === REGRESSION_TREND_DEFAULTS.regressionBaseColor) {
    normalized.regressionDownColor = baseColor;
    normalized.regressionDownOpacity = normalized.regressionBaseOpacity ?? REGRESSION_TREND_DEFAULTS.regressionBaseOpacity;
  }
  // Per-drawing vertical offset is not persisted; stale values shift the whole channel up/down.
  normalized.regressionPriceOffset = 0;
  return normalized;
}

/** @param {"base" | "up" | "down"} key */
function regressionStyleCap(key) {
  if (key === "base") return "Base";
  if (key === "up") return "Up";
  if (key === "down") return "Down";
  return key;
}

/**
 * @param {Record<string, unknown>} draft
 * @param {"base" | "up" | "down"} key
 */
export function regressionLineStyle(draft, key) {
  const cap = regressionStyleCap(key);
  const colorKey = `regression${cap}Color`;
  const opacityKey = `regression${cap}Opacity`;
  const widthKey = `regression${cap}Width`;
  const styleKey = `regression${cap}Style`;
  const baseColor = draft.regressionBaseColor ?? REGRESSION_TREND_DEFAULTS.regressionBaseColor;
  const baseOpacity = draft.regressionBaseOpacity ?? REGRESSION_TREND_DEFAULTS.regressionBaseOpacity ?? 100;
  return {
    color:
      key === "down"
        ? (draft[colorKey] ?? baseColor)
        : (draft[colorKey] ?? REGRESSION_TREND_DEFAULTS[colorKey]),
    opacity:
      key === "down"
        ? (draft[opacityKey] ?? draft.regressionBaseOpacity ?? baseOpacity)
        : (draft[opacityKey] ?? REGRESSION_TREND_DEFAULTS[opacityKey] ?? 100),
    width: draft[widthKey] ?? REGRESSION_TREND_DEFAULTS[widthKey] ?? 2,
    style: draft[styleKey] ?? REGRESSION_TREND_DEFAULTS[styleKey] ?? (key === "base" ? 1 : 0),
  };
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} bars
 */
export function computeRegressionForDrawing(drawing, bars) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0 || !p1 || !bars.length) return null;
  const reg = regressionInRange(bars, p0.time, p1.time, drawing.regressionSource ?? "close");
  if (!reg) return null;
  return reg;
}

/**
 * Bar-aligned times for regression endpoints (index 0 and n-1 on the fitted slice).
 * @param {{ slice: { time: number }[] } | null} reg
 * @param {{ time: number }} p0
 * @param {{ time: number }} p1
 */
export function regressionEndpointTimes(reg, p0, p1) {
  if (reg?.slice?.length) {
    return {
      tLo: reg.slice[0].time,
      tHi: reg.slice[reg.slice.length - 1].time,
    };
  }
  return {
    tLo: Math.min(p0.time, p1.time),
    tHi: Math.max(p0.time, p1.time),
  };
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ time: number }[]} bars
 * @param {number} [barSec]
 */
export function finalizeRegressionDrawing(drawing, bars, barSec = 60) {
  const normalized = normalizeRegressionDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1 || !bars?.length) return normalized;
  const snap = (time) => snapTimeToNearestBar(clampTimeToBarRange(time, bars), bars, barSec);
  const t0 = snap(p0.time);
  const t1 = snap(p1.time);
  const reg = regressionInRange(bars, t0, t1, normalized.regressionSource ?? "close");
  if (!reg) {
    return {
      ...normalized,
      regressionPriceOffset: 0,
      points: [
        { ...p0, time: t0 },
        { ...p1, time: t1 },
      ],
    };
  }
  const { tLo, tHi } = regressionEndpointTimes(reg, { time: t0 }, { time: t1 });
  return {
    ...normalized,
    regressionPriceOffset: 0,
    points: [
      { time: tLo, price: regressionPriceAt(reg, tLo) },
      { time: tHi, price: regressionPriceAt(reg, tHi) },
    ],
  };
}

/**
 * @param {{ slice: { time: number }[], slope: number, intercept: number }} reg
 * @param {number} time
 */
export function regressionIndexAtTime(reg, time) {
  const slice = reg.slice;
  if (!slice.length) return 0;
  if (time <= slice[0].time) return 0;
  if (time >= slice[slice.length - 1].time) return slice.length - 1;
  for (let i = 0; i < slice.length - 1; i += 1) {
    const t0 = slice[i].time;
    const t1 = slice[i + 1].time;
    if (time >= t0 && time <= t1) {
      const dt = t1 - t0;
      if (Math.abs(dt) < 1e-12) return i;
      return i + (time - t0) / dt;
    }
  }
  return slice.length - 1;
}

/**
 * @param {{ slope: number, intercept: number, std: number }} reg
 * @param {number} time
 * @param {number} [stdMul]
 * @param {number} [priceOffset]
 */
export function regressionPriceAt(reg, time, stdMul = 0, priceOffset = 0) {
  const idx = regressionIndexAtTime(reg, time);
  return reg.intercept + reg.slope * idx + stdMul * reg.std + priceOffset;
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function regressionPriceOffset(drawing) {
  return Number(drawing.regressionPriceOffset) || 0;
}

/**
 * @param {{ values: number[], slope: number, intercept: number }} reg
 */
export function regressionPearsonR(reg) {
  const values = reg.values ?? [];
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  values.forEach((y, i) => {
    sumX += i;
    sumY += y;
  });
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  values.forEach((y, i) => {
    const dx = i - meanX;
    const dy = y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  });
  const den = Math.sqrt(denX * denY);
  if (Math.abs(den) < 1e-12) return 0;
  return num / den;
}

/** Pearson's R formatted with 15 decimal places. */
export function formatRegressionPearsonR(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(15);
}

/** @deprecated use regressionPearsonR */
export function regressionRSquared(reg) {
  const r = regressionPearsonR(reg);
  return r * r;
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} bars
 * @param {number} tLo
 * @param {number} tHi
 */
export function regressionTrendGeometry(drawing, bars, tLo, tHi) {
  const normalized = normalizeRegressionDrawing(drawing);
  const reg = computeRegressionForDrawing(normalized, bars);
  if (!reg) return null;

  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  const endpoints = p0 && p1 ? regressionEndpointTimes(reg, p0, p1) : { tLo, tHi };
  const tStart = endpoints.tLo;
  const tEnd = endpoints.tHi;

  const offset = regressionPriceOffset(normalized);
  const { upper: upperMul, lower: lowerMul } = regressionDeviationMultipliers(normalized);
  return {
    reg,
    normalized,
    tLo: tStart,
    tHi: tEnd,
    upperMul,
    lowerMul,
    midY0: regressionPriceAt(reg, tStart, 0, offset),
    midY1: regressionPriceAt(reg, tEnd, 0, offset),
    upperY0: upperMul != null ? regressionPriceAt(reg, tStart, upperMul, offset) : null,
    upperY1: upperMul != null ? regressionPriceAt(reg, tEnd, upperMul, offset) : null,
    lowerY0: lowerMul != null ? regressionPriceAt(reg, tStart, lowerMul, offset) : null,
    lowerY1: lowerMul != null ? regressionPriceAt(reg, tEnd, lowerMul, offset) : null,
  };
}

/**
 * Handles on upper + median line ends.
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} bars
 */
export function regressionTrendAnchorPoints(drawing, bars) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0 || !p1) return drawing.points ?? [];

  const geom = regressionTrendGeometry(drawing, bars, p0.time, p1.time);
  if (!geom) {
    const tLo = Math.min(p0.time, p1.time);
    const tHi = Math.max(p0.time, p1.time);
    return [
      { time: tLo, price: p0.price },
      { time: tHi, price: p1.price },
    ];
  }

  const { tLo, tHi } = geom;
  const points = [];
  if (geom.upperY0 != null) points.push({ time: tLo, price: geom.upperY0 });
  if (geom.upperY1 != null) points.push({ time: tHi, price: geom.upperY1 });
  points.push({ time: tLo, price: geom.midY0 });
  points.push({ time: tHi, price: geom.midY1 });
  return points;
}

/**
 * Index of the draggable left-median handle in {@link regressionTrendAnchorPoints}.
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} [bars]
 */
export function regressionTrendMidLeftAnchorIndex(drawing, bars = []) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0 || !p1) return 0;

  const tLo = Math.min(p0.time, p1.time);
  const tHi = Math.max(p0.time, p1.time);
  const geom = regressionTrendGeometry(drawing, bars, tLo, tHi);
  if (!geom) return 0;

  let idx = 0;
  if (geom.upperY0 != null) idx += 1;
  if (geom.upperY1 != null) idx += 1;
  return idx;
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} [bars]
 * @returns {[number, number]}
 */
export function regressionTrendMedianAnchorIndices(drawing, bars = []) {
  const midLeft = regressionTrendMidLeftAnchorIndex(drawing, bars);
  return [midLeft, midLeft + 1];
}

/** @param {import("../../types.js").DrawPoint | null | undefined} point @param {{ time: number }[]} bars @param {number} [barSec] */
export function clampRegressionPoint(point, bars, barSec = 60) {
  if (!point || !bars?.length) return point;
  const clamped = clampTimeToBarRange(point.time, bars);
  return { ...point, time: snapTimeToNearestBar(clamped, bars, barSec) };
}

/**
 * @param {"left" | "right"} edge
 * @param {import("../../types.js").DrawPoint[]} startPoints
 * @param {number} startPriceOffset
 * @param {import("../../types.js").DrawPoint} point
 * @param {{ time: number }[]} [bars]
 */
export function regressionTrendDragUpdate(edge, startPoints, startPriceOffset, point, bars = [], barSec = 60) {
  const p0 = startPoints[0];
  const p1 = startPoints[1];
  if (!p0 || !p1) {
    return {
      points: startPoints.map((p) => ({ ...p })),
      regressionPriceOffset: startPriceOffset,
    };
  }

  const leftIdx = p0.time <= p1.time ? 0 : 1;
  const rightIdx = leftIdx === 0 ? 1 : 0;
  const targetIdx = edge === "left" ? leftIdx : rightIdx;

  const snapTime = (time) => {
    let t = bars.length ? clampTimeToBarRange(time, bars) : time;
    if (bars.length) t = snapTimeToNearestBar(t, bars, barSec);
    return t;
  };

  let newTime = snapTime(point.time);
  if (edge === "left") {
    newTime = Math.min(newTime, startPoints[rightIdx].time - 1);
  } else {
    newTime = Math.max(newTime, startPoints[leftIdx].time + 1);
  }
  newTime = snapTime(newTime);

  const points = startPoints.map((p, i) =>
    i === targetIdx ? { time: newTime, price: point.price - startPriceOffset } : { ...p },
  );

  return { points, regressionPriceOffset: startPriceOffset };
}

/**
 * @param {"left" | "right"} edge
 * @param {import("../../types.js").DrawPoint[]} startPoints
 * @param {number} newTime
 */
export function regressionTrendDragEdgeUpdate(edge, startPoints, newTime) {
  const p0 = startPoints[0];
  const p1 = startPoints[1];
  if (!p0 || !p1) return startPoints;

  const leftIdx = p0.time <= p1.time ? 0 : 1;
  const rightIdx = leftIdx === 0 ? 1 : 0;
  if (edge === "left") {
    const rightTime = startPoints[rightIdx].time;
    const nextLeft = Math.min(newTime, rightTime - 1);
    return startPoints.map((p, i) => (i === leftIdx ? { ...p, time: nextLeft } : { ...p }));
  }
  const leftTime = startPoints[leftIdx].time;
  const nextRight = Math.max(newTime, leftTime + 1);
  return startPoints.map((p, i) => (i === rightIdx ? { ...p, time: nextRight } : { ...p }));
}

/** @deprecated use regressionTrendDragEdgeUpdate */
export function regressionTrendDragLeftUpdate(startPoints, newLeftTime) {
  return regressionTrendDragEdgeUpdate("left", startPoints, newLeftTime);
}

/** @param {import("../../types.js").UserDrawing} drawing */
function regressionDeviationMultipliers(drawing) {
  const upper =
    drawing.regressionUseUpperDeviation !== false
      ? Number(drawing.regressionUpperDeviation ?? REGRESSION_TREND_DEFAULTS.regressionUpperDeviation)
      : null;
  const lower =
    drawing.regressionUseLowerDeviation !== false
      ? Number(drawing.regressionLowerDeviation ?? REGRESSION_TREND_DEFAULTS.regressionLowerDeviation)
      : null;
  return { upper, lower };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function strokeLine(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function renderRegressionFirstPointGuide(ctx, a, bottom) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  strokeLine(ctx, a.x, 0, a.x, bottom);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} bottom
 */
function renderRegressionPlacementGuides(ctx, a, b, bottom) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  strokeLine(ctx, a.x, 0, a.x, bottom);
  strokeLine(ctx, b.x, 0, b.x, bottom);

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(120, 123, 134, 0.95)";
  strokeLine(ctx, a.x, a.y, b.x, b.y);
  ctx.restore();
}

function renderRegressionGuideAnchors(drawing, timeToX, priceToY, { preview = false } = {}) {
  const normalized = normalizeRegressionDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return null;

  const leftIdx = p0.time <= p1.time ? 0 : 1;
  const rightIdx = leftIdx === 0 ? 1 : 0;
  const tLo = Math.min(p0.time, p1.time);
  const tHi = Math.max(p0.time, p1.time);
  const xLeft = timeToX(tLo);
  const xRight = timeToX(tHi);
  if (xLeft == null || xRight == null) return null;

  const offset = preview ? 0 : regressionPriceOffset(normalized);
  const yLeft = priceToY(normalized.points[leftIdx].price + offset);
  const yRight = priceToY(normalized.points[rightIdx].price + offset);
  if (yLeft == null || yRight == null) return null;

  return {
    a: { x: xLeft, y: yLeft },
    b: { x: xRight, y: yRight },
    placingSecond: preview && Math.abs(p1.time - p0.time) > 0,
  };
}

function regressionScreenSegment(timeToX, priceToY, tA, priceA, tB, priceB, leftX, rightX, bottom, extend) {
  const xA = timeToX(tA);
  const yA = priceToY(priceA);
  const xB = timeToX(tB);
  const yB = priceToY(priceB);
  if ([xA, yA, xB, yB].some((v) => v == null)) return null;
  const a = { x: xA, y: yA };
  const b = { x: xB, y: yB };
  if (extend) {
    return clipLineThroughPoints(a, b, leftX, rightX, 0, bottom);
  }
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} right
 * @param {number} bottom
 * @param {{ isPreview?: boolean, bars?: { time: number, open?: number, high?: number, low?: number, close?: number }[] }} state
 */
export function renderRegressionTrendDrawing(ctx, drawing, timeToX, priceToY, right, bottom, state = {}) {
  const normalized = normalizeRegressionDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return;

  if (state.regressionGuidesOnly || state.isPreview) {
    const guides = renderRegressionGuideAnchors(drawing, timeToX, priceToY, {
      preview: Boolean(state.isPreview),
    });
    if (!guides) return;
    if (state.isPreview && !guides.placingSecond) {
      renderRegressionFirstPointGuide(ctx, guides.a, bottom);
      return;
    }
    renderRegressionPlacementGuides(ctx, guides.a, guides.b, bottom);
    return;
  }

  const bars = state.bars ?? [];
  const reg = computeRegressionForDrawing(normalized, bars);
  if (!reg) return;

  const offset = regressionPriceOffset(normalized);
  const { tLo, tHi } = regressionEndpointTimes(reg, p0, p1);
  const extend = Boolean(normalized.regressionExtendLines);
  if (!extend && (timeToX(tLo) == null || timeToX(tHi) == null)) return;

  const priceAt = (t, stdMul = 0) => regressionPriceAt(reg, t, stdMul, offset);
  const { upper: upperMul, lower: lowerMul } = regressionDeviationMultipliers(normalized);

  const midSeg = regressionScreenSegment(
    timeToX,
    priceToY,
    tLo,
    priceAt(tLo),
    tHi,
    priceAt(tHi),
    0,
    right,
    bottom,
    extend,
  );
  if (!midSeg) return;

  const upperSeg =
    upperMul != null
      ? regressionScreenSegment(
          timeToX,
          priceToY,
          tLo,
          priceAt(tLo, upperMul),
          tHi,
          priceAt(tHi, upperMul),
          0,
          right,
          bottom,
          extend,
        )
      : null;
  const lowerSeg =
    lowerMul != null
      ? regressionScreenSegment(
          timeToX,
          priceToY,
          tLo,
          priceAt(tLo, lowerMul),
          tHi,
          priceAt(tHi, lowerMul),
          0,
          right,
          bottom,
          extend,
        )
      : null;

  const baseStyle = regressionLineStyle(normalized, "base");
  const upStyle = regressionLineStyle(normalized, "up");
  const downStyle = regressionLineStyle(normalized, "down");

  if (upperSeg) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(upperSeg.x1, upperSeg.y1);
    ctx.lineTo(upperSeg.x2, upperSeg.y2);
    ctx.lineTo(midSeg.x2, midSeg.y2);
    ctx.lineTo(midSeg.x1, midSeg.y1);
    ctx.closePath();
    ctx.fillStyle = applyColorOpacity(
      upStyle.color,
      normalized.regressionUpperFillOpacity ?? REGRESSION_TREND_DEFAULTS.regressionUpperFillOpacity,
    );
    ctx.fill();
    ctx.restore();
  }

  if (lowerSeg) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(midSeg.x1, midSeg.y1);
    ctx.lineTo(midSeg.x2, midSeg.y2);
    ctx.lineTo(lowerSeg.x2, lowerSeg.y2);
    ctx.lineTo(lowerSeg.x1, lowerSeg.y1);
    ctx.closePath();
    ctx.fillStyle = applyColorOpacity(
      baseStyle.color,
      normalized.regressionLowerFillOpacity ?? REGRESSION_TREND_DEFAULTS.regressionLowerFillOpacity,
    );
    ctx.fill();
    ctx.restore();
  }

  const drawStyledSegment = (seg, style, enabled) => {
    if (!enabled || !seg) return;
    ctx.save();
    ctx.strokeStyle = applyColorOpacity(style.color, style.opacity);
    ctx.lineWidth = style.width;
    if (LINE_STYLE_DASH[style.style]?.length) ctx.setLineDash(LINE_STYLE_DASH[style.style]);
    strokeLine(ctx, seg.x1, seg.y1, seg.x2, seg.y2);
    ctx.restore();
  };

  drawStyledSegment(upperSeg, upStyle, normalized.regressionUpEnabled !== false && upperMul != null);
  drawStyledSegment(lowerSeg, downStyle, normalized.regressionDownEnabled !== false && lowerMul != null);
  drawStyledSegment(midSeg, baseStyle, normalized.regressionBaseEnabled !== false);

  if (!state.isPreview && normalized.regressionShowPearsons !== false) {
    const pearsonR = regressionPearsonR(reg);
    const xLabel = timeToX(tLo);
    const yLabel = priceToY(lowerMul != null ? priceAt(tLo, lowerMul) : priceAt(tLo));
    if (xLabel == null || yLabel == null) return;
    ctx.save();
    ctx.font = "11px Trebuchet MS, Roboto, Ubuntu, sans-serif";
    ctx.fillStyle = applyColorOpacity(downStyle.color, downStyle.opacity);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(formatRegressionPearsonR(pearsonR), xLabel, yLabel);
    ctx.restore();
  }
}

/**
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {number} px
 * @param {number} py
 * @param {number} threshold
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} bars
 * @param {(px: number, py: number, x1: number, y1: number, x2: number, y2: number) => number} distToSegment
 */
export function hitRegressionTrendDrawing(
  drawing,
  px,
  py,
  threshold,
  timeToX,
  priceToY,
  bars,
  distToSegment,
  right = 0,
  bottom = 1e9,
) {
  const normalized = normalizeRegressionDrawing(drawing);
  const p0 = normalized.points?.[0];
  const p1 = normalized.points?.[1];
  if (!p0 || !p1) return false;

  const ax = timeToX(p0.time);
  const ay = priceToY(p0.price);
  const bx = timeToX(p1.time);
  const by = priceToY(p1.price);
  if (ax == null || ay == null || bx == null || by == null) return false;

  const reg = computeRegressionForDrawing(normalized, bars);
  if (!reg) return distToSegment(px, py, ax, ay, bx, by) <= threshold;

  const offset = regressionPriceOffset(normalized);
  const { tLo, tHi } = regressionEndpointTimes(reg, p0, p1);
  const extend = Boolean(normalized.regressionExtendLines);
  const priceAt = (t, stdMul = 0) => regressionPriceAt(reg, t, stdMul, offset);
  const { upper: upperMul, lower: lowerMul } = regressionDeviationMultipliers(normalized);

  const midSeg = regressionScreenSegment(
    timeToX,
    priceToY,
    tLo,
    priceAt(tLo),
    tHi,
    priceAt(tHi),
    0,
    right,
    bottom,
    extend,
  );
  if (!midSeg) return distToSegment(px, py, ax, ay, bx, by) <= threshold;

  const upperSeg =
    upperMul != null
      ? regressionScreenSegment(
          timeToX,
          priceToY,
          tLo,
          priceAt(tLo, upperMul),
          tHi,
          priceAt(tHi, upperMul),
          0,
          right,
          bottom,
          extend,
        )
      : null;
  const lowerSeg =
    lowerMul != null
      ? regressionScreenSegment(
          timeToX,
          priceToY,
          tLo,
          priceAt(tLo, lowerMul),
          tHi,
          priceAt(tHi, lowerMul),
          0,
          right,
          bottom,
          extend,
        )
      : null;

  if (
    (upperSeg && distToSegment(px, py, upperSeg.x1, upperSeg.y1, upperSeg.x2, upperSeg.y2) <= threshold) ||
    distToSegment(px, py, midSeg.x1, midSeg.y1, midSeg.x2, midSeg.y2) <= threshold ||
    (lowerSeg && distToSegment(px, py, lowerSeg.x1, lowerSeg.y1, lowerSeg.x2, lowerSeg.y2) <= threshold)
  ) {
    return true;
  }

  const xLeft = midSeg.x1;
  const xRight = midSeg.x2;
  if (px < Math.min(xLeft, xRight) - threshold || px > Math.max(xLeft, xRight) + threshold) {
    return false;
  }

  const midY0 = midSeg.y1;
  const upperY0 = upperSeg?.y1 ?? midY0;
  const lowerY0 = lowerSeg?.y1 ?? midY0;
  const topY = upperY0 ?? midY0;
  const botY = lowerY0 ?? midY0;
  if (topY == null || botY == null) return false;

  const span = xRight - xLeft;
  const frac = span === 0 ? 0 : (px - xLeft) / span;
  const time = tLo + (tHi - tLo) * Math.max(0, Math.min(1, frac));
  const upperY = upperMul != null ? priceToY(priceAt(time, upperMul)) : midY0;
  const lowerY = lowerMul != null ? priceToY(priceAt(time, lowerMul)) : midY0;
  if (upperY == null || lowerY == null) return false;

  const top = Math.min(upperY, lowerY) - threshold;
  const bot = Math.max(upperY, lowerY) + threshold;
  return py >= top && py <= bot;
}

export { regressionBarValue };
