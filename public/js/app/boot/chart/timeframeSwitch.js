import { resolutionSec } from "../../../chart/resolutions.js";
import { withPreservedViewport } from "../../../chart/pane/viewport.js";
import {
  restoreViewportBarLayout,
  restoreViewportBarLayoutFromUtc,
  computeViewportBarLayoutLogical,
  computeViewportLogicalFromUtc,
} from "../../../chart/pane/viewportBarLayout.js";

/**
 * @param {object[]} bars
 * @param {number} anchorSec
 */
export function anchorBarIndexForSec(bars, anchorSec) {
  if (!bars?.length || !Number.isFinite(anchorSec)) return bars.length - 1;
  let idx = bars.length - 1;
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (bars[i].time <= anchorSec) {
      idx = i;
      break;
    }
  }
  return idx;
}

/**
 * @param {object} pane
 * @param {{ from: number, to: number }} logicalRange
 * @param {number} anchorSec
 */
export function clampLogicalRangeToPlaybackAnchor(pane, logicalRange, anchorSec) {
  if (!logicalRange || !pane?.bars?.length || !Number.isFinite(anchorSec)) return logicalRange;

  const anchorIdx = anchorBarIndexForSec(pane.bars, anchorSec);
  const width = logicalRange.to - logicalRange.from;
  const tail = logicalRange.to - anchorIdx;
  let to = anchorIdx + Math.max(0, tail);
  let from = to - width;
  if (from < 0) {
    to -= from;
    from = 0;
  }
  return { from, to };
}

/**
 * @param {object} pane
 * @param {ReturnType<typeof import("../../../chart/pane/viewportBarLayout.js").captureViewportBarLayout> | null | undefined} layout
 * @param {import("./state.js").BootContext} ctx
 */
export function resolveTimeframeSwitchLogicalRange(pane, layout, ctx) {
  if (!layout || !pane?.bars?.length) return null;

  const fromSec = layout.barSec ?? resolutionSec(layout.resolution);
  const toSec = resolutionSec(pane.resolution);
  const barLogical = computeViewportBarLayoutLogical(pane, layout);
  const utcLogical = computeViewportLogicalFromUtc(pane, layout, ctx.settingsStore, ctx.resolutions);
  const hasUtc = layout.visibleFromUtc != null && layout.visibleToUtc != null;

  if (fromSec != null && toSec != null && toSec > fromSec && barLogical) {
    return barLogical;
  }
  if (hasUtc && utcLogical && fromSec != null && toSec != null && toSec < fromSec) {
    return utcLogical;
  }
  if (barLogical) return barLogical;
  return utcLogical;
}

/** @param {ReturnType<typeof import("../../../chart/pane/viewportBarLayout.js").captureViewportBarLayout> | null | undefined} layout @param {string | null | undefined} targetResolution */
export function timeframeSwitchPrefersUtcRestore(layout, targetResolution) {
  if (!layout || layout.visibleFromUtc == null || layout.visibleToUtc == null) return false;
  const fromSec = layout.barSec ?? resolutionSec(layout.resolution);
  const toSec = resolutionSec(targetResolution);
  if (fromSec != null && toSec != null && toSec > fromSec) return false;
  return true;
}

/**
 * Host replay: restore viewport from per-resolution stash (not the leaving TF layout).
 * @param {import("./state.js").BootContext} ctx
 * @param {object} pane
 * @param {string | null | undefined} fromResolution
 */
export function syncHostReplayViewportAfterTfSwitch(ctx, pane, fromResolution = null) {
  if (!ctx.opts?.replayHostControlled || !pane?.bars?.length) return;

  const anchorSec = ctx.opts?.getPlaybackAnchorSec?.(pane.resolution);
  if (anchorSec == null || !Number.isFinite(anchorSec)) return;

  const endIndex = anchorBarIndexForSec(pane.bars, anchorSec);
  pane.replayCursorEndIndex = endIndex;

  let logicalRange =
    ctx.replayEngine?.resolveReplayViewportLogicalRange?.(pane, endIndex, fromResolution) ?? null;
  if (logicalRange) {
    logicalRange = clampLogicalRangeToPlaybackAnchor(pane, logicalRange, anchorSec);
  }

  ctx.refreshPaneCandleData?.(pane, {
    logicalRange: logicalRange ?? undefined,
    avoidPreserveViewport: !logicalRange,
    deferSessionBg: true,
  });

  const rs = ctx.replay?.getState?.();
  if (rs?.active && ctx.replay?.setReplayPosition) {
    const cursorUtc = pane.bars[endIndex]?.time ?? anchorSec;
    ctx.replay.setReplayPosition({
      selectedBarIndex: endIndex,
      currentBarIndex: endIndex,
      selectedBarTime: cursorUtc,
      currentBarTime: cursorUtc,
    });
  }

  ctx.indicatorController?.syncOverlayTimeCtxForPane?.(pane.index);
  if (pane.chart && pane.series) {
    withPreservedViewport(
      pane.chart,
      () => ctx.applySettingsToChartLocal?.(pane.chart, pane.series, pane),
      { followUpFrames: 1 },
    );
  }
}

/**
 * Live / non-host TF switch paint.
 * @param {import("./state.js").BootContext} ctx
 * @param {object} pane
 * @param {ReturnType<typeof import("../../../chart/pane/viewportBarLayout.js").captureViewportBarLayout> | null | undefined} savedLayout
 */
export function paintPaneAfterTimeframeLoad(ctx, pane, savedLayout) {
  if (ctx.opts?.replayHostControlled) {
    if (savedLayout?.width >= 10 && pane.resolution) {
      ctx.replayEngine?.stashReplayViewportLayout?.(pane.resolution, savedLayout);
    }
    syncHostReplayViewportAfterTfSwitch(
      ctx,
      pane,
      pane._tfSwitchFromResolution ?? savedLayout?.resolution ?? null,
    );
    return;
  }

  const useUtc = timeframeSwitchPrefersUtcRestore(savedLayout, pane.resolution);
  const logicalRange = resolveTimeframeSwitchLogicalRange(pane, savedLayout, ctx);
  ctx.refreshPaneCandleData?.(pane, {
    logicalRange: logicalRange ?? undefined,
    avoidPreserveViewport: !logicalRange,
    deferSessionBg: true,
  });
  ctx.indicatorController?.syncOverlayTimeCtxForPane?.(pane.index);
  if (savedLayout) {
    const restoreOpts = { skipLogical: Boolean(logicalRange) };
    if (useUtc) {
      restoreViewportBarLayoutFromUtc(
        pane,
        savedLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "timeframe",
        ctx.activePriceScaleId,
        restoreOpts,
      );
    } else {
      restoreViewportBarLayout(
        pane,
        savedLayout,
        ctx.settingsStore,
        ctx.resolutions,
        "timeframe",
        ctx.activePriceScaleId,
        restoreOpts,
      );
    }
  }
  if (pane.chart && pane.series) {
    ctx.applySettingsToChartLocal?.(pane.chart, pane.series, pane);
  }
}
