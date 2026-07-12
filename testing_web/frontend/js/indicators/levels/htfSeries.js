import { resolveHtfSeries } from "/js/indicators/security/htfAccess.js";
import { htfBarCompleteAt } from "/js/indicators/security/htfPolicy.js";

/**
 * Drop HTF buckets not yet confirmed at replay/chart anchor (avoids flash pivots on forming bars).
 * @param {object[]} agg
 * @param {(number | undefined)[]} chartTimes
 * @param {number} tfSec
 * @param {number | null | undefined} anchorUnix
 */
export function filterAggConfirmedAt(agg, chartTimes, tfSec, anchorUnix) {
  if (anchorUnix == null || !agg.length) return { agg, chartTimes };
  const out = [];
  const outTimes = [];
  for (let i = 0; i < agg.length; i++) {
    if (htfBarCompleteAt(agg[i].time, tfSec) <= anchorUnix) {
      out.push(agg[i]);
      outTimes.push(chartTimes[i]);
    }
  }
  return { agg: out, chartTimes: outTimes };
}

/**
 * Resolve HTF OHLC series — native datafeed bars when available.
 * @param {object} cfg
 * @param {object[]} chartUtcBars 1m (or chart) UTC bars
 * @param {object[]} chartBars aligned chart times
 * @param {object} opts
 */
export function resolveHtfAggSeries(cfg, chartUtcBars, chartBars, opts) {
  const chartSec = Math.max(1, Number(opts.chartSec) || 60);
  const maxBack = Math.max(10, Number(opts.maxBarsBack) || 300);
  const anchorUnix = opts.anchorUnix ?? chartUtcBars.at(-1)?.time ?? null;
  /** @param {object[]} series @param {(number | undefined)[]} times */
  const trimToWindow = (series, times) => {
    const agg = series.length > maxBack ? series.slice(-maxBack) : series;
    const chartTimes = times.length > maxBack ? times.slice(-maxBack) : times;
    return { agg, chartTimes };
  };

  // ponytail: replay uses datafeed HTF so 1m/15m/1H labels match across TF switches
  if (cfg.tfSec <= chartSec && !opts.preferDatafeedHtf) {
    const chartTimes = chartBars.map((b) => b.time);
    let { agg, chartTimes: times } = trimToWindow(chartUtcBars, chartTimes);
    if (anchorUnix != null) {
      ({ agg, chartTimes: times } = filterAggConfirmedAt(agg, times, cfg.tfSec, anchorUnix));
    }
    return { agg, chartTimes: times, source: "chart" };
  }

  const htf = resolveHtfSeries(opts, opts.symbol, cfg.tfId, maxBack, { request: false });
  if (htf.utcBars.length) {
    const series = htf.utcBars;
    // Datafeed-fetched entries store UTC copies as chartBars (no tz alignment).
    // Leave chartTimes undefined so overlay mapping falls back to
    // mapUtcTimeToChartTime against the pane's own bars.
    const utcCopyChartBars =
      htf.chartBars === htf.utcBars ||
      (htf.chartBars?.[0]?.time === series[0]?.time &&
        htf.chartBars?.at(-1)?.time === series.at(-1)?.time);
    const times = series.map((_, i) => (utcCopyChartBars ? undefined : htf.chartBars[i]?.time));
    // Filter to confirmed-at-anchor FIRST, then trim to maxBack — trimming first can
    // leave a window dominated by not-yet-confirmed buckets and drop real levels.
    let { agg, chartTimes } = filterAggConfirmedAt(series, times, cfg.tfSec, anchorUnix);
    ({ agg, chartTimes } = trimToWindow(agg, chartTimes));
    return { agg, chartTimes, source: htf.source ?? "htf" };
  }

  return { agg: [], chartTimes: [], source: "pending" };
}
