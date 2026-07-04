import { resolutionSec } from "../../chart/resolutions.js";
import { replayBarsPerStep, replayPlayIntervalMs, normalizeStepInterval } from "../menus.js";
import { replayBarIndexForUtcTime } from "../persist.js";

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("../mode.js").mountReplayMode>} replay
 * @param {import("./types.js").ReplayEngineState} state
 * @param {{ ensureAllSnapshotsForward: () => Promise<void>, hasForwardBars: () => boolean, getMaxBarIndex: () => number, ensureReplayLtBarsForCursor: (pane: object, cursorUtc: number) => Promise<void> }} deps
 */
export function createReplayPlayback(ctx, replay, state, deps) {
  function chartResolution() {
    const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    return pane?.resolution ?? ctx.resolution ?? "1";
  }

  /** @param {import("../mode.js").ReplayState} rs @param {object} pane */
  function replayStepDeltaSec(rs, pane) {
    const res = pane?.resolution ?? chartResolution();
    const chartSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(res);
    if (rs.autoSelectInterval) {
      return chartSec * replayBarsPerStep(rs.stepInterval, res, true);
    }
    const id = normalizeStepInterval(rs.stepInterval);
    if (id === "tick") return chartSec;
    if (id === "1S") return 1;
    return resolutionSec(id);
  }

  /**
   * Advance replay cursor by wall-clock step (not next bar open in array).
   * @param {import("../mode.js").ReplayState} rs
   * @param {{ bars: object[], liveEndBarTime?: number | null }} snap
   * @param {object} pane
   */
  function resolveNextReplayCursor(rs, snap, pane) {
    if (!snap?.bars?.length || rs.currentBarTime == null) return null;
    const delta = replayStepDeltaSec(rs, pane);
    if (!Number.isFinite(delta) || delta <= 0) return null;
    const liveEnd =
      snap.liveEndBarTime ?? ctx.replayLiveEndUtc ?? state.replayLiveEndUtc ?? snap.bars.at(-1)?.time;
    if (liveEnd == null) return null;
    const nextTime = Math.min(liveEnd, rs.currentBarTime + delta);
    if (nextTime <= rs.currentBarTime) return null;
    const nextIdx = replayBarIndexForUtcTime(snap.bars, nextTime);
    if (nextIdx == null) return null;
    return { nextTime, nextIdx };
  }

  function stopPlayTimer() {
    if (state.playTimer != null) {
      clearInterval(state.playTimer);
      state.playTimer = null;
    }
  }

  function startPlayTimer() {
    stopPlayTimer();
    state.playTimer = setInterval(async () => {
      const rs = replay.getState();
      if (!rs.playing || rs.currentBarTime == null) {
        stopPlayTimer();
        return;
      }
      const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (!pane) {
        replay.pause();
        return;
      }
      await deps.ensureAllSnapshotsForward();
      let snap = pane._replaySnapshot;
      let resolved = snap ? resolveNextReplayCursor(rs, snap, pane) : null;
      if (!resolved) {
        replay.pause();
        return;
      }
      if (resolved.nextIdx > deps.getMaxBarIndex() && deps.hasForwardBars()) {
        await deps.ensureAllSnapshotsForward();
        snap = pane._replaySnapshot;
        resolved = snap ? resolveNextReplayCursor(rs, snap, pane) : null;
      }
      if (!resolved) {
        replay.pause();
        return;
      }
      const liveEnd = snap?.liveEndBarTime ?? ctx.replayLiveEndUtc ?? state.replayLiveEndUtc;
      if (
        resolved.nextTime >= (liveEnd ?? resolved.nextTime) &&
        resolved.nextIdx >= deps.getMaxBarIndex() &&
        !deps.hasForwardBars()
      ) {
        replay.pause();
        return;
      }
      await deps.ensureReplayLtBarsForCursor(pane, resolved.nextTime);
      replay.setReplayCursor(resolved.nextTime, { fromPlayback: true, index: resolved.nextIdx });
    }, replayPlayIntervalMs(replay.getState().speed));
  }

  return {
    chartResolution,
    replayStepDeltaSec,
    resolveNextReplayCursor,
    stopPlayTimer,
    startPlayTimer,
  };
}
