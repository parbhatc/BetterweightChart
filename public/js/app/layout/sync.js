/**
 * @param {{ time: number, close: number }[]} bars
 * @param {number} time
 */
function barCloseAtTime(bars, time) {
  if (!bars?.length) return undefined;
  const exact = bars.find((b) => b.time === time);
  if (exact) return exact.close;
  return bars.filter((b) => b.time <= time).at(-1)?.close;
}

/**
 * Layout sync helpers for multi-pane charts.
 * @param {object} deps
 */
export function createLayoutSync(deps) {
  let suppressLayoutSync = false;

  function layoutPanes() {
    return deps.getLayoutPanes?.() ?? deps.getLayoutCharts?.() ?? [];
  }

  /** @param {{ from?: unknown, to?: unknown } | null | undefined} range */
  function isValidTimeRange(range) {
    return (
      range != null &&
      range.from != null &&
      range.to != null &&
      Number.isFinite(range.from) &&
      Number.isFinite(range.to)
    );
  }

  /** @param {{ from?: unknown, to?: unknown } | null | undefined} range */
  function isValidLogicalRange(range) {
    return (
      range != null &&
      range.from != null &&
      range.to != null &&
      Number.isFinite(range.from) &&
      Number.isFinite(range.to)
    );
  }

  function syncLayoutDateRangeFrom(sourceChart) {
    const layoutManager = deps.getLayoutManager?.() ?? deps.layoutManager;
    if (suppressLayoutSync || !layoutManager?.getSync().dateRange) return;
    if (deps.isBarsLoading?.()) return;

    const sourcePane = layoutPanes().find((p) => p.chart === sourceChart);
    if (!sourcePane?.bars?.length) return;

    const ts = sourceChart.timeScale();
    const timeRange = ts.getVisibleRange?.();
    const logicalRange = ts.getVisibleLogicalRange();
    const useTime = isValidTimeRange(timeRange);
    const useLogical = isValidLogicalRange(logicalRange);
    if (!useTime && !useLogical) return;

    suppressLayoutSync = true;
    try {
      for (const pane of layoutPanes()) {
        if (pane.chart === sourceChart || !pane.bars?.length) continue;
        const targetTs = pane.chart.timeScale();
        try {
          if (useTime && targetTs.setVisibleRange) {
            targetTs.setVisibleRange(timeRange);
          } else if (useLogical) {
            targetTs.setVisibleLogicalRange(logicalRange);
          }
        } catch {
          if (useLogical) {
            try {
              targetTs.setVisibleLogicalRange(logicalRange);
            } catch {
              /* chart not ready */
            }
          }
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
    const sourcePane = layoutPanes().find((p) => p.chart === sourceChart);
    suppressLayoutSync = true;
    try {
      for (const pane of layoutPanes()) {
        if (pane.chart === sourceChart) continue;
        if (param?.time != null && param.point) {
          let price = sourceSeries.coordinateToPrice(param.point.y);
          if (
            sourcePane?.symbol &&
            pane.symbol &&
            pane.symbol !== sourcePane.symbol &&
            pane.bars?.length
          ) {
            price = barCloseAtTime(pane.bars, param.time) ?? price;
          }
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
