import { chartDebug, chartDebugThrottle, isChartDebugEnabled } from "../../debug/chart/index.js";
import { capturePaneViewport } from "./viewportCapture.js";

const CAT = "viewport";

/** @param {string} msg @param {unknown} [detail] */
export function viewportDebug(msg, detail) {
  chartDebug(CAT, msg, detail);
}

/** @param {string} key @param {string} msg @param {unknown} [detail] @param {number} [ms] */
export function viewportDebugThrottle(key, msg, detail, ms = 500) {
  chartDebugThrottle(CAT, key, msg, detail, ms);
}

/** @param {object} pane @param {"left" | "right"} [priceScaleId] */
export function viewportDebugPaneState(pane, priceScaleId = "right", label = "state") {
  if (!isChartDebugEnabled()) return;
  const captured = capturePaneViewport(pane, priceScaleId);
  const ps = pane?.series?.priceScale?.()?.options?.() ?? {};
  viewportDebug(label, {
    pane: pane?.index,
    bars: pane?.bars?.length ?? 0,
    panReady: Boolean(pane?._priceScalePanReady),
    autoScale: ps.autoScale,
    scaleMargins: ps.scaleMargins,
    captured,
  });
}

/** @param {object} ctx */
export function installViewportDebugGlobal(ctx) {
  if (typeof window === "undefined") return;
  window.__BWC_VIEWPORT__ = {
    dump: () => {
      const panes = ctx.getAllChartPanes?.() ?? [];
      const sc = ctx.settingsStore?.get?.().scales ?? {};
      return {
        scalesSettings: {
          autoScale: sc.autoScale,
          lockPriceToBarRatio: sc.lockPriceToBarRatio,
        },
        snapshot: ctx.layoutManager?.getViewportsSnapshot?.() ?? null,
        pending: ctx._pendingViewportsDebug?.() ?? null,
        panes: panes.map((p) => ({
          index: p.index,
          bars: p.bars?.length ?? 0,
          viewport: capturePaneViewport(p, ctx.activePriceScaleId?.() ?? "right"),
          priceScale: p.series?.priceScale?.()?.options?.(),
        })),
      };
    },
    capture: () => {
      const viewports = ctx.buildLayoutEntry?.().viewports ?? null;
      viewportDebug("manual capture", viewports);
      return viewports;
    },
  };
  viewportDebug("debug helper ready", {
    hint: "window.__BWC_VIEWPORT__.dump() | .capture() — enable ?debug=1 or ?debug=viewport",
  });
}
