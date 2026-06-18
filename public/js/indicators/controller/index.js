import { getIndicatorClass } from "../catalog.js";
import { createOverlaySync } from "./overlaySync.js";
import { createSeriesSync } from "./seriesSync.js";
import { createLegendHelpers, isInstanceVisibleOnPane } from "./legend.js";
import { createRefresh } from "./refresh.js";
import { createLifecycle } from "./lifecycle.js";

/** @typedef {import("../types.js").IndicatorInstance} IndicatorInstance */

/**
 * @param {object} opts
 * @param {() => object[]} opts.getAllChartPanes
 * @param {(pane: object) => { utcBars: object[], chartBars: object[] }} opts.getPaneBars
 * @param {() => void} opts.onChange
 * @param {() => boolean} [opts.useStackedScaleLabels]
 * @param {(pane: object) => object} [opts.getOverlayContext]
 */
export function createIndicatorController(opts) {
  const { getAllChartPanes, getPaneBars, onChange, useStackedScaleLabels = () => true, getOverlayContext } =
    opts;

  /** @type {Map<string, IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }>} */
  const instances = new Map();
  /** @type {string | null} */
  let selectedId = null;

  function emit() {
    onChange?.();
  }

  /** @param {number} paneIndex */
  function paneByIndex(paneIndex) {
    return getAllChartPanes().find((p) => p.index === paneIndex);
  }

  /** @param {number} paneIndex */
  function indicatorsForPane(paneIndex) {
    return [...instances.values()].filter((i) => i.paneIndex === paneIndex);
  }

  /** @param {IndicatorInstance} instance @param {number} paneIndex */
  function isVisibleOnPane(instance, paneIndex) {
    return isInstanceVisibleOnPane(instance, paneIndex, getAllChartPanes);
  }

  const overlaySync = createOverlaySync({
    getAllChartPanes,
    getPaneBars,
    getInstances: () => instances,
    getIndicatorClass,
    isInstanceVisibleOnPane: isVisibleOnPane,
    getOverlayContext,
  });

  const seriesSync = createSeriesSync({
    getAllChartPanes,
    getPaneBars,
    getInstances: () => instances,
    indicatorsForPane,
    syncOverlayPrimitive: overlaySync.syncOverlayPrimitive,
    useStackedScaleLabels,
  });

  /** @type {{ refresh: ReturnType<typeof createRefresh> | null }} */
  const pending = { refresh: null };

  const lifecycle = createLifecycle({
    paneByIndex,
    getInstances: () => instances,
    destroySeries: seriesSync.destroySeries,
    refreshInstance: (instance) => pending.refresh?.refreshInstance(instance),
    refreshPaneImmediate: (paneIndex) => pending.refresh?.refreshPaneImmediate(paneIndex),
    refreshOverlaysImmediate: (paneIndex) => pending.refresh?.refreshOverlaysImmediate(paneIndex),
    syncPaneVolumeMargins: seriesSync.syncPaneVolumeMargins,
    rebuildStudyScaleLocks: seriesSync.rebuildStudyScaleLocks,
    collapseEmptyStudyPanes: seriesSync.collapseEmptyStudyPanes,
    emit,
    getSelectedId: () => selectedId,
    setSelectedId: (id) => {
      selectedId = id;
    },
    indicatorsForPane,
  });

  pending.refresh = createRefresh({
    getAllChartPanes,
    paneByIndex,
    getInstances: () => instances,
    indicatorsForPane,
    destroySeries: seriesSync.destroySeries,
    ensureSeries: seriesSync.ensureSeries,
    syncPaneVolumeMargins: seriesSync.syncPaneVolumeMargins,
    rebuildStudyScaleLocks: seriesSync.rebuildStudyScaleLocks,
    syncStudyPaneScale: seriesSync.syncStudyPaneScale,
    refreshOverlaysForPaneNow: overlaySync.refreshOverlaysForPaneNow,
    emit,
  });

  const legend = createLegendHelpers({
    getPaneBars,
    indicatorsForPane,
    getSelectedId: () => selectedId,
  });

  const refresh = pending.refresh;

  return {
    addIndicator: lifecycle.addIndicator,
    removeIndicator: lifecycle.removeIndicator,
    setHidden: lifecycle.setHidden,
    setSelected: lifecycle.setSelected,
    patchIndicator: lifecycle.patchIndicator,
    refreshAll: refresh.refreshAll,
    refreshPane: refresh.refreshPane,
    refreshPaneImmediate: refresh.refreshPaneImmediate,
    refreshPaneData: refresh.refreshPaneData,
    refreshOverlaysImmediate: refresh.refreshOverlaysImmediate,
    refreshOverlaysForPane: refresh.refreshOverlaysForPane,
    paneHasPlotSeriesIndicators: refresh.paneHasPlotSeriesIndicators,
    paneHasOverlayIndicators: refresh.paneHasOverlayIndicators,
    clearOverlaysForPane: overlaySync.clearOverlaysForPane,
    syncOverlayTimeCtxForPane: overlaySync.syncOverlayTimeCtxForPane,
    invalidateOverlayCacheForPane: overlaySync.invalidateOverlayCacheForPane,
    clearAll: lifecycle.clearAll,
    getIndicatorsByPane: lifecycle.getIndicatorsByPane,
    setIndicatorsByPane: lifecycle.setIndicatorsByPane,
    indicatorsForPane: lifecycle.indicatorsForPane,
    getCount: lifecycle.getCount,
    getCountForPane: lifecycle.getCountForPane,
    clearForPane: lifecycle.clearForPane,
    legendStateForPane: legend.legendStateForPane,
    studyLegendStateForLwcPane: legend.studyLegendStateForLwcPane,
    bandFillsForPane: legend.bandFillsForPane,
    scaleLabelsForPane: legend.scaleLabelsForPane,
    refreshStudyPaneLegends: refresh.refreshStudyPaneLegends,
    resyncStudyPaneHeights: refresh.resyncStudyPaneHeights,
    resyncStudyPaneScales: refresh.resyncStudyPaneScales,
    attachStudyLegendOverlay: refresh.attachStudyLegendOverlay,
    getInstance: (id) => instances.get(id) ?? null,
    getSelectedId: () => selectedId,
  };
}
