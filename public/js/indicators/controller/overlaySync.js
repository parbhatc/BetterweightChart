import { attachLabelsPrimitive } from "../primitives/labels.js";
import { attachBoxesPrimitive } from "../primitives/boxes.js";
import {
  clearOverlayInstanceCache,
  overlayGeometryKey,
  overlayRecomputeKey,
} from "../overlayCache.js";
import { chartDebug, chartDebugThrottle } from "../../debug/chart/index.js";

/** @param {string} message @param {unknown} [detail] */
function fvgOverlayDebug(message, detail) {
  chartDebugThrottle("fvg", message, message, detail, 800);
}

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
};

/**
 * @param {object} deps
 * @param {() => object[]} deps.getAllChartPanes
 * @param {(pane: object) => { utcBars: object[], chartBars: object[] }} deps.getPaneBars
 * @param {() => Map<string, import("../types.js").IndicatorInstance>} deps.getInstances
 * @param {(pane: object) => object} [deps.getOverlayContext]
 */
export function createOverlaySync(deps) {
  const { getPaneBars, getInstances, getOverlayContext } = deps;

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

    const recomputeKey = overlayRecomputeKey(instance, chartBars, Indicator);
    let overlayData;
    const cacheHit =
      instance._overlayRecomputeKey === recomputeKey && Array.isArray(instance._overlayBoxCache);
    if (cacheHit) {
      overlayData = instance._overlayBoxCache;
      fvgOverlayDebug("overlay cache hit", {
        defId: instance.defId,
        boxCount: overlayData.length,
        bars: chartBars.length,
        head: chartBars[0]?.time,
        tail: chartBars.at(-1)?.time,
        recomputeKey,
      });
    } else {
      const prevKey = instance._overlayRecomputeKey;
      overlayData =
        Indicator.computeOverlay?.(utcBars, chartBars, instance, {
          symbolInfo: pane.symbolInfo ?? null,
          chartResolution: pane.resolution ?? null,
          barSec: pane._chartView?.barSec ?? null,
          ...(getOverlayContext?.(pane) ?? {}),
        }) ?? [];
      instance._overlayRecomputeKey = recomputeKey;
      instance._overlayBoxCache = overlayData;
      instance._overlayGeomKey = overlayGeometryKey(overlayData);
      fvgOverlayDebug("overlay recompute", {
        defId: instance.defId,
        boxCount: overlayData.length,
        bars: chartBars.length,
        head: chartBars[0]?.time,
        tail: chartBars.at(-1)?.time,
        prevKey: prevKey ?? null,
        recomputeKey,
        reason: prevKey == null ? "cold" : prevKey !== recomputeKey ? "key-changed" : "no-cache",
      });
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
      timeAdapter: pane.timeAdapter ?? view?.timeAdapter ?? null,
    };

    const syncToken = `${recomputeKey}|${geomKey}|${overlayTimeCtxKey(timeCtx)}|${pane._historyRestorePending ? 1 : 0}`;
    if (instance._overlayLastSyncToken === syncToken) {
      fvgOverlayDebug("overlay sync skip (token)", { defId: instance.defId, syncToken });
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
        fvgOverlayDebug("overlay defer (history)", {
          defId: instance.defId,
          boxCount: overlayData.length,
          historyRestore: Boolean(pane._historyRestorePending),
          loadingHistory: Boolean(pane._loadingHistory),
        });
        return;
      }
      applyOverlayBoxes(instance, instance._overlayBoxCache ?? overlayData, timeCtx, {
        geometryUnchanged: true,
      });
      fvgOverlayDebug("overlay apply (timeCtx only)", {
        defId: instance.defId,
        boxCount: overlayData.length,
      });
      return;
    }

    instance._overlayBoxCache = overlayData;
    instance._overlayGeomKey = geomKey;

    if (pane._historyRestorePending || pane._loadingHistory) {
      instance._pendingOverlayApply = { overlayData, timeCtx, geometryUnchanged: false };
      instance.lastPlots = { overlay: overlayData };
      fvgOverlayDebug("overlay defer (history, new geom)", {
        defId: instance.defId,
        boxCount: overlayData.length,
      });
      return;
    }

    applyOverlayBoxes(instance, overlayData, timeCtx);
    instance._overlayAppliedGeomKey = geomKey;
    instance.lastPlots = { overlay: overlayData };
    fvgOverlayDebug("overlay apply", { defId: instance.defId, boxCount: overlayData.length });
  }

  /** @param {number} paneIndex Clear overlay recompute cache after history prepend. */
  function invalidateOverlayCacheForPane(paneIndex) {
    for (const instance of getInstances().values()) {
      if (instance.paneIndex !== paneIndex) continue;
      const Indicator = deps.getIndicatorClass(instance.defId);
      if (!Indicator?.overlayPrimitive) continue;
      instance._overlayRecomputeKey = undefined;
      instance._overlayLastSyncToken = undefined;
      instance._overlayBoxCache = undefined;
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
      timeAdapter: pane.timeAdapter ?? view?.timeAdapter ?? null,
    };

    for (const instance of getInstances().values()) {
      if (instance.paneIndex !== paneIndex) continue;
      const Indicator = deps.getIndicatorClass(instance.defId);
      if (!Indicator?.overlayPrimitive || !instance._overlayPrimitive) continue;
      if (instance.hidden) continue;
      const overlayData = instance._overlayBoxCache ?? instance.lastPlots?.overlay ?? [];
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
