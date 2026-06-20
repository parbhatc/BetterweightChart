import { getPaneChartView } from "../chart/pane/viewCache.js";

/**
 * Scroll the chart so a trade bar (chart-time) is centered in view.
 *
 * @param {object} pane
 * @param {number} chartTime
 * @param {object} opts
 * @param {import("../ui/chart/settings.js").ReturnType<typeof import("../ui/chart/settings.js").createChartSettings>} opts.settingsStore
 * @param {object | null} [opts.symbolInfo]
 * @param {object[]} [opts.resolutions]
 */
export function scrollPaneToBarTime(pane, chartTime, opts) {
  if (!pane?.chart || chartTime == null || !Number.isFinite(chartTime)) return false;

  const view = getPaneChartView(
    pane,
    opts.settingsStore,
    opts.symbolInfo ?? pane.symbolInfo,
    opts.resolutions ?? [],
  );
  const { chartBars, utcBars } = view;
  if (!chartBars.length) return false;

  let idx = chartBars.findIndex((b) => b.time === chartTime);
  if (idx < 0) {
    let lo = 0;
    let hi = chartBars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (chartBars[mid].time < chartTime) lo = mid + 1;
      else hi = mid;
    }
    idx = lo;
  }

  const ts = pane.chart.timeScale();
  const range = ts.getVisibleLogicalRange();
  const width =
    range && Number.isFinite(range.to) && Number.isFinite(range.from)
      ? Math.max(20, range.to - range.from)
      : 80;
  const from = Math.max(0, idx - width * 0.42);
  ts.setVisibleLogicalRange({ from, to: from + width });

  const bar = chartBars[idx];
  const utcBar = utcBars[idx];
  if (bar && utcBar && typeof pane.chart.setCrosshairPosition === "function") {
    const price = utcBar.close ?? utcBar.open;
    if (price != null && Number.isFinite(price)) {
      pane.chart.setCrosshairPosition(price, bar.time, pane.series);
    }
  }

  return true;
}
