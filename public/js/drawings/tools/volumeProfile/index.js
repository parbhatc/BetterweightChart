import { computeVolumeProfile } from "../../../indicators/math/volumeProfile.js";
import { applyColorOpacity } from "../../../ui/color/picker.js";

export const VOLUME_PROFILE_TOOL_TYPE = "fixed-range-volume-profile";
export const VOLUME_PROFILE_TOOL_TYPES = new Set([
  VOLUME_PROFILE_TOOL_TYPE,
  "anchored-volume-profile",
]);

export const VOLUME_PROFILE_DEFAULTS = {
  vpRowsLayout: "number_of_rows",
  vpRowSize: 24,
  vpVolumeMode: "up_down",
  vpValueAreaPercent: 70,
  vpExtendRight: false,
  vpWidthPercent: 30,
  vpPlacement: "left",
  vpShowValues: false,
  vpShowVah: false,
  vpShowVal: false,
  vpShowPoc: true,
  vpUpColor: "#26a69a",
  vpUpOpacity: 75,
  vpDownColor: "#ec407a",
  vpDownOpacity: 75,
  vpValueAreaUpColor: "#00bcd4",
  vpValueAreaUpOpacity: 90,
  vpValueAreaDownColor: "#f06292",
  vpValueAreaDownOpacity: 90,
  vpPocColor: "#f23645",
  vpHistogramColor: "#78909c",
  vpHistogramOpacity: 8,
};

const profileCache = new WeakMap();

export function isVolumeProfileTool(type) {
  return VOLUME_PROFILE_TOOL_TYPES.has(type);
}

export function volumeProfileDraftFromDrawing(drawing) {
  return { ...VOLUME_PROFILE_DEFAULTS, ...drawing };
}

export function finalizeVolumeProfileDrawing(drawing) {
  return { ...VOLUME_PROFILE_DEFAULTS, ...drawing };
}

function selectedBars(drawing, bars) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  if (!p0) return [];
  const lo = p1 ? Math.min(Number(p0.time), Number(p1.time)) : Number(p0.time);
  const anchored = drawing.type === "anchored-volume-profile" && !p1;
  const hi = anchored || drawing.vpExtendRight ? Infinity : Math.max(Number(p0.time), Number(p1.time));
  return bars.filter((bar) => Number(bar.time) >= lo && Number(bar.time) <= hi);
}

function cachedProfile(drawing, bars, precision) {
  const p0 = drawing.points?.[0];
  const p1 = drawing.points?.[1];
  const key = [
    p0?.time,
    p1?.time ?? "anchored",
    drawing.vpExtendRight || !p1 ? bars.at(-1)?.time : "",
    bars.length,
    drawing.vpRowsLayout,
    drawing.vpRowSize,
    drawing.vpValueAreaPercent,
    precision,
  ].join("|");
  const cached = profileCache.get(drawing);
  if (cached?.key === key) return cached.profile;
  const profile = computeVolumeProfile(selectedBars(drawing, bars), {
    rows: drawing.vpRowSize,
    rowsLayout: drawing.vpRowsLayout,
    tickSize: 10 ** -Math.max(0, Number(precision) || 2),
    valueAreaPercent: drawing.vpValueAreaPercent,
  });
  profileCache.set(drawing, { key, profile });
  return profile;
}

function drawLevel(ctx, y, x1, x2, color, dash = []) {
  if (!Number.isFinite(y)) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/** Draw a TradingView-style fixed-range Up/Down volume profile. */
export function renderFixedRangeVolumeProfile(ctx, drawingIn, pts, state = {}) {
  const drawing = volumeProfileDraftFromDrawing(drawingIn);
  const a = pts[0];
  const b = pts[1] ?? (a ? { x: Number(state.right ?? a.x), y: a.y } : null);
  const bars = Array.isArray(state.bars) ? state.bars : [];
  if (!a || !b || !bars.length) return;
  const profile = cachedProfile(drawingIn, bars, state.precision ?? 2);
  if (!profile.rows.length) return;

  const rangeLeft = Math.min(a.x, b.x);
  const rangeRight = drawing.vpExtendRight ? Number(state.right ?? b.x) : Math.max(a.x, b.x);
  const rangeWidth = Math.max(2, rangeRight - rangeLeft);
  const profileWidth = rangeWidth * Math.max(0.01, Math.min(1, Number(drawing.vpWidthPercent) / 100 || 0.3));
  const profileLeft = drawing.vpPlacement === "right" ? rangeRight - profileWidth : rangeLeft;
  const profileRight = drawing.vpPlacement === "right" ? rangeRight : rangeLeft + profileWidth;
  const maxVolume = Math.max(...profile.rows.map((row) => row.totalVolume), 1);

  const topY = state.priceToY?.(profile.high);
  const bottomY = state.priceToY?.(profile.low);
  if (topY != null && bottomY != null) {
    ctx.fillStyle = applyColorOpacity(drawing.vpHistogramColor, drawing.vpHistogramOpacity);
    ctx.fillRect(rangeLeft, Math.min(topY, bottomY), rangeWidth, Math.abs(bottomY - topY));
  }

  const upColor = applyColorOpacity(drawing.vpUpColor, drawing.vpUpOpacity);
  const downColor = applyColorOpacity(drawing.vpDownColor, drawing.vpDownOpacity);
  const vaUp = applyColorOpacity(drawing.vpValueAreaUpColor, drawing.vpValueAreaUpOpacity);
  const vaDown = applyColorOpacity(drawing.vpValueAreaDownColor, drawing.vpValueAreaDownOpacity);

  for (const row of profile.rows) {
    if (row.totalVolume <= 0) continue;
    const yTop = state.priceToY?.(row.priceTop);
    const yBottom = state.priceToY?.(row.priceBottom);
    if (yTop == null || yBottom == null) continue;
    const top = Math.min(yTop, yBottom);
    const height = Math.max(1, Math.abs(yBottom - yTop));
    const width = profileWidth * row.totalVolume / maxVolume;
    let upWidth = width * row.upVolume / row.totalVolume;
    let downWidth = width - upWidth;
    let firstColor = row.inValueArea ? vaUp : upColor;
    let secondColor = row.inValueArea ? vaDown : downColor;

    if (drawing.vpVolumeMode === "total") {
      upWidth = width;
      downWidth = 0;
    } else if (drawing.vpVolumeMode === "delta") {
      const delta = row.upVolume - row.downVolume;
      upWidth = width * Math.abs(delta) / row.totalVolume;
      downWidth = 0;
      firstColor = delta >= 0 ? firstColor : secondColor;
    }

    const rowStart = drawing.vpPlacement === "right" ? profileRight - width : profileLeft;
    ctx.fillStyle = firstColor;
    ctx.fillRect(rowStart, top, upWidth, height);
    if (downWidth > 0) {
      ctx.fillStyle = secondColor;
      ctx.fillRect(rowStart + upWidth, top, downWidth, height);
    }

    if (drawing.vpShowValues && width > 36) {
      ctx.save();
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.round(row.totalVolume).toLocaleString(), rowStart + 3, top + height / 2);
      ctx.restore();
    }
  }

  if (drawing.vpShowPoc && profile.pocIndex >= 0) {
    const row = profile.rows[profile.pocIndex];
    drawLevel(ctx, state.priceToY?.((row.priceTop + row.priceBottom) / 2), rangeLeft, rangeRight, drawing.vpPocColor);
  }
  if (drawing.vpShowVah && profile.valueAreaHighIndex >= 0) {
    drawLevel(ctx, state.priceToY?.(profile.rows[profile.valueAreaHighIndex].priceTop), rangeLeft, rangeRight, vaUp, [4, 3]);
  }
  if (drawing.vpShowVal && profile.valueAreaLowIndex >= 0) {
    drawLevel(ctx, state.priceToY?.(profile.rows[profile.valueAreaLowIndex].priceBottom), rangeLeft, rangeRight, vaDown, [4, 3]);
  }
}
