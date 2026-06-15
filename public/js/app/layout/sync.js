/**
 * Layout sync helpers for multi-pane charts.
 * @param {object} deps
 */
export function createLayoutSync(deps) {
  let suppressLayoutSync = false;

  function syncLayoutDateRangeFrom(sourceChart) {
    const layoutManager = deps.getLayoutManager?.() ?? deps.layoutManager;
    if (suppressLayoutSync || !layoutManager?.getSync().dateRange) return;
    const range = sourceChart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    suppressLayoutSync = true;
    try {
      for (const pane of deps.getLayoutCharts()) {
        if (pane.chart !== sourceChart) {
          pane.chart.timeScale().setVisibleLogicalRange(range);
        }
      }
    } finally {
      requestAnimationFrame(() => {
        suppressLayoutSync = false;
      });
    }
  }

  /**
   * @param {import("lightweight-charts").IChartApi} sourceChart
   * @param {import("lightweight-charts").ISeriesApi} sourceSeries
   * @param {import("lightweight-charts").MouseEventParams} param
   */
  function syncLayoutCrosshairFrom(sourceChart, sourceSeries, param) {
    const layoutManager = deps.getLayoutManager?.() ?? deps.layoutManager;
    if (suppressLayoutSync || !layoutManager?.getSync().crosshair) return;
    suppressLayoutSync = true;
    try {
      for (const pane of deps.getLayoutCharts()) {
        if (pane.chart === sourceChart) continue;
        if (param?.time != null && param.point) {
          const price = sourceSeries.coordinateToPrice(param.point.y);
          if (price != null) pane.chart.setCrosshairPosition(price, param.time, pane.series);
        } else {
          pane.chart.clearCrosshairPosition();
        }
      }
    } finally {
      requestAnimationFrame(() => {
        suppressLayoutSync = false;
      });
    }
  }

  /** @param {import("lightweight-charts").IChartApi} paneChart */
  function wireLayoutPaneSync(paneChart) {
    paneChart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      syncLayoutDateRangeFrom(paneChart);
    });
  }

  return { syncLayoutDateRangeFrom, syncLayoutCrosshairFrom, wireLayoutPaneSync };
}
