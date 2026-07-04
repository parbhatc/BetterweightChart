import { alignBarTime } from "../../app/bar/periodParams.js";
import { buildTvPeriodParams } from "../../app/bar/periodParams.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { setResolutionCacheReplayTtl, clearResolutionCache } from "../../app/bar/resolutionCache.js";
import { clearAllHtfBars } from "../../app/bar/htfBarCache.js";
import { trimBarsToUtcTime } from "../persist.js";
import { replayDebug } from "../debug.js";

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("../mode.js").mountReplayMode>} replay
 * @param {import("./types.js").ReplayEngineState} state
 */
export function createReplaySnapshot(ctx, replay, state) {
  function clearBarCachesForReplay() {
    clearResolutionCache();
    clearAllHtfBars();
    replayDebug("caches.clear");
  }

  /**
   * @param {object} pane
   * @param {number} cutTime
   * @param {number | null | undefined} hintedLiveEnd
   */
  function resolveReplayLiveEndBarTime(pane, cutTime, hintedLiveEnd) {
    const barSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(pane.resolution) ?? 60;
    const nowAligned = alignBarTime(Date.now() / 1000, barSec);
    const marketEnd = pane._replayMarketEndUtc ?? null;
    let liveEnd =
      hintedLiveEnd ??
      marketEnd ??
      ctx.replayLiveEndUtc ??
      state.replayLiveEndUtc ??
      pane.bars.at(-1)?.time ??
      cutTime;
    if (marketEnd != null) liveEnd = Math.max(liveEnd, marketEnd);
    if (liveEnd <= cutTime && nowAligned > cutTime) liveEnd = nowAligned;
    return liveEnd;
  }

  /** @param {object} pane @param {number} cutTime */
  function refreshSnapshotLiveEndIfStale(pane, cutTime) {
    const snap = pane._replaySnapshot;
    if (!snap || cutTime == null) return;
    const liveEnd = resolveReplayLiveEndBarTime(pane, cutTime, snap.liveEndBarTime);
    if (liveEnd <= (snap.liveEndBarTime ?? cutTime)) return;
    snap.liveEndBarTime = liveEnd;
    snap.partial = cutTime < liveEnd;
    state.replayLiveEndUtc = liveEnd;
    ctx.replayLiveEndUtc = liveEnd;
    replayDebug("liveEnd.refresh", { pane: pane.index, cutTime, liveEnd, partial: snap.partial });
  }

  function refreshAllSnapshotLiveEnds() {
    const rs = replay.getState();
    const cut = rs.currentBarTime ?? rs.selectedBarTime;
    if (cut == null) return;
    for (const pane of ctx.getAllChartPanes()) {
      refreshSnapshotLiveEndIfStale(pane, cut);
    }
  }

  /**
   * @param {object} pane
   * @param {number} cutTime simulated "now" (selected bar)
   * @param {number | null | undefined} liveEndBarTime real market end for forward fetch
   */
  function initReplaySnapshotForPane(pane, cutTime, liveEndBarTime) {
    const liveEnd = liveEndBarTime ?? pane.bars.at(-1)?.time ?? cutTime;
    state.replayLiveEndUtc = liveEnd;
    ctx.replayLiveEndUtc = liveEnd;
    const trimmed = trimBarsToUtcTime(pane.bars, cutTime);
    pane._replaySnapshot = {
      bars: trimmed,
      cursorTime: cutTime,
      fullEndBarTime: cutTime,
      liveEndBarTime: liveEnd,
      partial: cutTime != null && liveEnd != null && cutTime < liveEnd,
    };
  }

  /** Trim snapshot when user moves replay cursor backward. */
  function trimReplaySnapshotsToCut(cutTime) {
    for (const pane of ctx.getAllChartPanes()) {
      const snap = pane._replaySnapshot;
      if (!snap?.bars?.length || cutTime == null) continue;
      snap.bars = trimBarsToUtcTime(snap.bars, cutTime);
      snap.cursorTime = cutTime;
      snap.fullEndBarTime = cutTime;
      const liveEnd = snap.liveEndBarTime ?? cutTime;
      snap.partial = (snap.bars.at(-1)?.time ?? 0) < liveEnd;
    }
  }

  function hasForwardBars() {
    refreshAllSnapshotLiveEnds();
    for (const pane of ctx.getAllChartPanes()) {
      const snap = pane._replaySnapshot;
      if (!snap?.partial) continue;
      const last = snap.bars.at(-1);
      const liveEnd = snap.liveEndBarTime ?? ctx.replayLiveEndUtc ?? state.replayLiveEndUtc;
      if (last && liveEnd != null && last.time < liveEnd) return true;
    }
    return false;
  }

  /** @param {number | null | undefined} cutTime */
  function captureSnapshots(cutTime) {
    const cut = cutTime ?? replay.getState().currentBarTime ?? replay.getState().selectedBarTime;
    if (cut == null) return;

    const creating = ctx.getAllChartPanes().some((p) => !p._replaySnapshot);
    if (creating) clearBarCachesForReplay();

    for (const pane of ctx.getAllChartPanes()) {
      if (pane._replaySnapshot) continue;
      const liveEnd = resolveReplayLiveEndBarTime(pane, cut, pane.bars.at(-1)?.time ?? cut);
      initReplaySnapshotForPane(pane, cut, liveEnd);
      replayDebug("snapshot.cut", {
        pane: pane.index,
        cutTime: cut,
        liveEnd: pane._replaySnapshot.liveEndBarTime,
        bars: pane._replaySnapshot.bars.length,
      });
    }
  }

  /** @param {number} cutTime @param {number | null | undefined} liveEndBarTime */
  function replaceReplaySnapshots(cutTime, liveEndBarTime) {
    for (const pane of ctx.getAllChartPanes()) {
      const liveEnd = liveEndBarTime ?? pane._replaySnapshot?.liveEndBarTime ?? pane.bars.at(-1)?.time;
      initReplaySnapshotForPane(pane, cutTime, liveEnd);
    }
  }

  function restoreSnapshotFromPartial(pane, session) {
    const cut = session.currentBarTime;
    const liveEnd = resolveReplayLiveEndBarTime(pane, cut, session.fullEndBarTime);
    initReplaySnapshotForPane(pane, cut, liveEnd);
    pane.bars = pane._replaySnapshot.bars.slice();
  }

  async function ensureSnapshotForward(pane) {
    const snap = pane._replaySnapshot;
    const cut = snap?.cursorTime ?? replay.getState().currentBarTime;
    if (cut != null) refreshSnapshotLiveEndIfStale(pane, cut);
    const liveEnd = snap?.liveEndBarTime ?? ctx.replayLiveEndUtc ?? state.replayLiveEndUtc;
    if (!snap?.partial || liveEnd == null) return;

    const last = snap.bars.at(-1);
    if (!last || last.time >= liveEnd) {
      snap.partial = false;
      return;
    }

    if (!pane.symbolInfo && pane.symbol) {
      pane.symbolInfo = await ctx.datafeed.resolveSymbol(pane.symbol);
    }
    if (!pane.symbolInfo) return;

    const barSec = ctx.barSecForPaneLocal?.(pane) ?? 60;
    const to = liveEnd;
    const countBack = Math.min(
      2000,
      Math.max(2, Math.ceil((to - last.time) / barSec) + 2),
    );
    const params = buildTvPeriodParams({
      barSec,
      countBack,
      to,
      firstDataRequest: false,
    });

    try {
      const result = await ctx.datafeed.getBars(pane.symbolInfo, pane.resolution, params);
      const extra = (result.bars ?? []).filter((b) => b.time > last.time && b.time <= to);
      if (extra.length) {
        const merged = [...snap.bars, ...extra];
        const seen = new Set();
        snap.bars = merged.filter((b) => {
          if (seen.has(b.time)) return false;
          seen.add(b.time);
          return true;
        });
      }
      snap.partial = (snap.bars.at(-1)?.time ?? 0) < liveEnd;
      replayDebug("forwardFetch", { pane: pane.index, bars: snap.bars.length, partial: snap.partial });
    } catch (err) {
      replayDebug("forwardFetch.fail", { pane: pane.index, err: String(err) });
    }
  }

  async function ensureAllSnapshotsForward() {
    await Promise.all(ctx.getAllChartPanes().map((pane) => ensureSnapshotForward(pane)));
  }

  function getMaxBarIndex() {
    let max = 0;
    for (const pane of ctx.getAllChartPanes()) {
      const snap = pane._replaySnapshot;
      if (snap?.bars?.length) max = Math.max(max, snap.bars.length - 1);
    }
    return max;
  }

  return {
    clearBarCachesForReplay,
    resolveReplayLiveEndBarTime,
    refreshAllSnapshotLiveEnds,
    initReplaySnapshotForPane,
    trimReplaySnapshotsToCut,
    hasForwardBars,
    captureSnapshots,
    replaceReplaySnapshots,
    restoreSnapshotFromPartial,
    ensureAllSnapshotsForward,
    getMaxBarIndex,
    setResolutionCacheReplayTtl,
  };
}
