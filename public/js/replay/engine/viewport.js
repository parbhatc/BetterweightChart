import { resolutionSec } from "../../chart/resolutions.js";
import {
  captureViewportBarLayout,
  computeViewportBarLayoutLogical,
  computeViewportLogicalFromUtc,
  restoreViewportBarLayout,
  restoreViewportBarLayoutFromUtc,
} from "../../chart/pane/viewportBarLayout.js";
import { replayDebug } from "../debug.js";

/**
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 * @param {import("./types.js").ReplayEngineState} state
 */
export function createReplayViewport(ctx, state) {
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
   * Finest resolution with a stashed viewport below the target (for HTF re-restore after prepend).
   * @param {string} targetRes
   * @returns {string | null}
   */
  function inferViewportFromResolution(targetRes) {
    const targetSec = resolutionSec(targetRes);
    if (targetSec == null) return null;
    let bestRes = null;
    let bestSec = Infinity;
    for (const res of state.replayViewportByResolution.keys()) {
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
    const fromLayout = fromRes ? state.replayViewportByResolution.get(fromRes) : null;
    const savedTarget = state.replayViewportByResolution.get(targetRes);

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
    const fromLayout = fromRes ? state.replayViewportByResolution.get(fromRes) : null;
    const savedTarget = state.replayViewportByResolution.get(targetRes);

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

  return {
    computeScrollToReplayCursorLogical,
    resolveReplayViewportLogicalRange,
    restoreReplayViewportAfterTfSwitch,
    scrollPaneToReplayCursor,
    inferViewportFromResolution,
  };
}
