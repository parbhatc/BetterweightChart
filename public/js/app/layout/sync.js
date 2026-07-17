/**
 * Layout sync helpers for multi-pane charts.
 * @param {object} deps
 */
export function createLayoutSync(deps) {
  /** Chart currently driving a date-range update to its peers. */
  let dateRangeSyncSource = null;
  /** Latest source update received before the current animation frame ends. */
  let pendingDateRangeRequest = null;
  let dateRangeReleaseRaf = null;
  let crosshairSyncing = false;
  const lastSyncedLogicalRange = new WeakMap();

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

  function syncLayoutDateRangeFrom(sourceChart, liveLogicalRange) {
    const layoutManager = deps.getLayoutManager?.() ?? deps.layoutManager;
    if (!layoutManager?.getSync().dateRange) return;
    if (dateRangeSyncSource) {
      // Ignore callbacks caused by updating a peer, but retain newer movement
      // from the chart the user is actively panning instead of dropping it.
      if (sourceChart === dateRangeSyncSource) {
        pendingDateRangeRequest = { sourceChart, liveLogicalRange };
      }
      return;
    }
    if (deps.isBarsLoading?.()) return;
    if (deps.isHistoryRestorePending?.()) return;

    const sourcePane = layoutPanes().find((p) => p.chart === sourceChart);
    if (!sourcePane?.bars?.length) return;

    const isPanning = Boolean(deps.isChartPanning?.());
    const activePane = deps.getActivePane?.();
    if (isPanning && activePane?.chart && activePane.chart !== sourceChart) return;

    const ts = sourceChart.timeScale();
    const timeRange = ts.getVisibleRange?.();
    const logicalRange = isValidLogicalRange(liveLogicalRange)
      ? liveLogicalRange
      : ts.getVisibleLogicalRange();
    const previousLogicalRange = lastSyncedLogicalRange.get(sourceChart);
    const logicalDelta =
      isPanning && isValidLogicalRange(previousLogicalRange) && isValidLogicalRange(logicalRange)
        ? {
            from: logicalRange.from - previousLogicalRange.from,
            to: logicalRange.to - previousLogicalRange.to,
          }
        : null;
    // Lightweight Charts can report a stale time range until pointer-up. Use
    // the event's live logical movement while dragging, then exact time sync
    // resumes automatically after the gesture ends.
    const useTime = !isPanning && isValidTimeRange(timeRange);
    const useLogical = isValidLogicalRange(logicalRange);
    if (!useTime && !useLogical) return;

    dateRangeSyncSource = sourceChart;
    try {
      for (const pane of layoutPanes()) {
        if (pane.chart === sourceChart || !pane.bars?.length) continue;
        const targetTs = pane.chart.timeScale();
        try {
          const targetLogical = targetTs.getVisibleLogicalRange();
          if (logicalDelta && isValidLogicalRange(targetLogical)) {
            const nextLogical = {
              from: targetLogical.from + logicalDelta.from,
              to: targetLogical.to + logicalDelta.to,
            };
            targetTs.setVisibleLogicalRange(nextLogical);
            lastSyncedLogicalRange.set(pane.chart, nextLogical);
          } else if (useTime && targetTs.setVisibleRange) {
            targetTs.setVisibleRange(timeRange);
            const applied = targetTs.getVisibleLogicalRange();
            if (isValidLogicalRange(applied)) {
              lastSyncedLogicalRange.set(pane.chart, applied);
            }
          } else if (useLogical) {
            targetTs.setVisibleLogicalRange(logicalRange);
            lastSyncedLogicalRange.set(pane.chart, logicalRange);
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
      if (useLogical) lastSyncedLogicalRange.set(sourceChart, logicalRange);
    } finally {
      if (dateRangeReleaseRaf == null) {
        dateRangeReleaseRaf = requestAnimationFrame(() => {
          dateRangeReleaseRaf = null;
          const pending = pendingDateRangeRequest;
          pendingDateRangeRequest = null;
          dateRangeSyncSource = null;
          if (pending) {
            syncLayoutDateRangeFrom(pending.sourceChart, pending.liveLogicalRange);
          }
        });
      }
    }
  }

  /**
   * @param {import("lightweight-charts").IChartApi} sourceChart
   * @param {import("lightweight-charts").ISeriesApi} sourceSeries
   * @param {import("lightweight-charts").MouseEventParams} param
   */
  function syncLayoutCrosshairFrom(sourceChart, sourceSeries, param) {
    const layoutManager = deps.getLayoutManager?.() ?? deps.layoutManager;
    if (crosshairSyncing || !layoutManager?.getSync().crosshair) return;
    crosshairSyncing = true;
    try {
      for (const pane of layoutPanes()) {
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
        crosshairSyncing = false;
      });
    }
  }

  /** @param {import("lightweight-charts").IChartApi} paneChart */
  function wireLayoutPaneSync(paneChart) {
    const timeScale = paneChart.timeScale();
    const initialRange = timeScale.getVisibleLogicalRange();
    if (isValidLogicalRange(initialRange)) {
      lastSyncedLogicalRange.set(paneChart, initialRange);
    }
    timeScale.subscribeVisibleLogicalRangeChange((logicalRange) => {
      syncLayoutDateRangeFrom(paneChart, logicalRange);
    });
  }

  return { syncLayoutDateRangeFrom, syncLayoutCrosshairFrom, wireLayoutPaneSync };
}
