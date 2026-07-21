import { resolveHtfSeries } from "./htfAccess.js";
import { getHtfBars, getHtfSeriesVersion, htfCacheStaleForAnchor } from "../../app/bar/htfBarCache.js";
import { resolutionSec } from "../../chart/resolutions.js";

/** Re-export for indicators; canonical copy lives in htfAccess. */
export { htfBarCompleteAt } from "./htfAccess.js";

/** @param {object} inputs @param {number} [fallback] */
export function requiredHtfBars(inputs, fallback = 300) {
  return Math.max(10, Number(inputs.maxBarsBack) || fallback);
}

/**
 * HTF bars needed to cover the visible chart window for one timeframe.
 * @param {object} inputs
 * @param {number} chartBarCount
 * @param {string} chartResolution
 * @param {number} tfSec
 */
export function requiredHtfBarsForLayer(inputs, chartBarCount, chartResolution, tfSec) {
  const maxBack = requiredHtfBars(inputs);
  const chartSec = Math.max(1, resolutionSec(chartResolution) || 60);
  if (!tfSec || tfSec <= chartSec) return Math.min(maxBack, 20);
  // Request the full lookback so pivots match what the same TF's native chart would detect,
  // not just enough bars to cover the current viewport.
  return maxBack;
}

/**
 * HTF bars needed to cover the visible chart window (max across enabled HTFs).
 * @param {object} inputs
 * @param {number} chartBarCount
 * @param {string} chartResolution
 * @param {{ tfId: string, tfSec: number }[]} [enabledHtfs]
 */
export function requiredHtfBarsForViewport(inputs, chartBarCount, chartResolution, enabledHtfs) {
  let need = 20;
  for (const { tfSec } of enabledHtfs ?? []) {
    need = Math.max(need, requiredHtfBarsForLayer(inputs, chartBarCount, chartResolution, tfSec));
  }
  return need;
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
  const chartSec = Math.max(1, resolutionSec(chartResolution) || 60);
  const sessionDayBars = Math.ceil((30 * 3600) / chartSec);
  return Math.max(base, sessionDayBars);
}

/**
 * @param {object} ctx
 * @param {string} symbol
 * @param {string[]} tfIds
 * @param {number} barsNeeded fallback when perTfWant omits a layer
 * @param {{ strict?: boolean, perTfWant?: Record<string, number> }} [opts]
 */
export function htfPendingForLayers(ctx, symbol, tfIds, barsNeeded, opts = {}) {
  if (!tfIds.length) return false;
  const strict = opts.strict === true;
  const perTf = opts.perTfWant;
  const replayAnchor =
    typeof ctx.getPlaybackAnchorSec === "function"
      ? ctx.getPlaybackAnchorSec(ctx.chartResolution ?? "")
      : ctx.replayAnchorSec ?? null;
  const replayHost =
    ctx.replayHostControlled === true ||
    (typeof ctx.isReplayLocked === "function" && ctx.isReplayLocked());
  const chartSec = resolutionSec(ctx.chartResolution ?? "") ?? null;
  let pending = false;
  for (const tfId of tfIds) {
    const want = Math.max(10, Number(perTf?.[tfId] ?? barsNeeded) || 300);
    const minStart = strict ? want : Math.min(50, want);
    const tfSec = resolutionSec(tfId);
    const confirmedOnly = tfSec != null && chartSec != null && tfSec > chartSec;

    // ponytail: replay host with a fresh cache never re-fetches mid-playback
    const stored = getHtfBars(symbol, tfId);
    if (
      replayHost &&
      replayAnchor != null &&
      stored?.utcBars?.length &&
      !htfCacheStaleForAnchor(symbol, tfId, replayAnchor, { confirmedOnly })
    ) {
      continue;
    }

    // resolveHtfSeries fires the fetch request when short and not exhausted.
    const series = resolveHtfSeries(ctx, symbol, tfId, want);
    if (!series.pending) continue;
    if (
      !strict &&
      (series.utcBars.length >= minStart || (stored?.utcBars?.length ?? 0) >= minStart)
    ) {
      continue;
    }
    pending = true;
  }
  return pending;
}

/** @param {object} ctx @param {string} symbol @param {string[]} tfIds */
export function htfSeriesRecomputeKey(ctx, symbol, tfIds) {
  return tfIds
    .map((tfId) => {
      const hit = resolveHtfSeries(ctx, symbol, tfId, 0, { request: false });
      const first = hit.utcBars[0];
      const last = hit.utcBars.at(-1);
      // Store version catches ANY store mutation (mid-series replaces with equal
      // endpoints included); head/tail times + last OHLC additionally capture
      // anchor-sliced reads and the chart-derived forming bucket.
      const version = getHtfSeriesVersion(symbol, tfId);
      return `${tfId}:v${version}:${hit.utcBars.length}:${hit.source}:${first?.time ?? ""}:${last?.time ?? ""}:${last?.high ?? ""},${last?.low ?? ""},${last?.close ?? ""}`;
    })
    .join(",");
}
