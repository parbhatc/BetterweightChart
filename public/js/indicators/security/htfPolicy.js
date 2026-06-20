import { getSecuritySeries, requestSecuritySeries } from "./htfAccess.js";

/** @param {object} inputs @param {number} [fallback] */
export function requiredHtfBars(inputs, fallback = 300) {
  return Math.max(10, Number(inputs.maxBarsBack) || fallback);
}

/** @param {{ tfId: string }[]} enabledHtfs @param {object} inputs @param {number} [fallback] */
export function requiredChartBarsWhenNoHtf(enabledHtfs, inputs, fallback = 300) {
  if (enabledHtfs.length) return 0;
  return requiredHtfBars(inputs, fallback);
}

/**
 * @param {object} ctx
 * @param {string} symbol
 * @param {string[]} tfIds
 * @param {number} barsNeeded
 */
export function htfPendingForLayers(ctx, symbol, tfIds, barsNeeded) {
  if (!tfIds.length) return false;
  let pending = false;
  for (const tfId of tfIds) {
    const hit =
      ctx.lookupSecurity?.(symbol, tfId, barsNeeded) ??
      (() => {
        const series = getSecuritySeries(ctx, symbol, tfId);
        if (!series?.utcBars?.length) return null;
        return { ...series, sufficient: series.utcBars.length >= barsNeeded };
      })();
    if (hit?.utcBars?.length && hit.sufficient) continue;
    requestSecuritySeries(ctx, symbol, tfId, barsNeeded);
    pending = true;
  }
  return pending;
}

/** @param {object} ctx @param {string} symbol @param {string[]} tfIds */
export function htfSeriesRecomputeKey(ctx, symbol, tfIds) {
  return tfIds
    .map((tfId) => {
      const hit = getSecuritySeries(ctx, symbol, tfId);
      return `${tfId}:${hit?.utcBars?.length ?? 0}:${hit?.source ?? ""}`;
    })
    .join(",");
}
