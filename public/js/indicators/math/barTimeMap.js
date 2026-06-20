/**
 * Map UTC unix to chart display time via aligned bar arrays (floor bracket).
 * @param {number} utc
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 */
export function mapUtcTimeToChartTime(utc, utcBars, chartBars) {
  if (utc == null || !Number.isFinite(Number(utc)) || !utcBars?.length || !chartBars?.length) {
    return utc;
  }
  const t = Number(utc);
  if (t <= utcBars[0].time) return chartBars[0]?.time ?? t;
  const last = utcBars.length - 1;
  if (t >= utcBars[last].time) return chartBars[last]?.time ?? t;

  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (utcBars[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return chartBars[lo]?.time ?? t;
}
