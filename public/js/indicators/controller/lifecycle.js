import { createIndicatorInstance, getIndicatorClass } from "../catalog.js";
import { clearOverlayInstanceCache } from "../overlayCache.js";

/** @typedef {import("../types.js").IndicatorInstance} IndicatorInstance */

/**
 * @param {object} deps
 * @param {(paneIndex: number) => object | undefined} deps.paneByIndex
 * @param {() => Map<string, IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }>} deps.getInstances
 * @param {(instance: IndicatorInstance) => void} deps.destroySeries
 * @param {(instance: IndicatorInstance) => void} deps.refreshInstance
 * @param {(paneIndex?: number) => void} deps.refreshPaneImmediate
 * @param {(paneIndex?: number) => void} deps.refreshOverlaysImmediate
 * @param {(pane: object) => void} deps.syncPaneVolumeMargins
 * @param {(pane: object) => void} deps.rebuildStudyScaleLocks
 * @param {(chart: import("lightweight-charts").IChartApi, chartPaneIndex: number) => void} deps.collapseEmptyStudyPanes
 * @param {() => void} deps.emit
 * @param {() => string | null} deps.getSelectedId
 * @param {(id: string | null) => void} deps.setSelectedId
 * @param {(paneIndex: number) => IndicatorInstance[]} deps.indicatorsForPane
 */
export function createLifecycle(deps) {
  const {
    paneByIndex,
    getInstances,
    destroySeries,
    refreshInstance,
    refreshPaneImmediate,
    refreshOverlaysImmediate,
    syncPaneVolumeMargins,
    rebuildStudyScaleLocks,
    collapseEmptyStudyPanes,
    emit,
    getSelectedId,
    setSelectedId,
    indicatorsForPane,
  } = deps;

  /** @param {string} defId @param {number} [paneIndex] */
  function addIndicator(defId, paneIndex = 0) {
    const inst = createIndicatorInstance(defId, paneIndex);
    if (!inst) return null;
    /** @type {IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} */
    const entry = { ...inst, series: new Map() };
    const Indicator = getIndicatorClass(defId);
    if (Indicator?.overlayPrimitive && Indicator.hasBarInit) {
      entry._initPending = true;
    }
    getInstances().set(entry.instanceId, entry);
    setSelectedId(entry.instanceId);
    refreshInstance(entry);
    refreshPaneImmediate(paneIndex);
    emit();
    return entry.instanceId;
  }

  /** @param {string} instanceId */
  function removeIndicator(instanceId) {
    const instances = getInstances();
    const inst = instances.get(instanceId);
    if (!inst) return;
    const paneIndex = inst.paneIndex;
    destroySeries(inst);
    instances.delete(instanceId);
    if (getSelectedId() === instanceId) setSelectedId(null);
    const pane = paneByIndex(paneIndex);
    if (pane) {
      syncPaneVolumeMargins(pane);
      rebuildStudyScaleLocks(pane);
      collapseEmptyStudyPanes(pane.chart, paneIndex);
    }
    emit();
  }

  /** @param {string} instanceId @param {boolean} hidden */
  function setHidden(instanceId, hidden) {
    const inst = getInstances().get(instanceId);
    if (!inst) return;
    inst.hidden = hidden;
    refreshPaneImmediate(inst.paneIndex);
    emit();
  }

  /** @param {string | null} instanceId */
  function setSelected(instanceId) {
    setSelectedId(instanceId);
    emit();
  }

  /** @param {string} instanceId @param {object} patch */
  function patchIndicator(instanceId, patch) {
    const inst = getInstances().get(instanceId);
    if (!inst) return;
    if (patch.inputs) inst.inputs = { ...inst.inputs, ...patch.inputs };
    if (patch.style) inst.style = { ...inst.style, ...patch.style };
    if (patch.visibility) inst.visibility = { ...inst.visibility, ...patch.visibility };
    if (patch.properties) inst.properties = { ...inst.properties, ...patch.properties };
    clearOverlayInstanceCache(inst);
    inst._overlayAppliedGeomKey = undefined;
    refreshInstance(inst);
    refreshPaneImmediate(inst.paneIndex);
    const Indicator = getIndicatorClass(inst.defId);
    if (Indicator?.overlayPrimitive) {
      refreshOverlaysImmediate(inst.paneIndex);
    }
    emit();
  }

  function clearAll() {
    for (const id of [...getInstances().keys()]) removeIndicator(id);
  }

  /** @returns {Record<string, IndicatorInstance[]>} */
  function getIndicatorsByPane() {
    /** @type {Record<string, IndicatorInstance[]>} */
    const byPane = {};
    for (const inst of getInstances().values()) {
      const key = String(inst.paneIndex);
      if (!byPane[key]) byPane[key] = [];
      byPane[key].push({
        instanceId: inst.instanceId,
        defId: inst.defId,
        type: inst.type,
        paneIndex: inst.paneIndex,
        inputs: structuredClone(inst.inputs),
        style: structuredClone(inst.style),
        visibility: structuredClone(inst.visibility),
        properties: structuredClone(inst.properties ?? {}),
        backtestRange: structuredClone(inst.backtestRange ?? { id: "90d" }),
        hidden: inst.hidden,
      });
    }
    return byPane;
  }

  /** @param {Record<string, IndicatorInstance[]> | null | undefined} byPane */
  function setIndicatorsByPane(byPane) {
    const instances = getInstances();
    for (const id of [...instances.keys()]) {
      const inst = instances.get(id);
      if (inst) destroySeries(inst);
    }
    instances.clear();
    setSelectedId(null);

    if (!byPane || typeof byPane !== "object") {
      emit();
      return;
    }

    for (const list of Object.values(byPane)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        if (!raw?.defId || !getIndicatorClass(raw.defId)) continue;
        const Indicator = getIndicatorClass(raw.defId);
        /** @type {IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} */
        const entry = {
          instanceId: raw.instanceId ?? `${raw.defId}_${Math.random().toString(36).slice(2, 9)}`,
          defId: raw.defId,
          type: raw.type,
          paneIndex: Number(raw.paneIndex) || 0,
          inputs: { ...raw.inputs },
          style: { ...raw.style },
          visibility: { ...raw.visibility },
          properties: { ...(Indicator?.defaultProperties?.() ?? {}), ...(raw.properties ?? {}) },
          backtestRange: raw.backtestRange ?? { id: "90d" },
          hidden: Boolean(raw.hidden),
          series: new Map(),
        };
        instances.set(entry.instanceId, entry);
        refreshInstance(entry);
      }
    }
    emit();
  }

  function getCount() {
    return getInstances().size;
  }

  /** @param {number} paneIndex */
  function getCountForPane(paneIndex) {
    return indicatorsForPane(paneIndex).length;
  }

  /** @param {number} paneIndex */
  function clearForPane(paneIndex) {
    for (const id of [...getInstances().keys()]) {
      const inst = getInstances().get(id);
      if (inst?.paneIndex === paneIndex) removeIndicator(id);
    }
  }

  return {
    addIndicator,
    removeIndicator,
    setHidden,
    setSelected,
    patchIndicator,
    clearAll,
    getIndicatorsByPane,
    setIndicatorsByPane,
    indicatorsForPane,
    getCount,
    getCountForPane,
    clearForPane,
  };
}
