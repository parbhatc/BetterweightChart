import { getIndicatorClass } from "../catalog.js";
import { isIndicatorVisibleOnResolution } from "../visibility.js";
import { rafThrottle } from "../../chart/pan/perf.js";
import { assignStudyLwcPanes, syncAllStudyPanes } from "../studyPane.js";

/**
 * @param {object} deps
 * @param {() => object[]} deps.getAllChartPanes
 * @param {(paneIndex: number) => object | undefined} deps.paneByIndex
 * @param {() => Map<string, import("../types.js").IndicatorInstance>} deps.getInstances
 * @param {(paneIndex: number) => import("../types.js").IndicatorInstance[]} deps.indicatorsForPane
 * @param {(instance: import("../types.js").IndicatorInstance) => void} deps.destroySeries
 * @param {(instance: import("../types.js").IndicatorInstance) => void} deps.ensureSeries
 * @param {(pane: object) => void} deps.syncPaneVolumeMargins
 * @param {(pane: object) => void} deps.rebuildStudyScaleLocks
 * @param {(instance: import("../types.js").IndicatorInstance, Indicator: typeof import("../BaseIndicator.js").BaseIndicator) => void} deps.syncStudyPaneScale
 * @param {(paneIndex: number) => void} deps.refreshOverlaysForPaneNow
 * @param {() => void} deps.emit
 */
export function createRefresh(deps) {
  const {
    getAllChartPanes,
    paneByIndex,
    getInstances,
    indicatorsForPane,
    destroySeries,
    ensureSeries,
    syncPaneVolumeMargins,
    rebuildStudyScaleLocks,
    syncStudyPaneScale,
    refreshOverlaysForPaneNow,
    emit,
  } = deps;

  /** @param {import("../types.js").IndicatorInstance} instance */
  function refreshInstance(instance) {
    const pane = paneByIndex(instance.paneIndex);
    if (!pane) return;
    const visible =
      isIndicatorVisibleOnResolution(pane.resolution, instance.visibility) &&
      (instance.inputs.timeframe == null ||
        instance.inputs.timeframe === "chart" ||
        instance.inputs.timeframe === pane.resolution);
    if (!visible) {
      destroySeries(instance);
      return;
    }
    ensureSeries(instance);
  }

  function refreshAll() {
    for (const instance of getInstances().values()) refreshInstance(instance);
    for (const pane of getAllChartPanes()) syncPaneVolumeMargins(pane);
    emit();
  }

  /** @param {number} paneIndex */
  function paneHasPlotSeriesIndicators(paneIndex) {
    for (const inst of getInstances().values()) {
      if (inst.paneIndex !== paneIndex || inst.hidden) continue;
      const Indicator = getIndicatorClass(inst.defId);
      if (!Indicator || Indicator.overlayPrimitive) continue;
      return true;
    }
    return false;
  }

  /** @param {number} [paneIndex] */
  function refreshOverlaysImmediate(paneIndex) {
    if (paneIndex == null) {
      for (const pane of getAllChartPanes()) refreshOverlaysForPaneNow(pane.index);
    } else {
      refreshOverlaysForPaneNow(paneIndex);
    }
    emit();
  }

  /** @param {number} [paneIndex] */
  function refreshPaneData(paneIndex) {
    if (paneIndex == null) {
      refreshPaneImmediate();
      return;
    }
    if (paneHasPlotSeriesIndicators(paneIndex)) {
      refreshPaneImmediate(paneIndex);
    } else {
      refreshOverlaysImmediate(paneIndex);
    }
  }

  /** @param {number} [paneIndex] */
  function refreshPaneNow(paneIndex) {
    const paneIndexes =
      paneIndex == null ? getAllChartPanes().map((p) => p.index) : [paneIndex];

    for (const idx of paneIndexes) {
      assignStudyLwcPanes(indicatorsForPane, idx);
    }

    for (const instance of getInstances().values()) {
      if (paneIndex == null || instance.paneIndex === paneIndex) refreshInstance(instance);
    }

    for (const idx of paneIndexes) {
      const pane = paneByIndex(idx);
      if (pane) syncAllStudyPanes(pane.chart, indicatorsForPane, idx);
    }

    if (paneIndex != null) {
      const pane = paneByIndex(paneIndex);
      if (pane) {
        syncPaneVolumeMargins(pane);
        rebuildStudyScaleLocks(pane);
      }
    } else {
      for (const pane of getAllChartPanes()) {
        syncPaneVolumeMargins(pane);
        rebuildStudyScaleLocks(pane);
      }
    }
    emit();
  }

  const refreshPane = rafThrottle(refreshPaneNow);
  const refreshOverlaysForPane = rafThrottle(refreshOverlaysForPaneNow);

  /** @param {number} [paneIndex] */
  function refreshPaneImmediate(paneIndex) {
    refreshPaneNow(paneIndex);
  }

  /** @param {object} pane */
  function resyncStudyPaneScales(pane) {
    if (!pane) return;
    for (const inst of indicatorsForPane(pane.index)) {
      const Indicator = getIndicatorClass(inst.defId);
      if (Indicator?.studyPaneScale) syncStudyPaneScale(inst, Indicator);
    }
  }

  /** @param {object} pane */
  function resyncStudyPaneHeights(pane) {
    if (!pane) return;
    syncAllStudyPanes(pane.chart, indicatorsForPane, pane.index);
  }

  /** @param {object} pane */
  function refreshStudyPaneLegends(pane) {
    pane._studyLegendOverlay?.render?.();
  }

  /** @param {object} pane @param {object} overlay */
  function attachStudyLegendOverlay(pane, overlay) {
    pane._studyLegendOverlay = overlay;
  }

  return {
    refreshInstance,
    refreshAll,
    refreshPane,
    refreshPaneImmediate,
    refreshPaneData,
    refreshOverlaysImmediate,
    refreshOverlaysForPane,
    paneHasPlotSeriesIndicators,
    resyncStudyPaneScales,
    resyncStudyPaneHeights,
    refreshStudyPaneLegends,
    attachStudyLegendOverlay,
  };
}
