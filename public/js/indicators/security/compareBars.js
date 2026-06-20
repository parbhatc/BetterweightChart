import { alignUtcBarsByChartTime } from "../math/pivots.js";
import { createBool, createSymbol } from "../builders.js";
import { compareSymbol } from "./compareSymbol.js";

/** @param {string} section @param {object} [extra] */
export function compareSymbolInputs(section = "Symbols", extra = {}) {
  return [
    createBool("autoCompare", "Auto-detect compare symbol", true, { section, ...extra }),
    createSymbol("compareSymbol", "Compare symbol", "ES", {
      section,
      disabled: (inputs) => inputs.autoCompare !== false,
      ...extra,
    }),
  ];
}

/** @param {object[]} aligned */
function countAligned(aligned) {
  let covered = 0;
  for (const bar of aligned) {
    if (bar) covered += 1;
  }
  return covered;
}

/**
 * @param {object} ctx
 * @param {object} inputs
 * @param {object[]} chartBars
 * @param {number} barCount
 * @param {number} minCovered
 */
export function ensureCompareAligned(ctx, inputs, chartBars, barCount, minCovered) {
  const compare = compareSymbol.resolve(inputs, ctx.primarySymbol ?? ctx.symbol);
  const cmp = ctx.getCompareBars?.(compare, ctx.chartResolution);
  if (!cmp?.utcBars?.length || cmp.utcBars.length !== cmp.chartBars?.length) {
    ctx.requestCompareBars?.(compare, barCount);
    return { ready: false, compare };
  }
  const aligned = alignUtcBarsByChartTime(chartBars, cmp.utcBars, cmp.chartBars);
  const covered = countAligned(aligned);
  if (covered < minCovered) {
    ctx.requestCompareBars?.(compare, barCount);
    return { ready: false, compare, aligned, covered };
  }
  return { ready: true, compare, aligned, covered };
}

/**
 * @param {object} ctx
 * @param {object} inputs
 * @param {{ ohlc?: boolean, tailTime?: boolean }} [opts]
 */
export function compareBarsRecomputeKey(ctx, inputs, opts = {}) {
  const compare = compareSymbol.resolve(inputs, ctx.primarySymbol ?? ctx.symbol);
  const cmp = ctx.getCompareBars?.(compare, ctx.chartResolution);
  const len = cmp?.utcBars?.length ?? 0;
  const tail = cmp?.utcBars?.at(-1);
  if (opts.ohlc) {
    const ohlc = tail ? `${tail.open}|${tail.high}|${tail.low}|${tail.close}` : "";
    return `${compare}|${len}|${ohlc}`;
  }
  if (opts.tailTime !== false) {
    return `${compare}|${len}|${tail?.time ?? ""}`;
  }
  return `${compare}|${len}`;
}
