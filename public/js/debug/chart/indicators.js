import { chartDebug, chartDebugThrottle, isChartDebugEnabled } from "./index.js";
import { getIndicatorClass } from "../../indicators/catalog.js";

/**
 * @param {string} action
 * @param {unknown} [detail]
 */
export function indicatorDebug(action, detail) {
  chartDebug("indicator", action, detail);
}

/**
 * @param {string} key
 * @param {string} action
 * @param {unknown} [detail]
 * @param {number} [intervalMs]
 */
export function indicatorDebugThrottle(key, action, detail, intervalMs = 500) {
  chartDebugThrottle("indicator", key, action, detail, intervalMs);
}

/**
 * @param {"full" | "overlay"} kind
 * @param {number | undefined} paneIndex
 * @param {object} [detail]
 */
export function indicatorDebugRefresh(kind, paneIndex, detail = {}) {
  indicatorDebug(`refresh.${kind}`, { pane: paneIndex ?? "all", ...detail });
}

/**
 * @param {object} ctx
 * @param {object | null | undefined} controller
 */
export function buildIndicatorDebugSnapshot(ctx, controller) {
  const replayState = ctx.replay?.getState?.() ?? null;
  const panes = ctx.getAllChartPanes?.() ?? [];
  /** @type {Record<number, { plot: number, overlay: number, hidden: number, ids: string[] }>} */
  const byPane = {};

  if (controller?.getInstances) {
    for (const inst of controller.getInstances().values()) {
      const idx = inst.paneIndex ?? 0;
      if (!byPane[idx]) byPane[idx] = { plot: 0, overlay: 0, hidden: 0, ids: [] };
      const bucket = byPane[idx];
      if (inst.hidden) bucket.hidden += 1;
      else {
        const Indicator = getIndicatorClass(inst.defId);
        if (Indicator?.overlayPrimitive) bucket.overlay += 1;
        else bucket.plot += 1;
      }
      if (bucket.ids.length < 12) bucket.ids.push(inst.defId);
    }
  }

  return {
    replayLocked: ctx.replayEngine?.isReplayLocked?.() ?? false,
    replayActive: Boolean(replayState?.active),
    replayCursorUtc: replayState?.currentBarTime ?? replayState?.selectedBarTime ?? null,
    panning: Boolean(ctx.ui?.chartPanning),
    paneCount: panes.length,
    byPane,
    panes: panes.map((p) => ({
      index: p.index,
      resolution: p.resolution,
      bars: p.bars?.length ?? 0,
      replayCursorEndIndex: p.replayCursorEndIndex ?? null,
      hasSnapshot: Boolean(p._replaySnapshot),
      snapshotBars: p._replaySnapshot?.bars?.length ?? 0,
    })),
  };
}

/**
 * @param {object} ctx
 * @param {object | null | undefined} controller
 * @param {{ log?: boolean }} [opts]
 */
export function logIndicatorDebugSnapshot(ctx, controller, opts = {}) {
  const snap = buildIndicatorDebugSnapshot(ctx, controller);
  if (opts.log !== false && isChartDebugEnabled()) {
    const lines = [
      `[BWC] indicators — ${snap.paneCount} pane(s), replay ${snap.replayActive ? "on" : "off"}${snap.replayLocked ? " (locked)" : ""}`,
    ];
    if (snap.replayCursorUtc != null) {
      lines.push(`  replay cursor utc: ${snap.replayCursorUtc}`);
    }
    if (snap.panning) lines.push("  panning: deferring refreshes");
    for (const [idx, counts] of Object.entries(snap.byPane)) {
      lines.push(
        `  pane ${idx}: ${counts.plot} plot, ${counts.overlay} overlay, ${counts.hidden} hidden — ${counts.ids.join(", ")}`,
      );
    }
    console.info(lines.join("\n"));
  }
  return snap;
}
