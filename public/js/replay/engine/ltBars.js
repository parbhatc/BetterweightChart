import { buildTvPeriodParams } from "../../app/bar/periodParams.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { captureViewportBarLayout } from "../../chart/pane/viewportBarLayout.js";
import { invalidatePaneChartView } from "../../chart/pane/viewCache.js";
import { isReplayHostControlled } from "../hostControl.js";
import { patchReplayHtfFormingBar } from "../formingBar.js";
import { barsCoverReplayAnchor, replayBarIndexForUtcTime, trimBarsToUtcTime } from "../persist.js";
import { replayDebug } from "../debug.js";

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("../mode.js").mountReplayMode>} replay
 * @param {import("./types.js").ReplayEngineState} state
 */
export function createReplayLtBars(ctx, replay, state) {
  function clearLtBarsStash() {
    state.ltBarsBeforeTfSwitch = null;
    state.ltResolutionBeforeTfSwitch = null;
  }

  function clearReplayBarsByResolution() {
    state.replayBarsByResolution.clear();
    state.replayCursorAtEntry.clear();
    state.replayViewportByResolution.clear();
    state.replayLtBarsForForming = null;
  }

  /** @param {string} resolution @param {object[]} bars @param {number} cursorUtc */
  function seedReplayLtBarsForForming(resolution, bars, cursorUtc) {
    if (!resolution || !bars?.length || cursorUtc == null) return;
    state.replayLtBarsForForming = {
      resolution,
      bars: trimBarsToUtcTime(bars.slice(), cursorUtc),
    };
  }

  /** @param {object} pane @param {number} cursorUtc */
  function syncReplayLtBarsFromPane(pane, cursorUtc) {
    const snap = pane._replaySnapshot;
    const src =
      snap?.bars?.length && (snap.bars.at(-1)?.time ?? 0) >= cursorUtc ? snap.bars : pane.bars;
    if (!src?.length) return;
    seedReplayLtBarsForForming(pane.resolution, src, cursorUtc);
  }

  /**
   * @param {object} pane
   * @param {string} ltResolution
   * @param {number} fromUtc
   * @param {number} toUtc
   * @param {object[]} mergeWith
   */
  async function fetchLtBarsForReplayPeriod(pane, ltResolution, fromUtc, toUtc, mergeWith = []) {
    if (!pane.symbolInfo && pane.symbol) {
      pane.symbolInfo = await ctx.datafeed.resolveSymbol(pane.symbol);
    }
    if (!pane.symbolInfo) return mergeWith;

    const barSec = resolutionSec(ltResolution);
    const countBack = Math.min(500, Math.max(2, Math.ceil((toUtc - fromUtc) / barSec) + 4));
    const params = buildTvPeriodParams({
      barSec,
      countBack,
      to: toUtc,
      firstDataRequest: false,
    });

    try {
      const result = await ctx.datafeed.getBars(pane.symbolInfo, ltResolution, params);
      const fetched = (result.bars ?? []).filter((b) => b.time >= fromUtc && b.time <= toUtc);
      const seen = new Set();
      return [...mergeWith, ...fetched].filter((b) => {
        if (seen.has(b.time)) return false;
        seen.add(b.time);
        return true;
      });
    } catch (err) {
      replayDebug("forming.fetch.fail", { err: String(err) });
      return mergeWith;
    }
  }

  /** @param {number} cursorUtc */
  function syncLtBarsCacheForCursor(cursorUtc) {
    if (!state.replayLtBarsForForming?.bars?.length || cursorUtc == null) return;
    const res = state.replayLtBarsForForming.resolution;
    const existing = state.replayBarsByResolution.get(res);
    state.replayBarsByResolution.set(res, {
      bars: trimBarsToUtcTime(state.replayLtBarsForForming.bars, cursorUtc),
      cursorUtc: existing?.cursorUtc ?? cursorUtc,
    });
  }

  /** @param {object} pane @param {number} cursorUtc @returns {boolean} */
  function restorePaneBarsForReplayResolution(activePane, cursorUtc) {
    const lt = state.replayLtBarsForForming;
    const paneSec = ctx.barSecForPaneLocal?.(activePane) ?? resolutionSec(activePane.resolution);
    // Only reuse forming LTF stash when switching back to that exact resolution (never HTF → LTF).
    if (
      lt?.bars?.length &&
      lt.resolution === activePane.resolution &&
      barsCoverReplayAnchor(lt.bars, cursorUtc, paneSec)
    ) {
      activePane.bars = trimBarsToUtcTime(lt.bars, cursorUtc);
      invalidatePaneChartView(activePane);
      state.replayBarsByResolution.set(activePane.resolution, {
        bars: activePane.bars.slice(),
        cursorUtc,
      });
      replayDebug("resolutionChange.restoreLtBars", {
        resolution: activePane.resolution,
        ltResolution: lt.resolution,
        bars: activePane.bars.length,
        last: activePane.bars.at(-1)?.time,
        close: activePane.bars.at(-1)?.close,
      });
      return true;
    }

    const cached = state.replayBarsByResolution.get(activePane.resolution);
    // A cached series written before the cursor advanced (steps taken on another
    // TF) has a stale forming bar — its OHLC misses those steps. Only restore
    // when it was captured at this exact cursor; otherwise fetch fresh.
    const cachedFresh =
      cached?.cursorUtc == null || !isReplayHostControlled(ctx)
        ? true
        : cached.cursorUtc >= cursorUtc;
    if (cached?.bars?.length && cachedFresh && barsCoverReplayAnchor(cached.bars, cursorUtc, paneSec)) {
      activePane.bars = trimBarsToUtcTime(cached.bars, cursorUtc);
      invalidatePaneChartView(activePane);
      replayDebug("resolutionChange.restoreCached", {
        resolution: activePane.resolution,
        bars: activePane.bars.length,
        last: activePane.bars.at(-1)?.time,
        close: activePane.bars.at(-1)?.close,
        cursorUtc,
        cachedCursor: cached.cursorUtc,
      });
      return true;
    }
    return false;
  }

  /** @param {object} pane @param {number} cursorUtc */
  async function ensureReplayLtBarsForCursor(pane, cursorUtc) {
    if (cursorUtc == null || !pane) return;

    if (!state.replayLtBarsForForming?.bars?.length) {
      const cached1 = state.replayBarsByResolution.get("1");
      if (cached1?.bars?.length) {
        seedReplayLtBarsForForming("1", cached1.bars, cached1.cursorUtc ?? cursorUtc);
      }
    }

    const paneSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(pane.resolution);
    if (!state.replayLtBarsForForming?.bars?.length) {
      if (paneSec <= resolutionSec("1")) syncReplayLtBarsFromPane(pane, cursorUtc);
      return;
    }

    const ltSec = resolutionSec(state.replayLtBarsForForming.resolution);
    if (paneSec <= ltSec) {
      syncReplayLtBarsFromPane(pane, cursorUtc);
      return;
    }

    const snap = pane._replaySnapshot;
    const idx = replayBarIndexForUtcTime(snap?.bars ?? [], cursorUtc);
    const htfOpen = idx != null ? snap.bars[idx]?.time : null;
    if (htfOpen == null) return;

    let ltBars = state.replayLtBarsForForming.bars;
    const sub = ltBars.filter((b) => b.time >= htfOpen && b.time <= cursorUtc);
    const needsFetch =
      !sub.length || sub.at(-1).time < cursorUtc || sub[0].time > htfOpen;
    if (!needsFetch) return;

    ltBars = await fetchLtBarsForReplayPeriod(
      pane,
      state.replayLtBarsForForming.resolution,
      htfOpen,
      cursorUtc,
      ltBars,
    );
    state.replayLtBarsForForming = { resolution: state.replayLtBarsForForming.resolution, bars: ltBars };
    syncLtBarsCacheForCursor(cursorUtc);
  }

  /** @param {object} pane @param {number} cursorUtc */
  function patchReplayHtfFormingAtCursor(pane, cursorUtc) {
    const snap = pane._replaySnapshot;
    const lt = state.replayLtBarsForForming;
    if (!snap?.bars?.length || !lt?.bars?.length || cursorUtc == null) return null;

    const paneSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(pane.resolution);
    const ltSec = resolutionSec(lt.resolution);
    if (paneSec <= ltSec) return null;

    const patch = patchReplayHtfFormingBar(
      pane,
      cursorUtc,
      snap,
      lt.bars,
      lt.resolution,
      replayBarIndexForUtcTime,
    );
    if (patch.ok) replayDebug("forming.patch.step", patch);
    else if (patch.reason !== "notForming") replayDebug("forming.patch.step.skip", patch);
    return patch;
  }

  /** @param {object} pane @returns {number | null} */
  function resolveReplayCursorUtc(pane) {
    const rs = replay.getState();
    if (rs.currentBarTime != null) return rs.currentBarTime;
    if (!isReplayHostControlled(ctx)) return null;
    const raw =
      typeof ctx.opts?.getPlaybackAnchorRawSec === "function"
        ? ctx.opts.getPlaybackAnchorRawSec()
        : null;
    if (raw != null && Number.isFinite(raw)) return raw;
    const capped =
      typeof ctx.opts?.getPlaybackAnchorSec === "function"
        ? ctx.opts.getPlaybackAnchorSec(pane?.resolution ?? "1")
        : null;
    return capped != null && Number.isFinite(capped) ? capped : null;
  }

  /**
   * @param {object} pane
   * @param {{ viewportLayout?: ReturnType<typeof captureViewportBarLayout> | null }} [opts]
   */
  function beforeResolutionChange(pane, opts = {}) {
    const rs = replay.getState();
    // TF switch invalidates the forward stash (it holds OLD-resolution bars; once
    // pane.resolution flips, validForwardStash would happily append them into the
    // new series → minute-range candles on a 30s chart). Also mark the switch in
    // flight so host cursor syncs don't trim/stash old bars under the new label.
    delete pane._hostReplayForwardBars;
    if (isReplayHostControlled(ctx)) pane._hostReplayTfSwitchInFlight = true;
    const cursorUtc = resolveReplayCursorUtc(pane);
    if (!rs.active || cursorUtc == null) {
      clearLtBarsStash();
      if (!isReplayHostControlled(ctx)) {
        clearReplayBarsByResolution();
      }
      return;
    }
    const snap = pane._replaySnapshot;
    const src =
      snap?.bars?.length && (snap.bars.at(-1)?.time ?? 0) >= cursorUtc
        ? snap.bars
        : pane.bars;
    if (!src?.length) {
      clearLtBarsStash();
      return;
    }
    const fullBars = src.slice();
    state.ltBarsBeforeTfSwitch = trimBarsToUtcTime(fullBars, cursorUtc);
    state.ltResolutionBeforeTfSwitch = pane.resolution ?? null;
    if (state.ltResolutionBeforeTfSwitch) {
      const viewportLayout =
        opts.viewportLayout ??
        captureViewportBarLayout(pane, ctx.settingsStore, ctx.resolutions);
      if (viewportLayout && viewportLayout.width >= 10) {
        state.replayViewportByResolution.set(state.ltResolutionBeforeTfSwitch, viewportLayout);
      }
      state.replayBarsByResolution.set(state.ltResolutionBeforeTfSwitch, {
        bars: fullBars,
        cursorUtc,
      });
      const ltSec = resolutionSec(state.ltResolutionBeforeTfSwitch);
      if (!state.replayLtBarsForForming || ltSec <= resolutionSec(state.replayLtBarsForForming.resolution)) {
        seedReplayLtBarsForForming(state.ltResolutionBeforeTfSwitch, state.ltBarsBeforeTfSwitch, cursorUtc);
      }
    }
    replayDebug("tfSwitch.stash", {
      resolution: state.ltResolutionBeforeTfSwitch,
      bars: state.ltBarsBeforeTfSwitch.length,
      cursor: cursorUtc,
      close: state.ltBarsBeforeTfSwitch.at(-1)?.close,
      viewportWidth: opts.viewportLayout?.width ?? null,
    });
  }

  return {
    clearLtBarsStash,
    clearReplayBarsByResolution,
    seedReplayLtBarsForForming,
    syncReplayLtBarsFromPane,
    fetchLtBarsForReplayPeriod,
    syncLtBarsCacheForCursor,
    restorePaneBarsForReplayResolution,
    ensureReplayLtBarsForCursor,
    patchReplayHtfFormingAtCursor,
    beforeResolutionChange,
  };
}
