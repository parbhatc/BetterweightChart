import { getSecuritySeries, requestSecuritySeries } from "./htfAccess.js";

import { resolutionSec } from "/js/chart/resolutions.js";

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
 * Chart bars needed for session-style levels that scan the pane series (not HTF security).
 * Sessions use ET clock windows and may start the prior evening (e.g. Asia), so load ~30h of data.
 * @param {object} inputs
 * @param {boolean} [sessionsEnabled]
 * @param {string} [chartResolution]
 * @param {number} [fallback]
 */
export function requiredChartBarsForSessions(inputs, sessionsEnabled, chartResolution = "1", fallback = 300) {
  if (!sessionsEnabled) return 0;
  const base = requiredHtfBars(inputs, fallback);
  const chartSec = Math.max(60, resolutionSec(chartResolution) || 60);
  const sessionDayBars = Math.ceil((30 * 3600) / chartSec);
  return Math.max(base, sessionDayBars);
}

/**
 * @param {object} ctx
 * @param {string} symbol
 * @param {string[]} tfIds
 * @param {number} barsNeeded
 */
export function htfPendingForLayers(ctx, symbol, tfIds, barsNeeded) {
  if (!tfIds.length) return false;
  const want = Math.max(10, Number(barsNeeded) || 300);
  const minStart = Math.min(50, want);
  let pending = false;
  for (const tfId of tfIds) {
    const hit =
      ctx.lookupSecurity?.(symbol, tfId, want) ??
      (() => {
        const series = getSecuritySeries(ctx, symbol, tfId);
        if (!series?.utcBars?.length) return null;
        return { ...series, sufficient: series.utcBars.length >= want };
      })();
    if (hit?.utcBars?.length >= minStart) {
      if (!hit.sufficient) requestSecuritySeries(ctx, symbol, tfId, want);
      continue;
    }
    requestSecuritySeries(ctx, symbol, tfId, want);
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
