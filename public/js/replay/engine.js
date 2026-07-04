import { resolutionSec } from "../chart/resolutions.js";
import { isReplayHostControlled, emitReplayHostAction } from "./hostControl.js";
import { replayBarIndexForUtcTime } from "./persist.js";
import { replayDebugSync, buildReplayEngineDebugSnapshot } from "./debug.js";
import { createReplayEngineState } from "./engine/state.js";
import { createReplayViewport } from "./engine/viewport.js";
import { createReplaySnapshot } from "./engine/snapshot.js";
import { createReplayLtBars } from "./engine/ltBars.js";
import { createReplayPaneSync } from "./engine/paneSync.js";
import { createReplayPlayback } from "./engine/playback.js";
import { createReplayHostSync } from "./engine/hostSync.js";
import { createReplaySession } from "./engine/session.js";
import { createReplayResolutionChange } from "./engine/resolutionChange.js";

/**
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("./mode.js").mountReplayMode>} replay
 */
export function attachReplayEngine(ctx, replay) {
  const state = createReplayEngineState();

  const viewport = createReplayViewport(ctx, state);
  const snapshot = createReplaySnapshot(ctx, replay, state);
  const ltBars = createReplayLtBars(ctx, replay, state);

  const session = createReplaySession(ctx, replay, state, {
    clearBarCachesForReplay: snapshot.clearBarCachesForReplay,
    clearReplayBarsByResolution: ltBars.clearReplayBarsByResolution,
    resolveReplayLiveEndBarTime: snapshot.resolveReplayLiveEndBarTime,
    restoreSnapshotFromPartial: snapshot.restoreSnapshotFromPartial,
  });

  const paneSync = createReplayPaneSync(ctx, replay, state, {
    restoreReplayViewportAfterTfSwitch: viewport.restoreReplayViewportAfterTfSwitch,
    persistSession: session.persistSession,
  });

  const playback = createReplayPlayback(ctx, replay, state, {
    ensureAllSnapshotsForward: snapshot.ensureAllSnapshotsForward,
    hasForwardBars: snapshot.hasForwardBars,
    getMaxBarIndex: snapshot.getMaxBarIndex,
    ensureReplayLtBarsForCursor: ltBars.ensureReplayLtBarsForCursor,
  });

  const hostSync = createReplayHostSync(ctx, replay, state);

  const resolutionChange = createReplayResolutionChange(ctx, replay, state, {
    clearLtBarsStash: ltBars.clearLtBarsStash,
    ensureReplayLtBarsForCursor: ltBars.ensureReplayLtBarsForCursor,
    restorePaneBarsForReplayResolution: ltBars.restorePaneBarsForReplayResolution,
    replaceReplaySnapshots: snapshot.replaceReplaySnapshots,
    seedReplayLtBarsForForming: ltBars.seedReplayLtBarsForForming,
    fetchLtBarsForReplayPeriod: ltBars.fetchLtBarsForReplayPeriod,
    syncLtBarsCacheForCursor: ltBars.syncLtBarsCacheForCursor,
    mergePaneHistoryIntoSnapshot: paneSync.mergePaneHistoryIntoSnapshot,
    syncPaneBarsToReplayEnd: paneSync.syncPaneBarsToReplayEnd,
    resolveReplayViewportLogicalRange: viewport.resolveReplayViewportLogicalRange,
  });

  /** @param {object[]} bars @param {number} utcTime */
  function resolveSnapshotIndex(bars, utcTime) {
    return replayBarIndexForUtcTime(bars, utcTime);
  }

  /** @param {import("./mode.js").ReplayState} rs */
  function sync(rs) {
    const hostControlled = isReplayHostControlled(ctx);
    snapshot.setResolutionCacheReplayTtl(rs.active && !hostControlled);

    if (rs.active !== state.wasReplayUiActive) {
      if (rs.active && !hostControlled) snapshot.clearBarCachesForReplay();
      state.wasReplayUiActive = rs.active;
      session.refreshPriceLabelsForReplay();
      replayDebugSync(rs.active ? "ui.on" : "ui.off", { hostControlled });
    }

    if (!rs.active) {
      playback.stopPlayTimer();
      state.lastAppliedEndIndex = null;
      state.lastAppliedBarTime = null;
      if (hostControlled) {
        for (const pane of ctx.getAllChartPanes()) {
          delete pane._replaySnapshot;
          delete pane.replayCursorEndIndex;
        }
        replayDebugSync("inactive.host");
      } else if (ctx.getAllChartPanes().some((p) => p._replaySnapshot)) {
        replayDebugSync("inactive.restoreLive");
        session.restoreLiveData();
      } else {
        replayDebugSync("inactive.clear");
      }
      session.persistSession(rs);
      return;
    }

    if (rs.selectedBarTime == null) {
      playback.stopPlayTimer();
      replayDebugSync("awaitingSelection");
      return;
    }

    if (isReplayHostControlled(ctx)) {
      playback.stopPlayTimer();
      if (rs.selectingBar && rs.selectMode === "bar") {
        ctx.replayFutureDim?.refreshAll?.();
      }
      replayDebugSync("host.skip", { selectingBar: rs.selectingBar }, rs.playing);
      return;
    }

    const cut = rs.currentBarTime ?? rs.selectedBarTime;
    const activePaneEarly = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    const existingSnap = activePaneEarly?._replaySnapshot;
    const prevCursor = existingSnap?.cursorTime ?? existingSnap?.fullEndBarTime;

    snapshot.captureSnapshots(cut);
    snapshot.refreshAllSnapshotLiveEnds();

    if (existingSnap && cut != null && prevCursor != null && cut < prevCursor) {
      snapshot.trimReplaySnapshotsToCut(cut);
      state.lastAppliedEndIndex = null;
      state.lastAppliedBarTime = null;
      replayDebugSync("trim", { cut, prevCursor }, rs.playing);
    } else if (existingSnap && cut != null) {
      existingSnap.cursorTime = cut;
      existingSnap.fullEndBarTime = cut;
    }

    for (const pane of ctx.getAllChartPanes()) {
      paneSync.mergePaneHistoryIntoSnapshot(pane);
    }

    if (rs.selectingBar && rs.selectMode === "bar") {
      playback.stopPlayTimer();
      const browsePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (browsePane) paneSync.expandPaneForBarSelect(browsePane);
      ctx.replayFutureDim?.refreshAll?.();
      session.persistSession(rs);
      replayDebugSync("browse", { cut });
      return;
    }

    if (state.replaySkipSyncApply) {
      session.persistSession(rs);
      replayDebugSync("skipTfApply", { cut }, rs.playing);
      return;
    }

    const endTime = rs.currentBarTime ?? rs.selectedBarTime;
    if (endTime == null) return;

    const activePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    const snap = activePane?._replaySnapshot;
    if (!snap?.bars?.length) return;

    const endIndex = resolveSnapshotIndex(snap.bars, endTime);
    if (endIndex == null) return;

    const endBar = snap.bars[endIndex];
    if (
      state.lastAppliedEndIndex === endIndex &&
      state.lastAppliedBarTime === endTime &&
      activePane.bars.at(-1)?.time === endBar?.time
    ) {
      if (!paneSync.barsFormingEqual(activePane.bars.at(-1), endBar)) {
        ltBars.patchReplayHtfFormingAtCursor(activePane, endTime);
        for (const pane of ctx.getAllChartPanes()) {
          const pSnap = pane._replaySnapshot;
          if (!pSnap?.bars?.length) continue;
          paneSync.syncPaneBarsToReplayEnd(pane, pSnap, endIndex);
          pane.priceLineLabel?.requestRefresh();
          pane.sessionBg?.requestRefresh();
        }
        if (ctx.indicatorController?.paneHasOverlayIndicators?.(activePane.index)) {
          ctx.indicatorController.refreshOverlaysForPane?.(activePane.index);
        }
        replayDebugSync(
          "forming",
          { endIndex, endTime, overlayRefresh: true },
          rs.playing,
        );
      } else {
        replayDebugSync("noop", { endIndex, endTime }, rs.playing);
      }
      if (rs.playing) playback.startPlayTimer();
      else playback.stopPlayTimer();
      session.persistSession(rs);
      return;
    }

    if (state.lastAppliedBarTime != null && endTime !== state.lastAppliedBarTime) {
      const prevIdx = state.lastAppliedEndIndex;
      if (prevIdx == null || endIndex !== prevIdx + 1) {
        state.lastAppliedEndIndex = null;
      }
    }

    const paneSec = ctx.barSecForPaneLocal?.(activePane) ?? resolutionSec(activePane.resolution);
    const ltSec = resolutionSec("1");
    if (paneSec <= ltSec) {
      ltBars.syncReplayLtBarsFromPane(activePane, endTime);
    }
    ltBars.patchReplayHtfFormingAtCursor(activePane, endTime);
    ltBars.syncLtBarsCacheForCursor(endTime);

    paneSync.applyReplayEndIndex(endIndex, {}, snapshot.getMaxBarIndex);
    state.lastAppliedBarTime = endTime;

    replayDebugSync(
      "apply",
      {
        endIndex,
        endTime,
        maxIndex: snapshot.getMaxBarIndex(),
        resolution: activePane.resolution,
        paneBars: activePane.bars.length,
      },
      rs.playing,
    );

    state.replayBarsByResolution.set(activePane.resolution, {
      bars: activePane.bars.slice(),
      cursorUtc: endTime,
    });

    const activeSnap = activePane._replaySnapshot;
    if (activeSnap) {
      activeSnap.cursorTime = endTime;
      activeSnap.fullEndBarTime = endTime;
    }

    if (rs.playing) playback.startPlayTimer();
    else playback.stopPlayTimer();
    session.persistSession(rs);
  }

  replay.subscribe(sync);

  window.addEventListener("beforeunload", () => {
    session.persistSession(replay.getState());
  });

  return {
    isReplayLocked: () => {
      if (isReplayHostControlled(ctx)) return false;
      const rs = replay.getState();
      return Boolean(rs.active && rs.selectedBarTime != null);
    },
    isReplayHistoryBlocked: () => state.replayTfChangeInFlight,
    mergeHistoryIntoSnapshot: paneSync.mergePaneHistoryIntoSnapshot,
    getCursorBarIndex: () => {
      const rs = replay.getState();
      if (isReplayHostControlled(ctx)) {
        const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
        return hostSync.hostControlledCursorIndex(rs, pane);
      }
      const snap = (ctx.getActivePane?.() ?? ctx.chartPanes.get(0))?._replaySnapshot;
      if (!snap?.bars?.length || rs.currentBarTime == null) return rs.currentBarIndex ?? 0;
      return replayBarIndexForUtcTime(snap.bars, rs.currentBarTime) ?? rs.currentBarIndex ?? 0;
    },
    getMaxBarIndex: () => {
      if (isReplayHostControlled(ctx)) {
        const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
        return Math.max(0, (pane?.bars?.length ?? 1) - 1);
      }
      return snapshot.getMaxBarIndex();
    },
    hasForwardBars: () => {
      if (isReplayHostControlled(ctx)) {
        const rs = replay.getState();
        const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
        const cursor = hostSync.hostControlledCursorIndex(rs, pane);
        return cursor < Math.max(0, (pane?.bars?.length ?? 0) - 1);
      }
      return snapshot.hasForwardBars();
    },
    refreshReplayLiveEnd: snapshot.refreshAllSnapshotLiveEnds,
    restoreSession: session.restoreSession,
    onChartResolutionChange: resolutionChange.onChartResolutionChange,
    beforeResolutionChange: ltBars.beforeResolutionChange,
    stashReplayViewportLayout: viewport.stashReplayViewportLayout,
    syncHostReplayAllPanes: hostSync.syncHostReplayAllPanes,
    stepForward: async () => {
      const rs = replay.getState();
      if (!rs.active) return;
      if (isReplayHostControlled(ctx)) {
        emitReplayHostAction(ctx, "stepForward", {
          currentBarIndex: rs.currentBarIndex,
          currentBarTime: rs.currentBarTime,
          selectedBarIndex: rs.selectedBarIndex,
          selectedBarTime: rs.selectedBarTime,
        });
        return;
      }
      if (rs.currentBarTime == null) return;
      snapshot.refreshAllSnapshotLiveEnds();
      const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (!pane) return;
      await snapshot.ensureAllSnapshotsForward();
      let snap = pane._replaySnapshot;
      let resolved = snap ? playback.resolveNextReplayCursor(rs, snap, pane) : null;
      if (!resolved) return;

      if (resolved.nextIdx > snapshot.getMaxBarIndex() && snapshot.hasForwardBars()) {
        await snapshot.ensureAllSnapshotsForward();
        snap = pane._replaySnapshot;
        resolved = snap ? playback.resolveNextReplayCursor(rs, snap, pane) : null;
      }
      if (!resolved) return;

      const liveEnd = snap?.liveEndBarTime ?? ctx.replayLiveEndUtc ?? state.replayLiveEndUtc;
      if (
        resolved.nextTime >= (liveEnd ?? resolved.nextTime) &&
        resolved.nextIdx >= snapshot.getMaxBarIndex() &&
        !snapshot.hasForwardBars()
      ) {
        return;
      }

      await ltBars.ensureReplayLtBarsForCursor(pane, resolved.nextTime);
      replay.setReplayCursor(resolved.nextTime, { index: resolved.nextIdx });
    },
    jumpToEnd: async () => {
      const rs = replay.getState();
      if (!rs.active) return;
      if (isReplayHostControlled(ctx)) {
        emitReplayHostAction(ctx, "jumpToEnd", {
          currentBarIndex: rs.currentBarIndex,
          currentBarTime: rs.currentBarTime,
          selectedBarIndex: rs.selectedBarIndex,
          selectedBarTime: rs.selectedBarTime,
        });
        return;
      }
      if (rs.selectedBarTime == null) return;
      replay.pause();
      await snapshot.ensureAllSnapshotsForward();
      const max = snapshot.getMaxBarIndex();
      const snap = (ctx.getActivePane?.() ?? ctx.chartPanes.get(0))?._replaySnapshot;
      const maxTime = snap?.bars?.[max]?.time;
      if (maxTime == null) return;
      replay.setReplayCursor(maxTime, { index: max });
      const active = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (active) ctx.scrollPaneToLatest?.(active);
    },
    play: () => {
      const rs = replay.getState();
      if (!rs.active) return;
      if (isReplayHostControlled(ctx)) {
        emitReplayHostAction(ctx, "play", {
          playing: rs.playing,
          currentBarIndex: rs.currentBarIndex,
          currentBarTime: rs.currentBarTime,
        });
        return;
      }
      if (rs.currentBarTime == null) return;
      const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      const snap = pane?._replaySnapshot;
      if (!snap?.bars?.length || !pane) return;
      if (!playback.resolveNextReplayCursor(rs, snap, pane) && !snapshot.hasForwardBars()) return;
      replay.play();
    },
    getDebugSnapshot: () => buildReplayEngineDebugSnapshot(ctx, replay, state),
  };
}
