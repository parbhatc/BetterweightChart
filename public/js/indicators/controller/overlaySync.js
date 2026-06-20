import { attachLabelsPrimitive } from "../primitives/labels.js";
import { attachBoxesPrimitive } from "../primitives/boxes.js";
import { attachLinesPrimitive } from "../primitives/lines.js";
import {
  clearOverlayInstanceCache,
  overlayGeometryKey,
  overlayRecomputeKey,
} from "../overlayCache.js";
import { logIndicatorLoad } from "./indicatorLoadLog.js";

/** @param {object} timeCtx */
function overlayTimeCtxKey(timeCtx) {
  const bars = timeCtx.mapBars;
  return [
    bars?.length ?? 0,
    bars?.[0]?.time ?? "",
    bars?.at?.(-1)?.time ?? "",
    timeCtx.lastRealChartTime ?? "",
    timeCtx.barSec ?? "",
    timeCtx.timeAdapter ? 1 : 0,
  ].join("|");
}

/** @type {Record<string, typeof attachLabelsPrimitive | typeof attachBoxesPrimitive>} */
const OVERLAY_PRIMITIVE_ATTACH = {
  labels: attachLabelsPrimitive,
  boxes: attachBoxesPrimitive,
  lines: attachLinesPrimitive,
};

/**
 * @param {object} deps
 * @param {() => object[]} deps.getAllChartPanes
 * @param {(pane: object) => { utcBars: object[], chartBars: object[] }} deps.getPaneBars
 * @param {() => Map<string, import("../types.js").IndicatorInstance>} deps.getInstances
 * @param {(pane: object) => object} [deps.getOverlayContext]
 */
export function createOverlaySync(deps) {
  const { getPaneBars, getInstances, getOverlayContext, emit } = deps;

  /** @param {number} paneIndex */
  function paneByIndex(paneIndex) {
    return deps.getAllChartPanes().find((p) => p.index === paneIndex);
  }

  /** @param {import("../types.js").IndicatorInstance & { _overlayPrimitive?: { setLabels: (l: object[]) => void; setBoxes: (b: object[], c?: object, o?: object) => void; destroy: () => void } }} instance @param {object} timeCtx @param {{ geometryUnchanged?: boolean, skipRedraw?: boolean }} [opts] */
  function applyOverlayBoxes(instance, overlayData, timeCtx, opts = {}) {
    if (typeof instance._overlayPrimitive?.setBoxes === "function") {
      instance._overlayPrimitive.setBoxes(overlayData, timeCtx, opts);
    } else {
      instance._overlayPrimitive?.setLabels(overlayData);
    }
  }

  /** @param {import("../types.js").IndicatorInstance} instance @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator @param {object} pane */
  function flushPendingOverlayApply(instance, Indicator, pane) {
    const pending = instance._pendingOverlayApply;
    if (!pending || pane._historyRestorePending || pane._loadingHistory) return;
    delete instance._pendingOverlayApply;
    instance._overlayLastSyncToken = undefined;
    applyOverlayBoxes(instance, pending.overlayData, pending.timeCtx, {
      geometryUnchanged: pending.geometryUnchanged,
    });
    if (!pending.geometryUnchanged) {
      instance._overlayAppliedGeomKey = overlayGeometryKey(pending.overlayData);
    }
  }

  /** @param {import("../types.js").IndicatorInstance} instance @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator */
  function syncOverlayPrimitive(instance, Indicator) {
    const pane = paneByIndex(instance.paneIndex);
    if (!pane?.series) return;

    const indicatorName = Indicator.id ?? instance.defId;
    const paneKey = `${pane.resolution}|${pane.symbol ?? ""}`;
    if (instance._overlayPaneKey !== paneKey) {
      instance._overlayPrimitive?.destroy?.();
      instance._overlayPrimitive = null;
      instance._overlayPaneKey = paneKey;
      clearOverlayInstanceCache(instance);
    }

    if (
      instance.hidden ||
      !Indicator.overlayGraphicsVisible(instance, Indicator.overlayPrimitive ?? "")
    ) {
      instance._overlayPrimitive?.setLabels([]);
      if (typeof instance._overlayPrimitive?.setBoxes === "function") {
        instance._overlayPrimitive.setBoxes([]);
      }
      instance.lastPlots = { overlay: [] };
      clearOverlayInstanceCache(instance);
      return;
    }

    const { utcBars, chartBars } = getPaneBars(pane);
    if (!utcBars.length || utcBars.length !== chartBars.length) {
      instance._overlayPrimitive?.setLabels([]);
      if (typeof instance._overlayPrimitive?.setBoxes === "function") {
        instance._overlayPrimitive.setBoxes([]);
      }
      instance.lastPlots = { overlay: [] };
      clearOverlayInstanceCache(instance);
      return;
    }

    const overlayCtx = {
      symbolInfo: pane.symbolInfo ?? null,
      chartResolution: pane.resolution ?? null,
      barSec: pane._chartView?.barSec ?? null,
      primarySymbol: pane.symbol ?? null,
      symbol: pane.symbol ?? null,
      formingBar: utcBars.at(-1) ?? null,
      ...(getOverlayContext?.(pane) ?? {}),
    };

    let recomputeKey = overlayRecomputeKey(instance, chartBars, Indicator);
    if (typeof Indicator.overlayRecomputeExtra === "function") {
      recomputeKey = `${recomputeKey}|${Indicator.overlayRecomputeExtra(instance, overlayCtx)}`;
    }

    const overlayPending =
      typeof Indicator.overlayPending === "function" && Indicator.overlayPending(instance, overlayCtx);
    const prevPending = instance._initPending === true;
    instance._initPending = overlayPending === true;

    if (instance._initPending && instance._loadStartAt == null) {
      instance._loadStartAt = performance.now();
      logIndicatorLoad(indicatorName, "loading");
    }

    let overlayData;
    const cacheHit =
      !instance._initPending &&
      instance._overlayRecomputeKey === recomputeKey &&
      Array.isArray(instance._overlayBoxCache);
    if (instance._initPending) {
      overlayData = [];
    } else if (cacheHit) {
      overlayData = instance._overlayBoxCache;
    } else {
      overlayData = Indicator.computeOverlay?.(utcBars, chartBars, instance, overlayCtx) ?? [];
      instance._overlayRecomputeKey = recomputeKey;
      instance._overlayBoxCache = overlayData;
      instance._overlayGeomKey = overlayGeometryKey(overlayData);
    }

    if (prevPending && !instance._initPending) {
      const ms =
        instance._loadStartAt != null
          ? Number((performance.now() - instance._loadStartAt).toFixed(1))
          : undefined;
      logIndicatorLoad(indicatorName, "loaded", { ms });
      delete instance._loadStartAt;
    }

    if (prevPending !== instance._initPending) {
      emit?.();
    }

    const geomKey = overlayGeometryKey(overlayData);
    const attachFn = OVERLAY_PRIMITIVE_ATTACH[Indicator.overlayPrimitive];
    if (!attachFn) return;

    if (!instance._overlayPrimitive) {
      instance._overlayPrimitive = attachFn({ series: pane.series });
      if (!instance.series) instance.series = new Map();
    }

    const view = pane._chartView;
    const timeCtx = {
      mapBars: view?.mapBars ?? chartBars,
      barSec: view?.barSec ?? null,
      lastRealChartTime: chartBars.at(-1)?.time,
      timeAdapter: view?.timeAdapter ?? pane.timeAdapter ?? null,
    };

    const syncToken = `${recomputeKey}|${geomKey}|${overlayTimeCtxKey(timeCtx)}|${pane._historyRestorePending ? 1 : 0}|${instance._initPending ? 1 : 0}`;
    if (instance._overlayLastSyncToken === syncToken) {
      return;
    }
    instance._overlayLastSyncToken = syncToken;

    const geometryUnchanged =
      instance._overlayAppliedGeomKey === geomKey && instance._overlayAppliedGeomKey != null;

    if (geometryUnchanged) {
      instance.lastPlots = { overlay: instance._overlayBoxCache ?? overlayData };
      if (pane._historyRestorePending || pane._loadingHistory) {
        instance._pendingOverlayApply = {
          overlayData: instance._overlayBoxCache ?? overlayData,
          timeCtx,
          geometryUnchanged: true,
        };
        return;
      }
      applyOverlayBoxes(instance, instance._overlayBoxCache ?? overlayData, timeCtx, {
        geometryUnchanged: true,
      });
      return;
    }

    instance._overlayBoxCache = overlayData;
    instance._overlayGeomKey = geomKey;

    if (pane._historyRestorePending || pane._loadingHistory) {
      instance._pendingOverlayApply = { overlayData, timeCtx, geometryUnchanged: false };
      instance.lastPlots = { overlay: overlayData };
      return;
    }

    applyOverlayBoxes(instance, overlayData, timeCtx);
    instance._overlayAppliedGeomKey = geomKey;
    instance.lastPlots = { overlay: overlayData };
  }

  /** @param {number} paneIndex Clear overlay recompute cache after history prepend. */
  function invalidateOverlayCacheForPane(paneIndex) {
    for (const instance of getInstances().values()) {
      if (instance.paneIndex !== paneIndex) continue;
      const Indicator = deps.getIndicatorClass(instance.defId);
      if (!Indicator?.overlayPrimitive) continue;
      clearOverlayInstanceCache(instance);
      if (instance.lastPlots) instance.lastPlots.overlay = [];
    }
  }

  /** @param {number} paneIndex Push fresh mapBars/timeAdapter after candle setData (history prepend). */
  function syncOverlayTimeCtxForPane(paneIndex) {
    const pane = paneByIndex(paneIndex);
    if (!pane?.series) return;
    const { chartBars } = getPaneBars(pane);
    if (!chartBars.length) return;

    const view = pane._chartView;
    const timeCtx = {
      mapBars: view?.mapBars ?? chartBars,
      barSec: view?.barSec ?? null,
      lastRealChartTime: chartBars.at(-1)?.time,
      timeAdapter: view?.timeAdapter ?? pane.timeAdapter ?? null,
    };

    for (const instance of getInstances().values()) {
      if (instance.paneIndex !== paneIndex) continue;
      const Indicator = deps.getIndicatorClass(instance.defId);
      if (!Indicator?.overlayPrimitive || !instance._overlayPrimitive) continue;
      if (instance.hidden) continue;
      const overlayData = instance._overlayBoxCache ?? instance.lastPlots?.overlay ?? [];
      if (!overlayData.length) continue;
      applyOverlayBoxes(instance, overlayData, timeCtx, { geometryUnchanged: true });
    }
  }

  /** @param {number} paneIndex */
  function refreshOverlaysForPaneNow(paneIndex) {
    const pane = paneByIndex(paneIndex);
    if (pane?._historyRestorePending || pane?._loadingHistory) return;
    const instances = getInstances();
    for (const instance of instances.values()) {
      if (instance.paneIndex !== paneIndex) continue;
      const Indicator = deps.getIndicatorClass(instance.defId);
      if (!Indicator?.overlayPrimitive) continue;
      const visible = deps.isInstanceVisibleOnPane(instance, paneIndex);
      if (!visible || instance.hidden) {
        instance._overlayPrimitive?.setLabels([]);
        if (typeof instance._overlayPrimitive?.setBoxes === "function") {
          instance._overlayPrimitive.setBoxes([]);
        }
        clearOverlayInstanceCache(instance);
        continue;
      }
      flushPendingOverlayApply(instance, Indicator, pane);
      instance._overlayLastSyncToken = undefined;
      syncOverlayPrimitive(instance, Indicator);
    }
  }

  /** @param {number} [paneIndex] */
  function clearOverlaysForPane(paneIndex) {
    for (const instance of getInstances().values()) {
      if (paneIndex != null && instance.paneIndex !== paneIndex) continue;
      instance._overlayPrimitive?.setLabels([]);
      if (typeof instance._overlayPrimitive?.setBoxes === "function") {
        instance._overlayPrimitive.setBoxes([]);
      }
      instance.lastPlots = { overlay: [] };
      instance._overlayAppliedGeomKey = undefined;
      instance._overlayPaneKey = undefined;
      clearOverlayInstanceCache(instance);
    }
  }

  return {
    syncOverlayPrimitive,
    flushPendingOverlayApply,
    syncOverlayTimeCtxForPane,
    invalidateOverlayCacheForPane,
    refreshOverlaysForPaneNow,
    clearOverlaysForPane,
  };
}
