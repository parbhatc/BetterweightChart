import {
  captureViewportBarLayout,
  computeViewportBarLayoutLogical,
  restoreViewportBarLayout,
} from "../../chart/pane/viewportBarLayout.js";
import { invalidatePaneChartView } from "../../chart/pane/viewCache.js";
import { isReplayHostControlled } from "../hostControl.js";
import { replayBarIndexForUtcTime } from "../persist.js";
import { replayDebug } from "../debug.js";

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("../mode.js").mountReplayMode>} replay
 * @param {import("./types.js").ReplayEngineState} state
 */
export function createReplayHostSync(ctx, replay, state) {
  /** @param {object} pane */
  function applyHostReplayCursorToPane(pane) {
    if (!pane?.bars?.length) return null;

    const anchorUtc =
      typeof ctx.opts?.getPlaybackAnchorSec === "function"
        ? ctx.opts.getPlaybackAnchorSec(pane.resolution)
        : null;
    if (anchorUtc == null || !Number.isFinite(anchorUtc)) return null;

    const layout =
      pane.chart && ctx.settingsStore && ctx.resolutions
        ? captureViewportBarLayout(pane, ctx.settingsStore, ctx.resolutions)
        : null;

    let bars = pane.bars;
    let cursorUtc = anchorUtc;
    const lastBarTime = bars.at(-1)?.time;
    let didRefresh = false;
    if (lastBarTime != null && lastBarTime > cursorUtc) {
      const trimIdx = replayBarIndexForUtcTime(bars, cursorUtc);
      if (trimIdx != null && trimIdx < bars.length - 1) {
        pane.bars = bars.slice(0, trimIdx + 1);
        invalidatePaneChartView(pane);
        const logicalRange = layout
          ? computeViewportBarLayoutLogical(pane, layout)
          : null;
        ctx.refreshPaneCandleData?.(pane, {
          logicalRange: logicalRange ?? undefined,
          avoidPreserveViewport: !logicalRange,
          deferSessionBg: true,
        });
        didRefresh = true;
        bars = pane.bars;
      }
    }

    const prevEndIndex = pane.replayCursorEndIndex;
    const currentIdx = replayBarIndexForUtcTime(bars, cursorUtc) ?? bars.length - 1;
    cursorUtc = bars[currentIdx]?.time ?? cursorUtc;
    pane.replayCursorEndIndex = currentIdx;

    if (layout && pane.chart && (prevEndIndex !== currentIdx || didRefresh)) {
      restoreViewportBarLayout(
        pane,
        layout,
        ctx.settingsStore,
        ctx.resolutions,
        "host-replay-step",
        ctx.activePriceScaleId,
        { skipPrice: true },
      );
    }

    ctx.replayFutureDim?.refreshAll?.();
    pane.sessionBg?.requestRefresh?.();

    return { cursorUtc, currentIdx, bars };
  }

  function syncHostReplayAllPanes() {
    const rs = replay.getState();
    if (!rs.active || !isReplayHostControlled(ctx)) return;

    const panes = ctx.getAllChartPanes?.() ?? [];
    const activePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    let activeResult = null;

    for (const pane of panes) {
      const result = applyHostReplayCursorToPane(pane);
      if (pane === activePane) activeResult = result;
    }

    if (activeResult) {
      const { cursorUtc, currentIdx, bars } = activeResult;
      replay.setReplayPosition({
        selectedBarIndex: currentIdx,
        currentBarIndex: currentIdx,
        selectedBarTime: bars[currentIdx]?.time ?? cursorUtc,
        currentBarTime: cursorUtc,
      });
      state.lastAppliedEndIndex = currentIdx;
      state.lastAppliedBarTime = cursorUtc;
    }

    replayDebug("syncHostReplayAllPanes", {
      panes: panes.map((p) => ({
        index: p.index,
        symbol: p.symbol,
        resolution: p.resolution,
        last: p.bars?.at(-1)?.time,
      })),
    });
  }

  /** @param {import("../mode.js").ReplayState} rs @param {object | null | undefined} pane */
  function hostControlledCursorIndex(rs, pane) {
    if (rs.currentBarIndex != null && Number.isFinite(rs.currentBarIndex)) {
      return rs.currentBarIndex;
    }
    if (rs.selectedBarIndex != null && Number.isFinite(rs.selectedBarIndex)) {
      return rs.selectedBarIndex;
    }
    const len = pane?.bars?.length ?? 0;
    return len > 0 ? len - 1 : 0;
  }

  return {
    applyHostReplayCursorToPane,
    syncHostReplayAllPanes,
    hostControlledCursorIndex,
  };
}
