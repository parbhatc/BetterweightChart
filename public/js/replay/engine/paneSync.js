import {
  tryAppendReplayBar,
  updateFormingBarOnPaneSeries,
} from "../../chart/pane/data.js";
import { trimBarsToUtcTime } from "../persist.js";
import { replayDebug } from "../debug.js";

/** @param {object | undefined} a @param {object | undefined} b */
export function barsFormingEqual(a, b) {
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

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("../mode.js").mountReplayMode>} replay
 * @param {import("./types.js").ReplayEngineState} state
 * @param {{ restoreReplayViewportAfterTfSwitch: (pane: object, endIndex: number, fromResolution?: string | null) => void, persistSession: (state: import("../mode.js").ReplayState) => void }} deps
 */
export function createReplayPaneSync(ctx, replay, state, deps) {
  /** @param {{ time: number }[]} older @param {{ time: number }[]} existing */
  function mergeBarsDeduped(older, existing) {
    const seen = new Set();
    return [...older, ...existing].filter((b) => {
      if (seen.has(b.time)) return false;
      seen.add(b.time);
      return true;
    });
  }

  /** @param {object} pane @returns {number} bars added to snapshot */
  function mergePaneHistoryIntoSnapshot(pane) {
    const rs = replay.getState();
    const snap = pane._replaySnapshot;
    if (!snap?.bars?.length || !pane.bars?.length) return 0;

    const snapFirst = snap.bars[0].time;
    const older = pane.bars.filter((b) => b.time < snapFirst);
    if (!older.length) return 0;

    const beforeLen = snap.bars.length;
    snap.bars = mergeBarsDeduped(older, snap.bars);
    const added = snap.bars.length - beforeLen;
    if (added <= 0) return 0;

    if (state.lastAppliedEndIndex != null) {
      state.lastAppliedEndIndex += added;
      pane.replayCursorEndIndex = state.lastAppliedEndIndex;
    }

    replayDebug("snapshot.prepend", {
      pane: pane.index,
      added,
      total: snap.bars.length,
      cursorIndex: state.lastAppliedEndIndex,
    });

    if (rs.active && rs.selectedBarTime != null) {
      const res = pane.resolution;
      if (res && rs.currentBarTime != null) {
        state.replayBarsByResolution.set(res, {
          bars: trimBarsToUtcTime(pane.bars, rs.currentBarTime),
          cursorUtc: rs.currentBarTime,
        });
      }
      if (
        res &&
        state.lastAppliedEndIndex != null &&
        state.replayViewportByResolution.has(res) &&
        !state.replayTfChangeInFlight
      ) {
        deps.restoreReplayViewportAfterTfSwitch(pane, state.lastAppliedEndIndex, null);
        ctx.applyPriceScaleMarginsForPane?.(pane);
      }
      deps.persistSession(rs);
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
    const skipRefresh = state.replaySkipSyncApply;

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
      if (!tryAppendReplayBar(pane, bar, settings, sym, res)) {
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
   * @param {() => number} getMaxBarIndex
   */
  function applyReplayEndIndex(endIndex, opts, getMaxBarIndex) {
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

    state.lastAppliedEndIndex = endIndex;
  }

  return {
    mergePaneHistoryIntoSnapshot,
    expandPaneForBarSelect,
    barsFormingEqual,
    syncPaneBarsToReplayEnd,
    applyReplayEndIndex,
  };
}
