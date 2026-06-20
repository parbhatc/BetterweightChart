export const DEFAULT_INITIAL_COUNT_BACK = 500;
/** Scroll-back chunk cap — TV prefetches smaller batches than the first load. */
export const DEFAULT_HISTORY_CHUNK = 200;
export const COUNT_BACK_MIN = 50;
export const COUNT_BACK_MAX = 2000;

/**
 * Estimate bars needed from chart viewport (TV derives countBack from pixel width / bar spacing).
 * @param {object} pane
 * @param {number} [fallback]
 */
export function estimateCountBackFromViewport(pane, fallback = DEFAULT_INITIAL_COUNT_BACK) {
  const chart = pane?.chart;
  const el = pane?.el;
  if (!chart || !el) return fallback;

  const width = el.clientWidth || 800;
  const barSpacing = chart.timeScale().options().barSpacing ?? 6;
  const rightOffset = chart.timeScale().options().rightOffset ?? 8;
  const visibleBars = Math.max(1, Math.ceil(width / Math.max(barSpacing, 1)));
  // Screen fill + right offset whitespace + history buffer beyond left edge.
  const want = visibleBars + rightOffset + 80;
  return Math.min(COUNT_BACK_MAX, Math.max(COUNT_BACK_MIN, want));
}

/**
 * countBack for scrolling left — visible window + edge margin, capped by historyChunk.
 * @param {import("lightweight-charts").IChartApi | undefined} chart
 * @param {number} maxChunk
 * @param {number} [edgeMargin]
 */
export function estimateHistoryCountBack(chart, maxChunk = DEFAULT_HISTORY_CHUNK, edgeMargin = 80) {
  if (!chart) return maxChunk;
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range) return maxChunk;
  const visible = Math.max(1, Math.ceil(range.to - range.from));
  const want = visible + edgeMargin;
  return Math.min(maxChunk, Math.max(COUNT_BACK_MIN, want));
}

/**
 * Build getBars period params for history requests.
 * TV sends from + to (Unix seconds) and countBack together on every request.
 *
 * @param {object} opts
 * @param {number} opts.barSec resolution in seconds
 * @param {number} opts.countBack
 * @param {number} opts.to right-edge bar time (seconds)
 * @param {boolean} [opts.firstDataRequest]
 */
export function buildTvPeriodParams({ barSec, countBack, to, firstDataRequest = false }) {
  const sec = Math.max(1, Number(barSec) || 60);
  const n = Math.max(1, Number(countBack) || 1);
  const end = Number(to);
  const from = end - (n - 1) * sec;
  return {
    from,
    to: end,
    countBack: n,
    firstDataRequest: Boolean(firstDataRequest),
  };
}

/**
 * Align a Unix timestamp down to the resolution boundary.
 * @param {number} [nowSec]
 * @param {number} barSec
 */
export function alignBarTime(nowSec = Date.now() / 1000, barSec) {
  const sec = Math.max(1, Number(barSec) || 60);
  return Math.floor(nowSec / sec) * sec;
}

/**
 * Initial history request (firstDataRequest).
 * @param {number} barSec
 * @param {number} countBack
 */
export function buildInitialPeriodParams(barSec, countBack, toTime) {
  const to =
    toTime != null && Number.isFinite(toTime)
      ? Number(toTime)
      : alignBarTime(Date.now() / 1000, barSec);
  return buildTvPeriodParams({ barSec, countBack, to, firstDataRequest: true });
}

/**
 * Older history before the first loaded bar.
 * `from` is informational; server uses `to` + countBack (before-cursor), not a calendar window.
 * @param {number} firstBarTime
 * @param {number} barSec
 * @param {number} countBack
 */
export function buildPrependPeriodParams(firstBarTime, barSec, countBack) {
  const sec = Math.max(1, Number(barSec) || 60);
  const to = Number(firstBarTime) - sec;
  const params = buildTvPeriodParams({ barSec: sec, countBack, to, firstDataRequest: false });
  return params;
}
