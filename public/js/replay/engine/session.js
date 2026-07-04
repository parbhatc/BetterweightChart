import { invalidatePaneChartView } from "../../chart/pane/viewCache.js";
import { isReplayHostControlled } from "../hostControl.js";
import {
  buildReplaySessionPayload,
  clearReplaySession,
  replayBarIndexForUtcTime,
  saveReplaySession,
} from "../persist.js";
import { replayDebug } from "../debug.js";

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("../mode.js").mountReplayMode>} replay
 * @param {import("./types.js").ReplayEngineState} state
 * @param {{ clearBarCachesForReplay: () => void, clearReplayBarsByResolution: () => void, resolveReplayLiveEndBarTime: (pane: object, cutTime: number, hintedLiveEnd?: number | null) => number, restoreSnapshotFromPartial: (pane: object, session: object) => void }} deps
 */
export function createReplaySession(ctx, replay, state, deps) {
  function refreshPriceLabelsForReplay() {
    for (const pane of ctx.getAllChartPanes()) {
      pane.priceLineLabel?.requestRefresh();
    }
  }

  /** @param {import("../mode.js").ReplayState} rs */
  function persistSession(rs) {
    if (isReplayHostControlled(ctx)) return;
    if (ctx.replayPendingRestore?.active) return;
    const payload = buildReplaySessionPayload(rs, ctx);
    if (payload) {
      saveReplaySession(payload);
      replayDebug("persist.save", {
        currentBarTime: payload.currentBarTime,
        fullEndBarTime: payload.fullEndBarTime,
        symbol: payload.symbol,
        resolution: payload.resolution,
      });
    } else if (!rs.active) {
      clearReplaySession();
      replayDebug("persist.clear");
    } else {
      replayDebug("persist.skip", {
        selectedBarTime: rs.selectedBarTime,
        currentBarTime: rs.currentBarTime,
      });
    }
  }

  function restoreLiveData() {
    state.lastAppliedEndIndex = null;
    state.lastAppliedBarTime = null;
    deps.clearBarCachesForReplay();
    deps.clearReplayBarsByResolution();
    state.replayLiveEndUtc = null;
    ctx.replayLiveEndUtc = null;

    for (const pane of ctx.getAllChartPanes()) {
      delete pane._replaySnapshot;
      delete pane.replayCursorEndIndex;
      pane.bars = [];
      pane._firstDataRequest = true;
      invalidatePaneChartView(pane);
      pane.priceLineLabel?.requestRefresh();
      pane.sessionBg?.requestRefresh();
    }

    const active = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    if (active) {
      if (ctx.indicatorController?.paneHasPlotSeriesIndicators?.(active.index)) {
        ctx.refreshIndicatorsImmediate?.(active.index);
      } else {
        ctx.refreshOverlaysImmediate?.(active.index);
      }
    }

    ctx.replayFutureDim?.refreshAll?.();
    clearReplaySession();
    replayDebug("restore");

    void ctx.loadBarsForPanes?.(ctx.getAllChartPanes(), { force: true });
  }

  /**
   * @param {import("../persist.js").ReplayPersistedSession} session
   */
  async function restoreSession(session) {
    const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    if (!pane?.bars?.length) return false;

    const liveEnd = deps.resolveReplayLiveEndBarTime(pane, session.currentBarTime, session.fullEndBarTime);
    state.replayLiveEndUtc = liveEnd;
    ctx.replayLiveEndUtc = liveEnd;

    for (const p of ctx.getAllChartPanes()) {
      deps.restoreSnapshotFromPartial(p, { ...session, fullEndBarTime: liveEnd });
    }

    const snap = pane._replaySnapshot;
    const bars = snap?.bars ?? pane.bars;
    const selectedIdx = replayBarIndexForUtcTime(bars, session.selectedBarTime);
    const currentIdx = replayBarIndexForUtcTime(bars, session.currentBarTime);
    if (selectedIdx == null || currentIdx == null) {
      replayDebug("restoreSession.fail", {
        selectedBarTime: session.selectedBarTime,
        currentBarTime: session.currentBarTime,
        bars: bars.length,
        first: bars[0]?.time,
        last: bars.at(-1)?.time,
      });
      return false;
    }

    state.lastAppliedEndIndex = null;
    state.lastAppliedBarTime = null;
    replay.restoreFromPersist({
      active: true,
      selectedBarIndex: selectedIdx,
      currentBarIndex: currentIdx,
      selectedBarTime: session.selectedBarTime,
      currentBarTime: session.currentBarTime,
      selectingBar: false,
      selectMode: "bar",
      playing: false,
      speed: session.speed,
      stepInterval: session.stepInterval,
      autoSelectInterval: session.autoSelectInterval !== false,
    });

    replayDebug("restoreSession", {
      selectedIdx,
      currentIdx,
      bars: pane._replaySnapshot.bars.length,
      fullEnd: liveEnd,
      partial: pane._replaySnapshot.partial,
    });
    return true;
  }

  return {
    refreshPriceLabelsForReplay,
    persistSession,
    restoreLiveData,
    restoreSession,
  };
}
