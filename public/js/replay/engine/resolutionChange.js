import { resolutionSec } from "../../chart/resolutions.js";
import { invalidatePaneChartView } from "../../chart/pane/viewCache.js";
import { captureViewportBarLayout } from "../../chart/pane/viewportBarLayout.js";
import { isReplayHostControlled } from "../hostControl.js";
import { patchReplayHtfFormingBar, resolveReplayCursorOnTfSwitch } from "../formingBar.js";
import { barsCoverReplayAnchor, replayBarIndexForUtcTime } from "../persist.js";
import { replayDebug } from "../debug.js";

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("../mode.js").mountReplayMode>} replay
 * @param {import("./types.js").ReplayEngineState} state
 * @param {object} deps
 */
export function createReplayResolutionChange(ctx, replay, state, deps) {
  /** @param {object} pane @param {number} cutUtc */
  async function ensurePaneBarsReachReplayCut(pane, cutUtc) {
    const barSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(pane.resolution) ?? 60;
    if (barsCoverReplayAnchor(pane.bars, cutUtc, barSec)) return true;

    replayDebug("resolutionChange.reload", {
      pane: pane.index,
      cutUtc,
      liveEndUtc: state.replayLiveEndUtc ?? ctx.replayLiveEndUtc,
      first: pane.bars[0]?.time,
      last: pane.bars.at(-1)?.time,
      barSec,
    });

    await ctx.loadPaneBars?.(pane, {
      force: true,
      deferChartRefresh: state.replayTfChangeInFlight,
    });
    return barsCoverReplayAnchor(pane.bars, cutUtc, barSec);
  }

  async function onChartResolutionChange() {
    const rs = replay.getState();
    if (!rs.active) return;

    if (isReplayHostControlled(ctx)) {
      const activePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (!activePane?.bars?.length) return;

      const fromRes = state.ltResolutionBeforeTfSwitch;
      const rawAnchorUtc =
        (typeof ctx.opts?.getPlaybackAnchorRawSec === "function"
          ? ctx.opts.getPlaybackAnchorRawSec()
          : null) ?? null;

      const fromSec = fromRes ? resolutionSec(fromRes) : null;
      const toSec = resolutionSec(activePane.resolution);

      let anchorUtc =
        (typeof ctx.opts?.getPlaybackAnchorSec === "function"
          ? ctx.opts.getPlaybackAnchorSec(activePane.resolution)
          : null) ?? rs.currentBarTime;

      // HTF → LTF: keep raw replay cursor (e.g. 9:29), not HTF bucket open (9:15).
      if (rawAnchorUtc != null && fromSec != null && toSec != null && toSec < fromSec) {
        anchorUtc = rawAnchorUtc;
      }

      let bars = activePane.bars;
      let cursorUtc = anchorUtc ?? bars.at(-1)?.time;
      if (cursorUtc == null) return;

      if (deps.restorePaneBarsForReplayResolution?.(activePane, cursorUtc)) {
        invalidatePaneChartView(activePane);
        bars = activePane.bars;
      }

      // ponytail: safety net if a coarse series was restored onto a finer TF
      const expectedSec = toSec ?? resolutionSec(activePane.resolution);
      if (bars.length >= 2 && expectedSec != null) {
        const tailGap = bars.at(-1).time - bars.at(-2).time;
        if (tailGap > expectedSec * 1.5) {
          replayDebug("resolutionChange.reloadCoarse", {
            resolution: activePane.resolution,
            tailGap,
            expectedSec,
          });
          await ctx.loadPaneBars?.(activePane, {
            force: true,
            deferChartRefresh: state.replayTfChangeInFlight,
          });
          bars = activePane.bars;
        }
      }

      if (
        state.ltBarsBeforeTfSwitch?.length &&
        fromRes &&
        rawAnchorUtc != null &&
        fromSec != null &&
        toSec != null &&
        toSec > fromSec
      ) {
        const snap = { bars: activePane.bars };
        const patch = patchReplayHtfFormingBar(
          activePane,
          rawAnchorUtc,
          snap,
          state.ltBarsBeforeTfSwitch,
          fromRes,
          replayBarIndexForUtcTime,
        );
        if (patch.ok) {
          activePane.bars = snap.bars;
          invalidatePaneChartView(activePane);
          ctx.refreshPaneCandleData?.(activePane);
          bars = activePane.bars;
          replayDebug("forming.patch.host", patch);
        }
      }
      deps.clearLtBarsStash();

      const lastBarTime = bars.at(-1)?.time;
      if (lastBarTime != null && lastBarTime > cursorUtc) {
        const trimIdx = replayBarIndexForUtcTime(bars, cursorUtc);
        if (trimIdx != null && trimIdx < bars.length - 1) {
          activePane.bars = bars.slice(0, trimIdx + 1);
          invalidatePaneChartView(activePane);
          bars = activePane.bars;
        }
      }

      const currentIdx = replayBarIndexForUtcTime(bars, cursorUtc) ?? bars.length - 1;
      cursorUtc = bars[currentIdx]?.time ?? cursorUtc;
      activePane.replayCursorEndIndex = currentIdx;

      replay.setReplayPosition({
        selectedBarIndex: currentIdx,
        currentBarIndex: currentIdx,
        selectedBarTime: cursorUtc,
        currentBarTime: cursorUtc,
      });
      state.lastAppliedEndIndex = currentIdx;
      state.lastAppliedBarTime = cursorUtc;
      state.replayBarsByResolution.set(activePane.resolution, {
        bars: activePane.bars.slice(),
        cursorUtc,
      });
      state.replayCursorAtEntry.set(activePane.resolution, cursorUtc);

      const logicalRange = deps.resolveReplayViewportLogicalRange?.(
        activePane,
        currentIdx,
        fromRes,
      );
      ctx.refreshPaneCandleData?.(activePane, {
        logicalRange: logicalRange ?? undefined,
        deferSessionBg: true,
      });

      // Defer stash until LWC settles after setData (immediate capture sees width ~10).
      if (ctx.settingsStore && ctx.resolutions && logicalRange) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const captured = captureViewportBarLayout(
              activePane,
              ctx.settingsStore,
              ctx.resolutions,
            );
            if (captured?.width >= 10) {
              state.replayViewportByResolution.set(activePane.resolution, captured);
            }
          });
        });
      }

      replayDebug("resolutionChange.hostControlled", {
        cursorUtc,
        bars: bars.length,
        last: bars.at(-1)?.time,
        close: bars.at(-1)?.close,
        resolution: activePane.resolution,
        currentIdx,
        fromResolution: fromRes,
      });

      ctx.replayFutureDim?.refreshAll?.();
      activePane.sessionBg?.requestRefresh();
      return;
    }

    if (rs.currentBarTime == null) return;

    state.replayTfChangeInFlight = true;
    state.replaySkipSyncApply = true;
    const allPanes = ctx.getAllChartPanes();
    for (const pane of allPanes) pane._suppressHistoryPrefetch = true;
    try {
      const selectedUtc = rs.selectedBarTime ?? rs.currentBarTime;
      let cursorUtc = rs.currentBarTime;
      const priorLiveEnd =
        (ctx.getActivePane?.() ?? ctx.chartPanes.get(0))?._replaySnapshot?.liveEndBarTime ?? null;

      state.lastAppliedEndIndex = null;
      state.lastAppliedBarTime = null;

      for (const pane of ctx.getAllChartPanes()) {
        delete pane._replaySnapshot;
        delete pane.replayCursorEndIndex;
      }

      const activePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (!activePane) return;

      const liveEnd = state.replayLiveEndUtc ?? ctx.replayLiveEndUtc ?? priorLiveEnd ?? cursorUtc;
      const targetRes = activePane.resolution;
      const fromRes = state.ltResolutionBeforeTfSwitch;
      const fromStash = fromRes ? state.replayBarsByResolution.get(fromRes) : null;
      const fromCursor = fromStash?.cursorUtc ?? rs.currentBarTime;

      cursorUtc = resolveReplayCursorOnTfSwitch({
        fromResolution: fromRes,
        fromCursor,
        toResolution: targetRes,
        targetCached: state.replayBarsByResolution.get(targetRes),
        entryCursor: fromRes ? state.replayCursorAtEntry.get(fromRes) : null,
      });

      replayDebug("resolutionChange.cursor", {
        fromResolution: fromRes,
        fromCursor,
        toResolution: targetRes,
        cursorUtc,
        entryCursor: fromRes ? state.replayCursorAtEntry.get(fromRes) : null,
        targetCached: state.replayBarsByResolution.get(targetRes)?.cursorUtc,
      });

      const covered = await ensurePaneBarsReachReplayCut(activePane, cursorUtc);
      if (!covered) {
        replayDebug("resolutionChange.fail", {
          selectedUtc,
          cursorUtc,
          bars: activePane.bars.length,
          first: activePane.bars[0]?.time,
          last: activePane.bars.at(-1)?.time,
          resolution: activePane.resolution,
        });
        return;
      }

      const paneSec = ctx.barSecForPaneLocal?.(activePane) ?? resolutionSec(activePane.resolution);
      if (paneSec <= resolutionSec("1")) {
        await deps.ensureReplayLtBarsForCursor(activePane, cursorUtc);
      }
      deps.restorePaneBarsForReplayResolution(activePane, cursorUtc);

      deps.replaceReplaySnapshots(cursorUtc, liveEnd);

      const snap = activePane._replaySnapshot;
      if (snap && state.ltBarsBeforeTfSwitch?.length && state.ltResolutionBeforeTfSwitch) {
        const fromSec = resolutionSec(state.ltResolutionBeforeTfSwitch);
        const toSec = resolutionSec(activePane.resolution);
        if (toSec > fromSec) {
          if (
            !state.replayLtBarsForForming ||
            fromSec <= resolutionSec(state.replayLtBarsForForming.resolution)
          ) {
            deps.seedReplayLtBarsForForming(
              state.ltResolutionBeforeTfSwitch,
              state.ltBarsBeforeTfSwitch,
              cursorUtc,
            );
          }
          const htfIdx = replayBarIndexForUtcTime(snap.bars, cursorUtc);
          const htfOpen = htfIdx != null ? snap.bars[htfIdx]?.time : null;
          let ltBars = state.ltBarsBeforeTfSwitch;

          if (htfOpen != null) {
            const sub = ltBars.filter((b) => b.time >= htfOpen && b.time <= cursorUtc);
            const needsFetch =
              !sub.length || sub.at(-1).time < cursorUtc || sub[0].time > htfOpen;
            if (needsFetch) {
              ltBars = await deps.fetchLtBarsForReplayPeriod(
                activePane,
                state.ltResolutionBeforeTfSwitch,
                htfOpen,
                cursorUtc,
                ltBars,
              );
            }
          }

          const patch = patchReplayHtfFormingBar(
            activePane,
            cursorUtc,
            snap,
            ltBars,
            state.ltResolutionBeforeTfSwitch,
            replayBarIndexForUtcTime,
          );
          replayDebug(patch.ok ? "forming.patch" : "forming.patch.skip", patch);
          if (ltBars?.length) {
            state.replayLtBarsForForming = { resolution: state.ltResolutionBeforeTfSwitch, bars: ltBars };
            deps.syncLtBarsCacheForCursor(cursorUtc);
          }
        }
      }
      const fromResForViewport = state.ltResolutionBeforeTfSwitch;
      deps.clearLtBarsStash();

      for (const pane of ctx.getAllChartPanes()) {
        deps.mergePaneHistoryIntoSnapshot(pane);
      }

      const bars = snap?.bars ?? activePane.bars;
      if (!bars?.length) return;

      const selectedIdx = replayBarIndexForUtcTime(bars, selectedUtc);
      const currentIdx = replayBarIndexForUtcTime(bars, cursorUtc);
      if (selectedIdx == null || currentIdx == null) {
        replayDebug("resolutionChange.fail", {
          selectedUtc,
          cursorUtc,
          bars: bars.length,
          first: bars[0]?.time,
          last: bars.at(-1)?.time,
          resolution: activePane.resolution,
        });
        return;
      }

      for (const pane of ctx.getAllChartPanes()) {
        const pSnap = pane._replaySnapshot;
        if (!pSnap?.bars?.length) continue;
        deps.syncPaneBarsToReplayEnd(pane, pSnap, currentIdx);
      }

      const logicalRange = deps.resolveReplayViewportLogicalRange(
        activePane,
        currentIdx,
        fromResForViewport,
      );

      ctx.refreshPaneCandleData?.(activePane, {
        logicalRange: logicalRange ?? undefined,
        deferSessionBg: true,
      });

      replay.setReplayPosition({
        selectedBarIndex: selectedIdx,
        currentBarIndex: currentIdx,
        selectedBarTime: selectedUtc,
        currentBarTime: cursorUtc,
      });

      state.lastAppliedEndIndex = currentIdx;
      state.lastAppliedBarTime = cursorUtc;

      state.replayBarsByResolution.set(activePane.resolution, {
        bars: activePane.bars.slice(),
        cursorUtc,
      });
      state.replayCursorAtEntry.set(activePane.resolution, cursorUtc);

      ctx.applyPriceScaleMarginsForPane?.(activePane);
      activePane.sessionBg?.requestRefresh();
      ctx.replayFutureDim?.refreshAll?.();

      if (activePane.index === 0) ctx.bars = activePane.bars;

      replayDebug("resolutionChange", {
        selectedUtc,
        cursorUtc,
        mappedBarTime: bars[currentIdx]?.time,
        resolution: activePane.resolution,
        autoSelectInterval: rs.autoSelectInterval,
      });
    } finally {
      state.replaySkipSyncApply = false;
      state.replayTfChangeInFlight = false;
      requestAnimationFrame(() => {
        for (const pane of ctx.getAllChartPanes()) {
          delete pane._suppressHistoryPrefetch;
        }
      });
    }
  }

  return { onChartResolutionChange };
}
