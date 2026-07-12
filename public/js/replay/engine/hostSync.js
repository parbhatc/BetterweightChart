import {
  captureViewportBarLayout,
  computeViewportBarLayoutLogical,
  restoreViewportBarLayout,
} from "../../chart/pane/viewportBarLayout.js";
import { tryAppendReplayBar } from "../../chart/pane/data.js";
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
  /**
   * Forward-bar stash: bars trimmed off past the replay cursor, kept so later
   * forward steps can append them incrementally instead of a full setData.
   * @param {object} pane
   * @returns {{ symbol: string, resolution: string, bars: { time: number }[] } | null}
   */
  function validForwardStash(pane) {
    const stash = pane._hostReplayForwardBars;
    if (!stash) return null;
    if (stash.symbol !== pane.symbol || stash.resolution !== pane.resolution) {
      delete pane._hostReplayForwardBars;
      return null;
    }
    return stash;
  }

  /** @param {object} pane */
  function clearForwardStash(pane) {
    delete pane._hostReplayForwardBars;
  }

  /** @param {object} pane @param {{ time: number }[]} tail bars trimmed off past the cursor */
  function storeForwardBars(pane, tail) {
    if (!tail.length) return;
    const prev = validForwardStash(pane);
    let merged = tail;
    if (prev?.bars?.length) {
      const lastTailTime = tail.at(-1).time;
      merged = tail.concat(prev.bars.filter((b) => b.time > lastTailTime));
    }
    pane._hostReplayForwardBars = {
      symbol: pane.symbol,
      resolution: pane.resolution,
      bars: merged,
    };
  }

  /**
   * Append stashed forward bars up to the cursor via series.update (no setData).
   * Mirrors paneSync's append semantics; falls back to a full refresh on failure.
   * @param {object} pane @param {number} cursorUtc
   */
  function consumeForwardStash(pane, cursorUtc) {
    const stash = validForwardStash(pane);
    if (!stash?.bars?.length) return;

    const settings = ctx.settingsStore;
    const sym = ctx.symbolInfo ?? pane.symbolInfo;
    const res = ctx.resolutions;
    let failed = false;

    while (stash.bars.length) {
      const bar = stash.bars[0];
      if (bar.time > cursorUtc) break;
      stash.bars.shift();
      const last = pane.bars.at(-1);
      if (last != null && bar.time <= last.time) {
        // Live feed already delivered this bar (forming updates come through
        // the feed's upsert path) — the feed copy is authoritative.
        continue;
      }
      pane.bars.push(bar);
      if (!tryAppendReplayBar(pane, bar, settings, sym, res)) {
        failed = true;
        break;
      }
    }

    if (!stash.bars.length || failed) clearForwardStash(pane);
    if (failed) ctx.refreshPaneCandleData?.(pane);
  }

  /** @param {object} pane */
  function applyHostReplayCursorToPane(pane) {
    if (!pane?.bars?.length) return null;
    // Mid-TF-switch: pane.resolution is already the NEW timeframe while
    // pane.bars still hold the OLD one. Trimming/stashing here would label
    // old-resolution bars with the new resolution and later append e.g. 1m
    // bars into a 30s series (giant candles). Skip; the switch epilogue syncs.
    if (pane._hostReplayTfSwitchInFlight) return null;

    const anchorUtc =
      typeof ctx.opts?.getPlaybackAnchorSec === "function"
        ? ctx.opts.getPlaybackAnchorSec(pane.resolution)
        : null;
    if (anchorUtc == null || !Number.isFinite(anchorUtc)) return null;

    let bars = pane.bars;
    let cursorUtc = anchorUtc;
    const lastBarTime = bars.at(-1)?.time;
    const trimIdx =
      lastBarTime != null && lastBarTime > cursorUtc
        ? replayBarIndexForUtcTime(bars, cursorUtc)
        : null;
    const needsTrim = trimIdx != null && trimIdx < bars.length - 1;

    if (needsTrim) {
      // Full path: jumps, rewinds, overshoots. Trim + setData with viewport
      // capture/restore, exactly as before — but stash the trimmed-off future
      // bars so subsequent forward steps can append them incrementally.
      const layout =
        pane.chart && ctx.settingsStore && ctx.resolutions
          ? captureViewportBarLayout(pane, ctx.settingsStore, ctx.resolutions)
          : null;

      storeForwardBars(pane, bars.slice(trimIdx + 1));
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
      bars = pane.bars;

      const currentIdx = replayBarIndexForUtcTime(bars, cursorUtc) ?? bars.length - 1;
      cursorUtc = bars[currentIdx]?.time ?? cursorUtc;
      pane.replayCursorEndIndex = currentIdx;

      if (layout && pane.chart) {
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

      const stashLayout =
        pane.chart && ctx.settingsStore && ctx.resolutions
          ? captureViewportBarLayout(pane, ctx.settingsStore, ctx.resolutions)
          : layout;
      if (
        stashLayout?.width >= 10 &&
        pane.resolution &&
        !state.replayViewportByResolution.has(pane.resolution)
      ) {
        state.replayViewportByResolution.set(pane.resolution, stashLayout);
      }

      pane.sessionBg?.requestRefresh?.();

      if (ctx.indicatorController?.paneHasOverlayIndicators?.(pane.index)) {
        ctx.refreshOverlaysImmediate?.(pane.index);
      }
      void ctx.extendIndicatorHtfForReplay?.(pane).then((extended) => {
        if (extended) ctx.refreshOverlaysImmediate?.(pane.index);
      });

      return { cursorUtc, currentIdx, bars };
    }

    // Incremental path: cursor at or ahead of the pane's last bar (single-step
    // advance / forming update / no-op). Append any stashed forward bars via
    // series.update, skip viewport capture/restore, and coalesce indicator
    // refreshes to once per animation frame.
    consumeForwardStash(pane, cursorUtc);
    bars = pane.bars;

    const currentIdx = replayBarIndexForUtcTime(bars, cursorUtc) ?? bars.length - 1;
    cursorUtc = bars[currentIdx]?.time ?? cursorUtc;
    pane.replayCursorEndIndex = currentIdx;

    if (
      pane.chart &&
      ctx.settingsStore &&
      ctx.resolutions &&
      pane.resolution &&
      !state.replayViewportByResolution.has(pane.resolution)
    ) {
      const stashLayout = captureViewportBarLayout(pane, ctx.settingsStore, ctx.resolutions);
      if (stashLayout?.width >= 10) {
        state.replayViewportByResolution.set(pane.resolution, stashLayout);
      }
    }

    pane.sessionBg?.requestRefresh?.();

    const ic = ctx.indicatorController;
    if (ic?.paneHasOverlayIndicators?.(pane.index)) {
      ic.refreshOverlaysForPane?.(pane.index);
    }
    void ctx.extendIndicatorHtfForReplay?.(pane).then((extended) => {
      if (extended) ic?.refreshOverlaysForPane?.(pane.index);
    });

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

    ctx.replayFutureDim?.refreshAll?.();

    if (activeResult) {
      const { cursorUtc, currentIdx, bars } = activeResult;
      replay.setReplayPosition(
        {
          selectedBarIndex: currentIdx,
          currentBarIndex: currentIdx,
          selectedBarTime: bars[currentIdx]?.time ?? cursorUtc,
          currentBarTime: cursorUtc,
        },
        { keepPlaying: true },
      );
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
