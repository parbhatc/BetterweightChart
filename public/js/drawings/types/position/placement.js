import { measureVisiblePriceRange } from "../../../chart/coords/timeScale.js";
import { DEFAULT_POSITION_DURATION_SEC, VIEWPORT_RISK_FRACTION } from "./constants.js";

/** @param {number} precision */
export function tickSizeForPrecision(precision) {
  return 10 ** -Math.max(0, precision);
}

/**
 * Snap a price distance to whole ticks (minimum 1 tick).
 * @param {number} distance
 * @param {number} tick
 */
function snapDistanceToTicks(distance, tick) {
  if (!Number.isFinite(distance) || tick <= 0) return distance;
  const ticks = Math.max(1, Math.round(distance / tick));
  return ticks * tick;
}

/**
 * Default target/stop distance from entry — scales with visible price range (zoom level).
 * @param {number} entryPrice
 * @param {{
 *   bars?: { high?: number, low?: number, close?: number }[],
 *   visiblePriceRange?: number | null,
 *   precision?: number,
 *   chart?: import("lightweight-charts").IChartApi,
 *   series?: import("lightweight-charts").ISeriesApi,
 * }} [ctx]
 */
export function defaultRiskDistance(entryPrice, ctx = {}) {
  const precision = ctx.precision ?? 2;
  const tick = tickSizeForPrecision(precision);
  const minDist = tick;

  let visibleRange = ctx.visiblePriceRange;
  if ((visibleRange == null || visibleRange <= 0) && ctx.chart && ctx.series) {
    visibleRange = measureVisiblePriceRange(ctx.chart, ctx.series);
  }

  let dist;
  if (visibleRange != null && visibleRange > 0) {
    dist = visibleRange * VIEWPORT_RISK_FRACTION;
  } else if (ctx.bars?.length >= 2) {
    const recent = ctx.bars.slice(-10);
    let sum = 0;
    let count = 0;
    for (const bar of recent) {
      const hi = bar.high ?? bar.close ?? entryPrice;
      const lo = bar.low ?? bar.close ?? entryPrice;
      const range = hi - lo;
      if (range > 0) {
        sum += range;
        count += 1;
      }
    }
    dist = count > 0 ? sum / count : entryPrice * 0.001;
  } else {
    dist = Math.max(entryPrice * 0.001, tick);
  }

  if (visibleRange != null && visibleRange > 0) {
    dist = Math.min(dist, visibleRange * 0.35);
  }

  return snapDistanceToTicks(Math.max(minDist, dist), tick);
}

/**
 * Build corner points for a one-click 1:1 RR position.
 * @param {"long-position" | "short-position"} type
 * @param {{ time: number, price: number }} entry
 * @param {{ bars?: { high?: number, low?: number, close?: number }[], barSec?: number, durationSec?: number, precision?: number, visiblePriceRange?: number | null, chart?: import("lightweight-charts").IChartApi, series?: import("lightweight-charts").ISeriesApi }} [ctx]
 */
export function buildOneClickPosition(type, entry, ctx = {}) {
  const isLong = type === "long-position";
  const durationSec = ctx.durationSec ?? DEFAULT_POSITION_DURATION_SEC;
  const risk = defaultRiskDistance(entry.price, ctx);
  const targetPrice = isLong ? entry.price + risk : entry.price - risk;
  const stopPrice = isLong ? entry.price - risk : entry.price + risk;
  const tStart = entry.time;
  const tEnd = entry.time + durationSec;

  return {
    points: [
      { time: tStart, price: targetPrice },
      { time: tEnd, price: stopPrice },
    ],
    positionEntryPrice: entry.price,
  };
}
