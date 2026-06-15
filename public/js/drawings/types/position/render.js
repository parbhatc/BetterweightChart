import {
  drawEdgePill,
  drawPillBlock,
  measurePillBlock,
  PILL_FONT_SIZE,
} from "../shared/canvasPills.js";
import {
  PILL_OUTSIDE_GAP,
  TV_BORDER,
  TV_ENTRY_PILL,
  TV_PROFIT_FILL,
  TV_PROFIT_PILL,
  TV_STOP_FILL,
  TV_STOP_PILL,
} from "./constants.js";
import { positionGeometry, positionScreenBounds, positionStatsCenterPrice } from "./geometry.js";
import {
  buildPositionCenterStatLines,
  buildPositionZoneLabel,
  computePositionStatValues,
  resolvePositionStatsFields,
  shouldShowPositionStats,
} from "./stats.js";

/**
 * Price-axis labels for long/short position tools.
 * Target/stop labels show only when stats are visible (hover, select, or always on).
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {{ isSelected?: boolean, isHovered?: boolean }} [state]
 * @returns {{ id: string, price: number, color: string }[]}
 */
export function positionPriceAxisLabels(drawing, state = {}) {
  if (drawing.showPriceLabels === false) return [];
  const geom = positionGeometry(drawing);
  if (!geom) return [];
  const labels = [{ id: "entry", price: geom.entryPrice, color: TV_ENTRY_PILL }];
  if (shouldShowPositionStats(drawing, state)) {
    labels.unshift({ id: "target", price: geom.targetPrice, color: TV_PROFIT_PILL });
    labels.push({ id: "stop", price: geom.stopPrice, color: TV_STOP_PILL });
  }
  return labels;
}

/**
 * @param {{ x: number, y: number }} entryLeft
 * @param {{ x: number, y: number }} entryRight
 * @param {string[]} lines
 * @param {number} [fontSize]
 * @param {number} [yCenter]
 */
export function layoutPositionCenterStats(entryLeft, entryRight, lines, fontSize = PILL_FONT_SIZE, yCenter) {
  const block = measurePillBlock(lines, fontSize);
  if (!block) return null;
  const cx = (entryLeft.x + entryRight.x) / 2;
  const cy = yCenter ?? (entryLeft.y + entryRight.y) / 2;
  return {
    x: cx - block.width / 2,
    y: cy - block.height / 2,
    width: block.width,
    height: block.height,
    lines,
    rowH: block.rowH,
    cx,
    cy,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../types.js").UserDrawing} drawing
 * @param {(t: number) => number | null} timeToX
 * @param {(p: number) => number | null} priceToY
 * @param {number} right
 * @param {{ isSelected?: boolean, precision?: number, bars?: { close?: number }[] }} state
 */
export function renderPositionDrawing(ctx, drawing, timeToX, priceToY, right, state = {}) {
  const geom = positionGeometry(drawing);
  if (!geom) return;

  const x1 = timeToX(geom.tStart);
  const x2 = timeToX(geom.tEnd);
  const yEntry = priceToY(geom.entryPrice);
  const yTarget = priceToY(geom.targetPrice);
  const yStop = priceToY(geom.stopPrice);
  if (x1 == null || x2 == null || yEntry == null || yTarget == null || yStop == null) return;

  const { left, width } = positionScreenBounds(geom, x1, x2);
  const top = Math.min(yTarget, yStop);
  const bottom = Math.max(yTarget, yStop);
  const profitColor = drawing.profitColor ?? TV_PROFIT_FILL;
  const stopColor = drawing.stopColor ?? TV_STOP_FILL;
  const fontSize = drawing.fontSize ?? PILL_FONT_SIZE;
  const precision = state.precision ?? 2;
  const fields = resolvePositionStatsFields(drawing);
  const values = computePositionStatValues(drawing, precision, state.bars);
  const cx = left + width / 2;
  const showStats = shouldShowPositionStats(drawing, state);

  ctx.save();

  ctx.fillStyle = profitColor;
  ctx.fillRect(left, Math.min(yEntry, yTarget), width, Math.abs(yEntry - yTarget));
  ctx.fillStyle = stopColor;
  ctx.fillRect(left, Math.min(yEntry, yStop), width, Math.abs(yEntry - yStop));

  ctx.strokeStyle = TV_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, width, bottom - top);

  if (showStats) {
    const targetLabel = buildPositionZoneLabel(fields, values, "target");
    const stopLabel = buildPositionZoneLabel(fields, values, "stop");
    const profitFarY = geom.isLong ? Math.min(yEntry, yTarget) : Math.max(yEntry, yTarget);
    const stopFarY = geom.isLong ? Math.max(yEntry, yStop) : Math.min(yEntry, yStop);

    if (targetLabel) {
      const anchor = geom.isLong ? "bottom" : "top";
      const edgeY = geom.isLong ? profitFarY - PILL_OUTSIDE_GAP : profitFarY + PILL_OUTSIDE_GAP;
      drawEdgePill(ctx, targetLabel, cx, edgeY, TV_PROFIT_PILL, anchor, fontSize);
    }
    if (stopLabel) {
      const anchor = geom.isLong ? "top" : "bottom";
      const edgeY = geom.isLong ? stopFarY + PILL_OUTSIDE_GAP : stopFarY - PILL_OUTSIDE_GAP;
      drawEdgePill(ctx, stopLabel, cx, edgeY, TV_STOP_PILL, anchor, fontSize);
    }

    const centerLines = buildPositionCenterStatLines(fields, values);
    const yStats = priceToY(positionStatsCenterPrice(geom));
    const layout = layoutPositionCenterStats(
      { x: left, y: yEntry },
      { x: left + width, y: yEntry },
      centerLines,
      fontSize,
      yStats ?? undefined,
    );
    if (layout) {
      const plRaw = values.openClosedPLRaw ?? 0;
      const badgeBg = plRaw > 0 ? TV_PROFIT_PILL : plRaw < 0 ? TV_STOP_PILL : "rgba(55, 58, 68, 0.96)";
      drawPillBlock(ctx, layout, badgeBg, fontSize);
    }
  }

  ctx.restore();
}
