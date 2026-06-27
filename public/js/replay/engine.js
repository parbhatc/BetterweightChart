import { buildTvPeriodParams, alignBarTime } from "../app/bar/periodParams.js";
import { resolutionSec } from "../chart/resolutions.js";
import { replayBarsPerStep, replayPlayIntervalMs, normalizeStepInterval } from "./menus.js";
import {
  appendNewBarOnPaneSeries,
  updateFormingBarOnPaneSeries,
} from "../chart/pane/data.js";
import { getPaneChartView, invalidatePaneChartView } from "../chart/pane/viewCache.js";
import { replayDebug } from "./debug.js";
import { isReplayHostControlled, emitReplayHostAction } from "./hostControl.js";
import { patchReplayHtfFormingBar, resolveReplayCursorOnTfSwitch } from "./formingBar.js";
import { setResolutionCacheReplayTtl, clearResolutionCache } from "../app/bar/resolutionCache.js";
import { clearAllHtfBars } from "../app/bar/htfBarCache.js";
import {
  barsCoverReplayAnchor,
  buildReplaySessionPayload,
  clearReplaySession,
  replayBarIndexForUtcTime,
  saveReplaySession,
  trimBarsToUtcTime,
} from "./persist.js";
import {
  captureViewportBarLayout,
  computeViewportBarLayoutLogical,
  computeViewportLogicalFromUtc,
  restoreViewportBarLayout,
  restoreViewportBarLayoutFromUtc,
} from "../chart/pane/viewportBarLayout.js";

/**
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("./mode.js").mountReplayMode>} replay
 */
export function attachReplayEngine(ctx, replay) {
  /** @type {ReturnType<typeof setInterval> | null} */
  let playTimer = null;
  /** @type {number | null} */
  let lastAppliedEndIndex = null;
  /** @type {number | null} */
  let lastAppliedBarTime = null;

  /** @param {{ time: number }[]} older @param {{ time: number }[]} existing */
  function mergeBarsDeduped(older, existing) {
    const seen = new Set();
    return [...older, ...existing].filter((b) => {
      if (seen.has(b.time)) return false;
      seen.add(b.time);
      return true;
    });
  }

  /** @type {boolean} */
  let replayTfChangeInFlight = false;
  /** @type {boolean} */
  let replaySkipSyncApply = false;

  /** @param {object} pane @returns {number} bars added to snapshot */
  function mergePaneHistoryIntoSnapshot(pane) {
    const state = replay.getState();
    const snap = pane._replaySnapshot;
    if (!snap?.bars?.length || !pane.bars?.length) return 0;

    const snapFirst = snap.bars[0].time;
    const older = pane.bars.filter((b) => b.time < snapFirst);
    if (!older.length) return 0;

    const beforeLen = snap.bars.length;
    snap.bars = mergeBarsDeduped(older, snap.bars);
    const added = snap.bars.length - beforeLen;
    if (added <= 0) return 0;

    if (lastAppliedEndIndex != null) {
      lastAppliedEndIndex += added;
      pane.replayCursorEndIndex = lastAppliedEndIndex;
    }

    replayDebug("snapshot.prepend", {
      pane: pane.index,
      added,
      total: snap.bars.length,
      cursorIndex: lastAppliedEndIndex,
    });

    if (state.active && state.selectedBarTime != null) {
      const res = pane.resolution;
      if (res && state.currentBarTime != null) {
        replayBarsByResolution.set(res, {
          bars: trimBarsToUtcTime(pane.bars, state.currentBarTime),
          cursorUtc: state.currentBarTime,
        });
      }
      // On a plain boot prepend the bar loader's restoreViewportAfterPrepend keeps
      // the viewport correctly. But after a replay timeframe switch the loader's
      // relative shift is unreliable (it captures a stale logical range), so when we
      // have a stashed layout for this resolution we re-anchor absolutely from the
      // replay cursor. This runs after the loader's deferred restores (debounced
      // onHistoryPrepended), so it wins without a double-shift.
      if (
        res &&
        lastAppliedEndIndex != null &&
        replayViewportByResolution.has(res) &&
        !replayTfChangeInFlight
      ) {
        restoreReplayViewportAfterTfSwitch(pane, lastAppliedEndIndex, null);
        ctx.applyPriceScaleMarginsForPane?.(pane);
      }
      persistSession(state);
    }
    return added;
  }

  /** @param {object} pane */
  function expandPaneForBarSelect(pane) {
    const snap = pane._replaySnapshot;
    if (!snap?.bars?.length) return;

    mergePaneHistoryIntoSnapshot(pane);
    const lastSnap = snap.bars.at(-1)?.time;
    const lastPane = pane.bars.at(-1)?.time;
    if (pane.bars.length === snap.bars.length && lastPane === lastSnap) return;

    pane.bars = snap.bars.slice();
    ctx.refreshPaneCandleData?.(pane);
    ctx.applyPriceScaleMarginsForPane?.(pane);
    pane.priceLineLabel?.requestRefresh();
    pane.sessionBg?.requestRefresh();
    if (pane.index === 0) {
      ctx.bars = pane.bars;
    }
  }

  /** @param {import("./persist.js").ReplayPersistedSession} session @param {object[]} bars */
  function resolveSnapshotIndex(bars, utcTime) {
    return replayBarIndexForUtcTime(bars, utcTime);
  }

  function getMaxBarIndex() {
    let max = 0;
    for (const pane of ctx.getAllChartPanes()) {
      const snap = pane._replaySnapshot;
      if (snap?.bars?.length) max = Math.max(max, snap.bars.length - 1);
    }
    return max;
  }

  /** @type {number | null} */
  let replayLiveEndUtc = null;
  /** @type {object[] | null} */
  let ltBarsBeforeTfSwitch = null;
  /** @type {string | null} */
  let ltResolutionBeforeTfSwitch = null;
  /** @type {Map<string, { bars: object[], cursorUtc: number }>} */
  const replayBarsByResolution = new Map();
  /** @type {Map<string, number>} replay instant when each resolution was last entered */
  const replayCursorAtEntry = new Map();
  /** @type {Map<string, ReturnType<typeof captureViewportBarLayout>>} */
  const replayViewportByResolution = new Map();
  /** @type {{ resolution: string, bars: object[] } | null} */
  let replayLtBarsForForming = null;

  function clearLtBarsStash() {
    ltBarsBeforeTfSwitch = null;
    ltResolutionBeforeTfSwitch = null;
  }

  function clearReplayBarsByResolution() {
    replayBarsByResolution.clear();
    replayCursorAtEntry.clear();
    replayViewportByResolution.clear();
    replayLtBarsForForming = null;
  }

  /** @param {string} resolution @param {object[]} bars @param {number} cursorUtc */
  function seedReplayLtBarsForForming(resolution, bars, cursorUtc) {
    if (!resolution || !bars?.length || cursorUtc == null) return;
    replayLtBarsForForming = {
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

  /** @param {import("./mode.js").ReplayState} state @param {object} pane */
  function replayStepDeltaSec(state, pane) {
    const res = pane?.resolution ?? chartResolution();
    const chartSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(res);
    if (state.autoSelectInterval) {
      return chartSec * replayBarsPerStep(state.stepInterval, res, true);
    }
    const id = normalizeStepInterval(state.stepInterval);
    if (id === "tick") return chartSec;
    if (id === "1S") return 1;
    return resolutionSec(id);
  }

  /**
   * Advance replay cursor by wall-clock step (not next bar open in array).
   * @param {import("./mode.js").ReplayState} state
   * @param {{ bars: object[], liveEndBarTime?: number | null }} snap
   * @param {object} pane
   */
  function resolveNextReplayCursor(state, snap, pane) {
    if (!snap?.bars?.length || state.currentBarTime == null) return null;
    const delta = replayStepDeltaSec(state, pane);
    if (!Number.isFinite(delta) || delta <= 0) return null;
    const liveEnd =
      snap.liveEndBarTime ?? ctx.replayLiveEndUtc ?? replayLiveEndUtc ?? snap.bars.at(-1)?.time;
    if (liveEnd == null) return null;
    const nextTime = Math.min(liveEnd, state.currentBarTime + delta);
    if (nextTime <= state.currentBarTime) return null;
    const nextIdx = replayBarIndexForUtcTime(snap.bars, nextTime);
    if (nextIdx == null) return null;
    return { nextTime, nextIdx };
  }

  /** @param {object} pane @param {number} cursorUtc */
  async function ensureReplayLtBarsForCursor(pane, cursorUtc) {
    if (cursorUtc == null || !pane) return;

    if (!replayLtBarsForForming?.bars?.length) {
      const cached1 = replayBarsByResolution.get("1");
      if (cached1?.bars?.length) {
        seedReplayLtBarsForForming("1", cached1.bars, cached1.cursorUtc ?? cursorUtc);
      }
    }

    const paneSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(pane.resolution);
    if (!replayLtBarsForForming?.bars?.length) {
      if (paneSec <= resolutionSec("1")) syncReplayLtBarsFromPane(pane, cursorUtc);
      return;
    }

    const ltSec = resolutionSec(replayLtBarsForForming.resolution);
    if (paneSec <= ltSec) {
      syncReplayLtBarsFromPane(pane, cursorUtc);
      return;
    }

    const snap = pane._replaySnapshot;
    const idx = replayBarIndexForUtcTime(snap?.bars ?? [], cursorUtc);
    const htfOpen = idx != null ? snap.bars[idx]?.time : null;
    if (htfOpen == null) return;

    let ltBars = replayLtBarsForForming.bars;
    const sub = ltBars.filter((b) => b.time >= htfOpen && b.time <= cursorUtc);
    const needsFetch =
      !sub.length || sub.at(-1).time < cursorUtc || sub[0].time > htfOpen;
    if (!needsFetch) return;

    ltBars = await fetchLtBarsForReplayPeriod(
      pane,
      replayLtBarsForForming.resolution,
      htfOpen,
      cursorUtc,
      ltBars,
    );
    replayLtBarsForForming = { resolution: replayLtBarsForForming.resolution, bars: ltBars };
    syncLtBarsCacheForCursor(cursorUtc);
  }

  /** @param {object} pane @param {number} cursorUtc @returns {boolean} */
  function restorePaneBarsForReplayResolution(activePane, cursorUtc) {
    const lt = replayLtBarsForForming;
    const paneSec = ctx.barSecForPaneLocal?.(activePane) ?? resolutionSec(activePane.resolution);
    if (
      lt?.bars?.length &&
      paneSec <= resolutionSec(lt.resolution) &&
      barsCoverReplayAnchor(lt.bars, cursorUtc, resolutionSec(lt.resolution))
    ) {
      activePane.bars = trimBarsToUtcTime(lt.bars, cursorUtc);
      invalidatePaneChartView(activePane);
      replayBarsByResolution.set(activePane.resolution, {
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

    const cached = replayBarsByResolution.get(activePane.resolution);
    if (cached?.bars?.length && barsCoverReplayAnchor(cached.bars, cursorUtc, paneSec)) {
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

  /** @param {number} cursorUtc */
  function syncLtBarsCacheForCursor(cursorUtc) {
    if (!replayLtBarsForForming?.bars?.length || cursorUtc == null) return;
    const res = replayLtBarsForForming.resolution;
    const existing = replayBarsByResolution.get(res);
    replayBarsByResolution.set(res, {
      bars: trimBarsToUtcTime(replayLtBarsForForming.bars, cursorUtc),
      cursorUtc: existing?.cursorUtc ?? cursorUtc,
    });
  }

  /** @param {object} pane @param {number} cursorUtc */
  function patchReplayHtfFormingAtCursor(pane, cursorUtc) {
    const snap = pane._replaySnapshot;
    const lt = replayLtBarsForForming;
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

  /** @param {object} pane @param {number} endIndex @param {number} [fallbackWidth] */
  function computeScrollToReplayCursorLogical(pane, endIndex, fallbackWidth = 80) {
    const count = pane.bars?.length ?? 0;
    if (!count || endIndex == null || endIndex < 0) return null;
    const ts = pane.chart?.timeScale();
    const offset = ts?.options()?.rightOffset ?? 8;
    const anchor = endIndex + 1;
    const width = fallbackWidth;
    return {
      from: anchor - width + offset * 0.35,
      to: anchor + offset,
    };
  }

  /**
   * UTC time-span restore collapses on large TF jumps (e.g. 1m→1D); prefer bar-slot layout.
   * @param {number | null | undefined} fromSec
   * @param {number | null | undefined} toSec
   */
  function replayViewportPrefersBarSlots(fromSec, toSec) {
    if (fromSec == null || toSec == null || fromSec <= 0 || toSec <= 0) return false;
    return Math.max(fromSec, toSec) / Math.min(fromSec, toSec) > 12;
  }

  /**
   * @param {object} pane
   * @param {number} endIndex
   * @param {string | null} [fromResolution]
   * @returns {{ from: number, to: number } | null}
   */
  function resolveReplayViewportLogicalRange(pane, endIndex, fromResolution = null) {
    if (!pane?.chart) return computeScrollToReplayCursorLogical(pane, endIndex);

    pane.replayCursorEndIndex = endIndex;
    const targetRes = pane.resolution ?? "";
    const toSec = resolutionSec(targetRes);
    const fromRes =
      fromResolution ?? (toSec != null ? inferViewportFromResolution(targetRes) : null);
    const fromSec = fromRes ? resolutionSec(fromRes) : null;
    const fromLayout = fromRes ? replayViewportByResolution.get(fromRes) : null;
    const savedTarget = replayViewportByResolution.get(targetRes);

    /** @type {ReturnType<typeof captureViewportBarLayout> | null} */
    let layout = null;
    /** @type {string} */
    let reason = "fallback";

    if (fromSec != null && toSec != null && toSec > fromSec && fromLayout) {
      layout = fromLayout;
      reason = "lt-htf";
    } else if (fromSec != null && toSec != null && toSec < fromSec && savedTarget) {
      layout = savedTarget;
      reason = "htf-lt";
    } else if (fromSec != null && toSec != null && toSec < fromSec && fromLayout) {
      layout = fromLayout;
      reason = "htf-lt-leaving";
    } else if (savedTarget) {
      layout = savedTarget;
      reason = "cached";
    }

    if (layout) {
      const logical = computeViewportBarLayoutLogical(pane, layout);
      if (logical) {
        replayDebug("viewport.compute", {
          reason,
          fromResolution: fromRes,
          toResolution: targetRes,
          width: layout.width,
          toBeyondAnchor: layout.toBeyondAnchor,
          ...logical,
        });
        return logical;
      }
    }

    if (
      !replayViewportPrefersBarSlots(fromSec, toSec) &&
      fromLayout?.visibleFromUtc != null &&
      fromLayout?.visibleToUtc != null &&
      ctx.settingsStore &&
      ctx.resolutions
    ) {
      const utcLogical = computeViewportLogicalFromUtc(
        pane,
        fromLayout,
        ctx.settingsStore,
        ctx.resolutions,
      );
      if (utcLogical) {
        replayDebug("viewport.compute.utc", {
          reason: "utc-fallback",
          fromResolution: fromRes,
          toResolution: targetRes,
          ...utcLogical,
        });
        return utcLogical;
      }
    }

    if (fromLayout) {
      const barLogical = computeViewportBarLayoutLogical(pane, fromLayout);
      if (barLogical) {
        replayDebug("viewport.compute.barDim", {
          reason: "from-leaving",
          fromResolution: fromRes,
          toResolution: targetRes,
          width: fromLayout.width,
          toBeyondAnchor: fromLayout.toBeyondAnchor,
          ...barLogical,
        });
        return barLogical;
      }
    }

    const fallback = computeScrollToReplayCursorLogical(
      pane,
      endIndex,
      layout?.width ?? fromLayout?.width ?? 80,
    );
    replayDebug("viewport.compute.fallback", { reason, ...fallback });
    return fallback;
  }

  /** @param {object} pane @param {number} endIndex @param {number} [fallbackWidth] */
  function scrollPaneToReplayCursor(pane, endIndex, fallbackWidth = 80) {
    const logical = computeScrollToReplayCursorLogical(pane, endIndex, fallbackWidth);
    if (!logical || !pane.chart) return;
    pane.chart.timeScale().setVisibleLogicalRange(logical);
  }

  /**
   * Finest resolution with a stashed viewport below the target (for HTF re-restore after prepend).
   * @param {string} targetRes
   * @returns {string | null}
   */
  function inferViewportFromResolution(targetRes) {
    const targetSec = resolutionSec(targetRes);
    if (targetSec == null) return null;
    let bestRes = null;
    let bestSec = Infinity;
    for (const res of replayViewportByResolution.keys()) {
      const sec = resolutionSec(res);
      if (sec == null || sec >= targetSec) continue;
      if (sec < bestSec) {
        bestSec = sec;
        bestRes = res;
      }
    }
    return bestRes;
  }

  /**
   * @param {object} pane
   * @param {number} endIndex
   * @param {string | null} [fromResolution]
   */
  function restoreReplayViewportAfterTfSwitch(pane, endIndex, fromResolution = null) {
    if (!pane?.chart || !ctx.settingsStore || !ctx.resolutions) {
      scrollPaneToReplayCursor(pane, endIndex);
      return;
    }

    const viewportOpts = { skipPrice: true };

    pane.replayCursorEndIndex = endIndex;
    const targetRes = pane.resolution ?? "";
    const toSec = resolutionSec(targetRes);
    const fromRes =
      fromResolution ?? (toSec != null ? inferViewportFromResolution(targetRes) : null);
    const fromSec = fromRes ? resolutionSec(fromRes) : null;
    const fromLayout = fromRes ? replayViewportByResolution.get(fromRes) : null;
    const savedTarget = replayViewportByResolution.get(targetRes);

    // Finer -> coarser: reuse leaving TF bar width (same slot count, wider time span on HTF).
    if (fromSec != null && toSec != null && toSec > fromSec && fromLayout) {
      restoreViewportBarLayout(
        pane,
        fromLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "replay-lt-htf",
        ctx.activePriceScaleId,
        viewportOpts,
      );
      replayDebug("viewport.restore.ltHtf", {
        fromResolution: fromRes,
        toResolution: targetRes,
        width: fromLayout.width,
        toBeyondAnchor: fromLayout.toBeyondAnchor,
      });
      return;
    }

    // Coarser -> finer: restore the finer TF's own saved layout.
    if (fromSec != null && toSec != null && toSec < fromSec && savedTarget) {
      restoreViewportBarLayout(
        pane,
        savedTarget,
        ctx.settingsStore,
        ctx.resolutions,
        "replay-htf-lt",
        ctx.activePriceScaleId,
        viewportOpts,
      );
      replayDebug("viewport.restore.htfLt", {
        fromResolution: fromRes,
        toResolution: targetRes,
        width: savedTarget.width,
        toBeyondAnchor: savedTarget.toBeyondAnchor,
      });
      return;
    }

    // Coarser -> finer (first visit): reuse leaving TF bar width.
    if (fromSec != null && toSec != null && toSec < fromSec && fromLayout) {
      restoreViewportBarLayout(
        pane,
        fromLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "replay-htf-lt-leaving",
        ctx.activePriceScaleId,
        viewportOpts,
      );
      replayDebug("viewport.restore.htfLtLeaving", {
        fromResolution: fromRes,
        toResolution: targetRes,
        width: fromLayout.width,
        toBeyondAnchor: fromLayout.toBeyondAnchor,
      });
      return;
    }

    if (savedTarget) {
      restoreViewportBarLayout(
        pane,
        savedTarget,
        ctx.settingsStore,
        ctx.resolutions,
        "replay-tf-restore",
        ctx.activePriceScaleId,
        viewportOpts,
      );
      replayDebug("viewport.restore.cached", {
        resolution: targetRes,
        width: savedTarget.width,
        toBeyondAnchor: savedTarget.toBeyondAnchor,
      });
      return;
    }

    if (
      !replayViewportPrefersBarSlots(fromSec, toSec) &&
      fromLayout?.visibleFromUtc != null &&
      fromLayout?.visibleToUtc != null
    ) {
      restoreViewportBarLayoutFromUtc(
        pane,
        fromLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "replay-tf-utc",
        ctx.activePriceScaleId,
        viewportOpts,
      );
      replayDebug("viewport.restore.utc", {
        fromResolution: fromRes,
        toResolution: targetRes,
        visibleFromUtc: fromLayout.visibleFromUtc,
        visibleToUtc: fromLayout.visibleToUtc,
      });
      return;
    }

    if (fromLayout) {
      restoreViewportBarLayout(
        pane,
        fromLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "replay-bar-dim",
        ctx.activePriceScaleId,
        viewportOpts,
      );
      replayDebug("viewport.restore.barDim", {
        fromResolution: fromRes,
        toResolution: targetRes,
        width: fromLayout.width,
        toBeyondAnchor: fromLayout.toBeyondAnchor,
      });
      return;
    }

    scrollPaneToReplayCursor(pane, endIndex, fromLayout?.width ?? 80);
  }

  /** @param {object} pane */
  function beforeResolutionChange(pane) {
    const state = replay.getState();
    if (!state.active || state.currentBarTime == null) {
      clearLtBarsStash();
      clearReplayBarsByResolution();
      return;
    }
    const snap = pane._replaySnapshot;
    const src =
      snap?.bars?.length && (snap.bars.at(-1)?.time ?? 0) >= state.currentBarTime
        ? snap.bars
        : pane.bars;
    if (!src?.length) {
      clearLtBarsStash();
      return;
    }
    ltBarsBeforeTfSwitch = trimBarsToUtcTime(src.slice(), state.currentBarTime);
    ltResolutionBeforeTfSwitch = pane.resolution ?? null;
    if (ltResolutionBeforeTfSwitch) {
      const viewportLayout = captureViewportBarLayout(
        pane,
        ctx.settingsStore,
        ctx.resolutions,
      );
      if (viewportLayout && viewportLayout.width >= 10) {
        replayViewportByResolution.set(ltResolutionBeforeTfSwitch, viewportLayout);
      }
      replayBarsByResolution.set(ltResolutionBeforeTfSwitch, {
        bars: ltBarsBeforeTfSwitch.slice(),
        cursorUtc: state.currentBarTime,
      });
      const ltSec = resolutionSec(ltResolutionBeforeTfSwitch);
      if (!replayLtBarsForForming || ltSec <= resolutionSec(replayLtBarsForForming.resolution)) {
        seedReplayLtBarsForForming(ltResolutionBeforeTfSwitch, ltBarsBeforeTfSwitch, state.currentBarTime);
      }
    }
    replayDebug("tfSwitch.stash", {
      resolution: ltResolutionBeforeTfSwitch,
      bars: ltBarsBeforeTfSwitch.length,
      cursor: state.currentBarTime,
      close: ltBarsBeforeTfSwitch.at(-1)?.close,
    });
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
      replayLiveEndUtc ??
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
    replayLiveEndUtc = liveEnd;
    ctx.replayLiveEndUtc = liveEnd;
    replayDebug("liveEnd.refresh", { pane: pane.index, cutTime, liveEnd, partial: snap.partial });
  }

  function refreshAllSnapshotLiveEnds() {
    const state = replay.getState();
    const cut = state.currentBarTime ?? state.selectedBarTime;
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
    replayLiveEndUtc = liveEnd;
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
      const liveEnd = snap.liveEndBarTime ?? ctx.replayLiveEndUtc ?? replayLiveEndUtc;
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
    const liveEnd = snap?.liveEndBarTime ?? ctx.replayLiveEndUtc ?? replayLiveEndUtc;
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

  /** @param {object | undefined} a @param {object | undefined} b */
  function barsFormingEqual(a, b) {
    if (!a || !b) return a === b;
    return (
      a.time === b.time &&
      a.open === b.open &&
      a.high === b.high &&
      a.low === b.low &&
      a.close === b.close &&
      a.volume === b.volume
    );
  }

  /** @param {object} pane @param {object} bar */
  function tryAppendReplayBar(pane, bar) {
    const settings = ctx.settingsStore;
    const sym = ctx.symbolInfo ?? pane.symbolInfo;
    const res = ctx.resolutions;
    if (appendNewBarOnPaneSeries(pane, bar, settings, sym, res)) return true;

    pane.bars.pop();
    invalidatePaneChartView(pane);
    getPaneChartView(pane, settings, sym, res);
    pane.bars.push(bar);
    return appendNewBarOnPaneSeries(pane, bar, settings, sym, res);
  }

  /**
   * Sync pane bars to replay cursor using series.update when possible.
   * @param {object} pane
   * @param {object} snap
   * @param {number} endIndex
   * @returns {"skip" | "forming" | "append" | "full"}
   */
  function syncPaneBarsToReplayEnd(pane, snap, endIndex) {
    const max = snap.bars.length - 1;
    const end = Math.min(Math.max(0, endIndex), max);
    const target = snap.bars.slice(0, end + 1);
    const targetBar = target.at(-1);
    if (!targetBar) return "skip";

    pane.replayCursorEndIndex = end;
    const cur = pane.bars;
    const settings = ctx.settingsStore;
    const sym = ctx.symbolInfo ?? pane.symbolInfo;
    const res = ctx.resolutions;
    const skipRefresh = replaySkipSyncApply;

    if (cur.length === target.length && cur.at(-1)?.time === targetBar.time) {
      if (barsFormingEqual(cur.at(-1), targetBar)) return "skip";
      cur[cur.length - 1] = targetBar;
      if (
        !skipRefresh &&
        !updateFormingBarOnPaneSeries(pane, targetBar, settings, sym, res)
      ) {
        pane.bars = target;
        ctx.refreshPaneCandleData?.(pane);
        return "full";
      }
      if (skipRefresh) pane.bars = target;
      return "forming";
    }

    if (!cur.length || cur.length > target.length || cur.at(-1).time > targetBar.time) {
      pane.bars = target;
      if (!skipRefresh) ctx.refreshPaneCandleData?.(pane);
      return "full";
    }

    if (skipRefresh) {
      pane.bars = target;
      return "full";
    }

    for (let i = cur.length; i < target.length; i += 1) {
      const bar = target[i];
      pane.bars.push(bar);
      if (!tryAppendReplayBar(pane, bar)) {
        pane.bars = target;
        ctx.refreshPaneCandleData?.(pane);
        return "full";
      }
    }
    return "append";
  }

  /**
   * @param {number} endIndex
   * @param {{ scroll?: boolean }} [opts]
   */
  function applyReplayEndIndex(endIndex, opts = {}) {
    /** @type {Record<string, number>} */
    const modes = { skip: 0, forming: 0, append: 0, full: 0 };

    for (const pane of ctx.getAllChartPanes()) {
      const snap = pane._replaySnapshot;
      if (!snap?.bars?.length) continue;
      modes[syncPaneBarsToReplayEnd(pane, snap, endIndex)] += 1;
      pane.priceLineLabel?.requestRefresh();
      pane.sessionBg?.requestRefresh();
    }

    const active = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    if (active) {
      if (opts.scroll) ctx.scrollPaneToLatest?.(active);
      if (ctx.indicatorController?.paneHasPlotSeriesIndicators?.(active.index)) {
        ctx.refreshIndicatorsImmediate?.(active.index);
      } else {
        ctx.refreshOverlaysImmediate?.(active.index);
      }
    }

    ctx.replayFutureDim?.refreshAll?.();
    replayDebug("slice.apply", {
      endIndex,
      max: getMaxBarIndex(),
      modes,
    });

    if (modes.full > 0 && !ctx._viewportRestorePending) {
      for (const pane of ctx.getAllChartPanes()) {
        ctx.applyPriceScaleMarginsForPane?.(pane);
      }
    }

    lastAppliedEndIndex = endIndex;
  }

  function restoreLiveData() {
    lastAppliedEndIndex = null;
    lastAppliedBarTime = null;
    clearBarCachesForReplay();
    clearReplayBarsByResolution();
    replayLiveEndUtc = null;
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

  /** @type {boolean} */
  let wasReplayUiActive = false;

  function refreshPriceLabelsForReplay() {
    for (const pane of ctx.getAllChartPanes()) {
      pane.priceLineLabel?.requestRefresh();
    }
  }

  function persistSession(state) {
    if (isReplayHostControlled(ctx)) return;
    if (ctx.replayPendingRestore?.active) return;
    const payload = buildReplaySessionPayload(state, ctx);
    if (payload) {
      saveReplaySession(payload);
      replayDebug("persist.save", {
        currentBarTime: payload.currentBarTime,
        fullEndBarTime: payload.fullEndBarTime,
        symbol: payload.symbol,
        resolution: payload.resolution,
      });
    } else if (!state.active) {
      clearReplaySession();
      replayDebug("persist.clear");
    } else {
      replayDebug("persist.skip", {
        selectedBarTime: state.selectedBarTime,
        currentBarTime: state.currentBarTime,
      });
    }
  }

  function stopPlayTimer() {
    if (playTimer != null) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function chartResolution() {
    const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    return pane?.resolution ?? ctx.resolution ?? "1";
  }

  function playStepBars() {
    const state = replay.getState();
    return replayBarsPerStep(state.stepInterval, chartResolution(), state.autoSelectInterval);
  }

  function startPlayTimer() {
    stopPlayTimer();
    playTimer = setInterval(async () => {
      const state = replay.getState();
      if (!state.playing || state.currentBarTime == null) {
        stopPlayTimer();
        return;
      }
      const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (!pane) {
        replay.pause();
        return;
      }
      await ensureAllSnapshotsForward();
      let snap = pane._replaySnapshot;
      let resolved = snap ? resolveNextReplayCursor(state, snap, pane) : null;
      if (!resolved) {
        replay.pause();
        return;
      }
      if (resolved.nextIdx > getMaxBarIndex() && hasForwardBars()) {
        await ensureAllSnapshotsForward();
        snap = pane._replaySnapshot;
        resolved = snap ? resolveNextReplayCursor(state, snap, pane) : null;
      }
      if (!resolved) {
        replay.pause();
        return;
      }
      const liveEnd = snap?.liveEndBarTime ?? ctx.replayLiveEndUtc ?? replayLiveEndUtc;
      if (resolved.nextTime >= (liveEnd ?? resolved.nextTime) && resolved.nextIdx >= getMaxBarIndex() && !hasForwardBars()) {
        replay.pause();
        return;
      }
      await ensureReplayLtBarsForCursor(pane, resolved.nextTime);
      replay.setReplayCursor(resolved.nextTime, { fromPlayback: true, index: resolved.nextIdx });
    }, replayPlayIntervalMs(replay.getState().speed));
  }

  /** @param {import("./mode.js").ReplayState} state */
  function sync(state) {
    const hostControlled = isReplayHostControlled(ctx);
    setResolutionCacheReplayTtl(state.active && !hostControlled);

    if (state.active !== wasReplayUiActive) {
      if (state.active && !hostControlled) clearBarCachesForReplay();
      wasReplayUiActive = state.active;
      refreshPriceLabelsForReplay();
    }

    if (!state.active) {
      stopPlayTimer();
      lastAppliedEndIndex = null;
      lastAppliedBarTime = null;
      if (hostControlled) {
        for (const pane of ctx.getAllChartPanes()) {
          delete pane._replaySnapshot;
          delete pane.replayCursorEndIndex;
        }
      } else if (ctx.getAllChartPanes().some((p) => p._replaySnapshot)) {
        restoreLiveData();
      } else if (!ctx.replayPendingRestore?.active) {
        clearReplaySession();
      }
      persistSession(state);
      return;
    }

    if (state.selectedBarTime == null) {
      stopPlayTimer();
      return;
    }

    if (isReplayHostControlled(ctx)) {
      stopPlayTimer();
      if (state.selectingBar && state.selectMode === "bar") {
        ctx.replayFutureDim?.refreshAll?.();
      }
      return;
    }

    const cut = state.currentBarTime ?? state.selectedBarTime;
    const activePaneEarly = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    const existingSnap = activePaneEarly?._replaySnapshot;
    const prevCursor = existingSnap?.cursorTime ?? existingSnap?.fullEndBarTime;

    captureSnapshots(cut);
    refreshAllSnapshotLiveEnds();

    if (existingSnap && cut != null && prevCursor != null && cut < prevCursor) {
      trimReplaySnapshotsToCut(cut);
      lastAppliedEndIndex = null;
      lastAppliedBarTime = null;
    } else if (existingSnap && cut != null) {
      existingSnap.cursorTime = cut;
      existingSnap.fullEndBarTime = cut;
    }

    for (const pane of ctx.getAllChartPanes()) {
      mergePaneHistoryIntoSnapshot(pane);
    }

    if (state.selectingBar && state.selectMode === "bar") {
      stopPlayTimer();
      const browsePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (browsePane) expandPaneForBarSelect(browsePane);
      ctx.replayFutureDim?.refreshAll?.();
      persistSession(state);
      return;
    }

    if (replaySkipSyncApply) {
      persistSession(state);
      return;
    }

    const endTime = state.currentBarTime ?? state.selectedBarTime;
    if (endTime == null) return;

    const activePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    const snap = activePane?._replaySnapshot;
    if (!snap?.bars?.length) return;

    const endIndex = resolveSnapshotIndex(snap.bars, endTime);
    if (endIndex == null) return;

    const endBar = snap.bars[endIndex];
    if (
      lastAppliedEndIndex === endIndex &&
      lastAppliedBarTime === endTime &&
      activePane.bars.at(-1)?.time === endBar?.time
    ) {
      if (!barsFormingEqual(activePane.bars.at(-1), endBar)) {
        patchReplayHtfFormingAtCursor(activePane, endTime);
        for (const pane of ctx.getAllChartPanes()) {
          const pSnap = pane._replaySnapshot;
          if (!pSnap?.bars?.length) continue;
          syncPaneBarsToReplayEnd(pane, pSnap, endIndex);
          pane.priceLineLabel?.requestRefresh();
          pane.sessionBg?.requestRefresh();
        }
        if (ctx.indicatorController?.paneHasOverlayIndicators?.(activePane.index)) {
          ctx.indicatorController.refreshOverlaysForPane?.(activePane.index);
        }
      }
      if (state.playing) startPlayTimer();
      else stopPlayTimer();
      persistSession(state);
      return;
    }

    if (lastAppliedBarTime != null && endTime !== lastAppliedBarTime) {
      const prevIdx = lastAppliedEndIndex;
      if (prevIdx == null || endIndex !== prevIdx + 1) {
        lastAppliedEndIndex = null;
      }
    }

    const paneSec = ctx.barSecForPaneLocal?.(activePane) ?? resolutionSec(activePane.resolution);
    const ltSec = resolutionSec("1");
    if (paneSec <= ltSec) {
      syncReplayLtBarsFromPane(activePane, endTime);
    }
    patchReplayHtfFormingAtCursor(activePane, endTime);
    syncLtBarsCacheForCursor(endTime);

    applyReplayEndIndex(endIndex);
    lastAppliedBarTime = endTime;

    replayBarsByResolution.set(activePane.resolution, {
      bars: activePane.bars.slice(),
      cursorUtc: endTime,
    });

    const activeSnap = activePane._replaySnapshot;
    if (activeSnap) {
      activeSnap.cursorTime = endTime;
      activeSnap.fullEndBarTime = endTime;
    }

    if (state.playing) startPlayTimer();
    else stopPlayTimer();
    persistSession(state);
  }

  replay.subscribe(sync);

  window.addEventListener("beforeunload", () => {
    persistSession(replay.getState());
  });

  /**
   * @param {import("./persist.js").ReplayPersistedSession} session
   */
  async function restoreSession(session) {
    const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
    if (!pane?.bars?.length) return false;

    const liveEnd = resolveReplayLiveEndBarTime(pane, session.currentBarTime, session.fullEndBarTime);
    replayLiveEndUtc = liveEnd;
    ctx.replayLiveEndUtc = liveEnd;

    for (const p of ctx.getAllChartPanes()) {
      restoreSnapshotFromPartial(p, { ...session, fullEndBarTime: liveEnd });
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

    lastAppliedEndIndex = null;
    lastAppliedBarTime = null;
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

  /** @param {object} pane @param {number} cutUtc */
  async function ensurePaneBarsReachReplayCut(pane, cutUtc) {
    const barSec = ctx.barSecForPaneLocal?.(pane) ?? resolutionSec(pane.resolution) ?? 60;
    if (barsCoverReplayAnchor(pane.bars, cutUtc, barSec)) return true;

    replayDebug("resolutionChange.reload", {
      pane: pane.index,
      cutUtc,
      liveEndUtc: replayLiveEndUtc ?? ctx.replayLiveEndUtc,
      first: pane.bars[0]?.time,
      last: pane.bars.at(-1)?.time,
      barSec,
    });

    await ctx.loadPaneBars?.(pane, {
      force: true,
      deferChartRefresh: replayTfChangeInFlight,
    });
    return barsCoverReplayAnchor(pane.bars, cutUtc, barSec);
  }

  async function onChartResolutionChange() {
    const state = replay.getState();
    if (!state.active || state.currentBarTime == null) return;

    replayTfChangeInFlight = true;
    replaySkipSyncApply = true;
    const allPanes = ctx.getAllChartPanes();
    for (const pane of allPanes) pane._suppressHistoryPrefetch = true;
    try {
      const selectedUtc = state.selectedBarTime ?? state.currentBarTime;
      let cursorUtc = state.currentBarTime;
      const priorLiveEnd =
        (ctx.getActivePane?.() ?? ctx.chartPanes.get(0))?._replaySnapshot?.liveEndBarTime ?? null;

      lastAppliedEndIndex = null;
      lastAppliedBarTime = null;

      for (const pane of ctx.getAllChartPanes()) {
        delete pane._replaySnapshot;
        delete pane.replayCursorEndIndex;
      }

      const activePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (!activePane) return;

      const liveEnd = replayLiveEndUtc ?? ctx.replayLiveEndUtc ?? priorLiveEnd ?? cursorUtc;
      const targetRes = activePane.resolution;
      const fromRes = ltResolutionBeforeTfSwitch;
      const fromStash = fromRes ? replayBarsByResolution.get(fromRes) : null;
      const fromCursor = fromStash?.cursorUtc ?? state.currentBarTime;

      cursorUtc = resolveReplayCursorOnTfSwitch({
        fromResolution: fromRes,
        fromCursor,
        toResolution: targetRes,
        targetCached: replayBarsByResolution.get(targetRes),
        entryCursor: fromRes ? replayCursorAtEntry.get(fromRes) : null,
      });

      replayDebug("resolutionChange.cursor", {
        fromResolution: fromRes,
        fromCursor,
        toResolution: targetRes,
        cursorUtc,
        entryCursor: fromRes ? replayCursorAtEntry.get(fromRes) : null,
        targetCached: replayBarsByResolution.get(targetRes)?.cursorUtc,
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
        await ensureReplayLtBarsForCursor(activePane, cursorUtc);
      }
      restorePaneBarsForReplayResolution(activePane, cursorUtc);

      replaceReplaySnapshots(cursorUtc, liveEnd);

      const snap = activePane._replaySnapshot;
      if (snap && ltBarsBeforeTfSwitch?.length && ltResolutionBeforeTfSwitch) {
        const fromSec = resolutionSec(ltResolutionBeforeTfSwitch);
        const toSec = resolutionSec(activePane.resolution);
        if (toSec > fromSec) {
          if (!replayLtBarsForForming || fromSec <= resolutionSec(replayLtBarsForForming.resolution)) {
            seedReplayLtBarsForForming(ltResolutionBeforeTfSwitch, ltBarsBeforeTfSwitch, cursorUtc);
          }
          const htfIdx = replayBarIndexForUtcTime(snap.bars, cursorUtc);
          const htfOpen = htfIdx != null ? snap.bars[htfIdx]?.time : null;
          let ltBars = ltBarsBeforeTfSwitch;

          if (htfOpen != null) {
            const sub = ltBars.filter((b) => b.time >= htfOpen && b.time <= cursorUtc);
            const needsFetch =
              !sub.length || sub.at(-1).time < cursorUtc || sub[0].time > htfOpen;
            if (needsFetch) {
              ltBars = await fetchLtBarsForReplayPeriod(
                activePane,
                ltResolutionBeforeTfSwitch,
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
            ltResolutionBeforeTfSwitch,
            replayBarIndexForUtcTime,
          );
          replayDebug(patch.ok ? "forming.patch" : "forming.patch.skip", patch);
          if (ltBars?.length) {
            replayLtBarsForForming = { resolution: ltResolutionBeforeTfSwitch, bars: ltBars };
            syncLtBarsCacheForCursor(cursorUtc);
          }
        }
      }
      const fromResForViewport = ltResolutionBeforeTfSwitch;
      clearLtBarsStash();

      for (const pane of ctx.getAllChartPanes()) {
        mergePaneHistoryIntoSnapshot(pane);
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
        syncPaneBarsToReplayEnd(pane, pSnap, currentIdx);
      }

      const logicalRange = resolveReplayViewportLogicalRange(
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

      lastAppliedEndIndex = currentIdx;
      lastAppliedBarTime = cursorUtc;

      replayBarsByResolution.set(activePane.resolution, {
        bars: activePane.bars.slice(),
        cursorUtc,
      });
      replayCursorAtEntry.set(activePane.resolution, cursorUtc);

      ctx.applyPriceScaleMarginsForPane?.(activePane);
      activePane.sessionBg?.requestRefresh();
      ctx.replayFutureDim?.refreshAll?.();

      if (activePane.index === 0) ctx.bars = activePane.bars;

      replayDebug("resolutionChange", {
        selectedUtc,
        cursorUtc,
        mappedBarTime: bars[currentIdx]?.time,
        resolution: activePane.resolution,
        autoSelectInterval: state.autoSelectInterval,
      });
    } finally {
      replaySkipSyncApply = false;
      replayTfChangeInFlight = false;
      requestAnimationFrame(() => {
        for (const pane of ctx.getAllChartPanes()) {
          delete pane._suppressHistoryPrefetch;
        }
      });
    }
  }

  return {
    isReplayLocked: () => {
      if (isReplayHostControlled(ctx)) return false;
      const state = replay.getState();
      return Boolean(state.active && state.selectedBarTime != null);
    },
    isReplayHistoryBlocked: () => replayTfChangeInFlight,
    mergeHistoryIntoSnapshot: mergePaneHistoryIntoSnapshot,
    getCursorBarIndex: () => {
      const state = replay.getState();
      if (isReplayHostControlled(ctx)) {
        return state.currentBarIndex ?? state.selectedBarIndex ?? 0;
      }
      const snap = (ctx.getActivePane?.() ?? ctx.chartPanes.get(0))?._replaySnapshot;
      if (!snap?.bars?.length || state.currentBarTime == null) return state.currentBarIndex ?? 0;
      return replayBarIndexForUtcTime(snap.bars, state.currentBarTime) ?? state.currentBarIndex ?? 0;
    },
    getMaxBarIndex: () => {
      if (isReplayHostControlled(ctx)) {
        const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
        return Math.max(0, (pane?.bars?.length ?? 1) - 1);
      }
      return getMaxBarIndex();
    },
    hasForwardBars: () => {
      if (isReplayHostControlled(ctx)) {
        const state = replay.getState();
        const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
        const cursor = state.currentBarIndex ?? state.selectedBarIndex ?? 0;
        return cursor < Math.max(0, (pane?.bars?.length ?? 0) - 1);
      }
      return hasForwardBars();
    },
    refreshReplayLiveEnd: refreshAllSnapshotLiveEnds,
    restoreSession,
    onChartResolutionChange,
    beforeResolutionChange,
    stepForward: async () => {
      const state = replay.getState();
      if (!state.active) return;
      if (isReplayHostControlled(ctx)) {
        emitReplayHostAction(ctx, "stepForward", {
          currentBarIndex: state.currentBarIndex,
          currentBarTime: state.currentBarTime,
          selectedBarIndex: state.selectedBarIndex,
          selectedBarTime: state.selectedBarTime,
        });
        return;
      }
      if (state.currentBarTime == null) return;
      refreshAllSnapshotLiveEnds();
      const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (!pane) return;
      await ensureAllSnapshotsForward();
      let snap = pane._replaySnapshot;
      let resolved = snap ? resolveNextReplayCursor(state, snap, pane) : null;
      if (!resolved) return;

      if (resolved.nextIdx > getMaxBarIndex() && hasForwardBars()) {
        await ensureAllSnapshotsForward();
        snap = pane._replaySnapshot;
        resolved = snap ? resolveNextReplayCursor(state, snap, pane) : null;
      }
      if (!resolved) return;

      const liveEnd = snap?.liveEndBarTime ?? ctx.replayLiveEndUtc ?? replayLiveEndUtc;
      if (
        resolved.nextTime >= (liveEnd ?? resolved.nextTime) &&
        resolved.nextIdx >= getMaxBarIndex() &&
        !hasForwardBars()
      ) {
        return;
      }

      await ensureReplayLtBarsForCursor(pane, resolved.nextTime);
      replay.setReplayCursor(resolved.nextTime, { index: resolved.nextIdx });
    },
    jumpToEnd: async () => {
      const state = replay.getState();
      if (!state.active) return;
      if (isReplayHostControlled(ctx)) {
        emitReplayHostAction(ctx, "jumpToEnd", {
          currentBarIndex: state.currentBarIndex,
          currentBarTime: state.currentBarTime,
          selectedBarIndex: state.selectedBarIndex,
          selectedBarTime: state.selectedBarTime,
        });
        return;
      }
      if (state.selectedBarTime == null) return;
      replay.pause();
      await ensureAllSnapshotsForward();
      const max = getMaxBarIndex();
      const snap = (ctx.getActivePane?.() ?? ctx.chartPanes.get(0))?._replaySnapshot;
      const maxTime = snap?.bars?.[max]?.time;
      if (maxTime == null) return;
      replay.setReplayCursor(maxTime, { index: max });
      const active = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      if (active) ctx.scrollPaneToLatest?.(active);
    },
    play: () => {
      const state = replay.getState();
      if (!state.active) return;
      if (isReplayHostControlled(ctx)) {
        emitReplayHostAction(ctx, "play", {
          playing: state.playing,
          currentBarIndex: state.currentBarIndex,
          currentBarTime: state.currentBarTime,
        });
        return;
      }
      if (state.currentBarTime == null) return;
      const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      const snap = pane?._replaySnapshot;
      if (!snap?.bars?.length || !pane) return;
      if (!resolveNextReplayCursor(state, snap, pane) && !hasForwardBars()) return;
      replay.play();
    },
  };
}
