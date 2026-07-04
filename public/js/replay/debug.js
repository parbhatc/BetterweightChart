import { chartDebug, chartDebugThrottle, isChartDebugEnabled } from "../debug/chart/index.js";
import { replayBarIndexForUtcTime } from "./persist.js";

/**
 * @param {string} action
 * @param {unknown} [detail]
 */
export function replayDebug(action, detail) {
  chartDebug("replay", action, detail);
}

/**
 * @param {string} key
 * @param {string} action
 * @param {unknown} [detail]
 * @param {number} [intervalMs]
 */
export function replayDebugThrottle(key, action, detail, intervalMs = 400) {
  chartDebugThrottle("replay", key, action, detail, intervalMs);
}

/**
 * @param {Record<string, unknown>} state
 */
export function replayDebugState(state) {
  if (!isChartDebugEnabled()) return;
  chartDebug("replay", "state", state);
}

/**
 * Log a replay engine sync pass (throttled during playback to avoid spam).
 * @param {string} path
 * @param {object} [detail]
 * @param {boolean} [playing]
 */
export function replayDebugSync(path, detail = {}, playing = false) {
  if (playing) {
    replayDebugThrottle(`sync.${path}`, `sync.${path}`, detail, 800);
    return;
  }
  replayDebug(`sync.${path}`, detail);
}

/**
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("./mode.js").mountReplayMode>} replay
 * @param {import("./engine/types.js").ReplayEngineState | null | undefined} engineState
 */
export function buildReplayEngineDebugSnapshot(ctx, replay, engineState) {
  const rs = replay.getState();
  const activePane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
  const snap = activePane?._replaySnapshot;

  /** @type {Record<string, { bars: number, cursorUtc: number | null }>} */
  const barsByRes = {};
  if (engineState?.replayBarsByResolution) {
    for (const [res, entry] of engineState.replayBarsByResolution) {
      barsByRes[res] = { bars: entry.bars?.length ?? 0, cursorUtc: entry.cursorUtc ?? null };
    }
  }

  const cursorUtc = rs.currentBarTime ?? rs.selectedBarTime;
  const cursorIndex =
    snap?.bars?.length && cursorUtc != null
      ? replayBarIndexForUtcTime(snap.bars, cursorUtc)
      : (rs.currentBarIndex ?? rs.selectedBarIndex ?? null);

  return {
    mode: {
      active: rs.active,
      playing: rs.playing,
      selectingBar: rs.selectingBar,
      selectMode: rs.selectMode,
      hostControlled: Boolean(ctx.opts?.replayHostControlled),
    },
    cursor: {
      utc: cursorUtc,
      index: cursorIndex,
      selectedUtc: rs.selectedBarTime,
      selectedIndex: rs.selectedBarIndex,
    },
    playback: {
      speed: rs.speed,
      stepInterval: rs.stepInterval,
      autoSelectInterval: rs.autoSelectInterval,
    },
    engine: engineState
      ? {
          lastAppliedEndIndex: engineState.lastAppliedEndIndex,
          lastAppliedBarTime: engineState.lastAppliedBarTime,
          tfChangeInFlight: engineState.replayTfChangeInFlight,
          skipSyncApply: engineState.replaySkipSyncApply,
          liveEndUtc: engineState.replayLiveEndUtc ?? ctx.replayLiveEndUtc ?? null,
          ltStashResolution: engineState.ltResolutionBeforeTfSwitch,
          ltStashBars: engineState.ltBarsBeforeTfSwitch?.length ?? 0,
          barsByResolution: barsByRes,
          viewportResolutions: [...(engineState.replayViewportByResolution?.keys() ?? [])],
          ltFormingResolution: engineState.replayLtBarsForForming?.resolution ?? null,
          ltFormingBars: engineState.replayLtBarsForForming?.bars?.length ?? 0,
        }
      : null,
    activePane: activePane
      ? {
          index: activePane.index,
          resolution: activePane.resolution,
          paneBars: activePane.bars?.length ?? 0,
          replayCursorEndIndex: activePane.replayCursorEndIndex ?? null,
          lastBarUtc: activePane.bars?.at(-1)?.time ?? null,
        }
      : null,
    snapshot: snap
      ? {
          bars: snap.bars?.length ?? 0,
          cursorTime: snap.cursorTime,
          liveEndBarTime: snap.liveEndBarTime,
          partial: snap.partial,
          firstUtc: snap.bars?.[0]?.time ?? null,
          lastUtc: snap.bars?.at(-1)?.time ?? null,
        }
      : null,
    panes: (ctx.getAllChartPanes?.() ?? []).map((p) => ({
      index: p.index,
      resolution: p.resolution,
      paneBars: p.bars?.length ?? 0,
      snapshotBars: p._replaySnapshot?.bars?.length ?? 0,
      replayCursorEndIndex: p.replayCursorEndIndex ?? null,
      partial: p._replaySnapshot?.partial ?? null,
    })),
  };
}

/**
 * @param {ReturnType<typeof buildReplayEngineDebugSnapshot>} snap
 * @param {{ log?: boolean }} [opts]
 */
export function logReplayDebugSnapshot(snap, opts = {}) {
  if (opts.log !== false && isChartDebugEnabled()) {
    const lines = [
      `[BWC] replay — ${snap.mode.active ? "active" : "off"}${snap.mode.playing ? " (playing)" : ""}${snap.mode.hostControlled ? " host" : ""}`,
    ];
    if (snap.cursor.utc != null) {
      lines.push(`  cursor: utc=${snap.cursor.utc} index=${snap.cursor.index ?? "?"}`);
    }
    if (snap.snapshot) {
      lines.push(
        `  snapshot: ${snap.snapshot.bars} bars, partial=${snap.snapshot.partial}, liveEnd=${snap.snapshot.liveEndBarTime ?? "?"}`,
      );
    }
    if (snap.engine) {
      lines.push(
        `  engine: applied=${snap.engine.lastAppliedEndIndex ?? "?"}@${snap.engine.lastAppliedBarTime ?? "?"}, tf=${snap.engine.tfChangeInFlight ? "switching" : "idle"}`,
      );
      const resKeys = Object.keys(snap.engine.barsByResolution);
      if (resKeys.length) lines.push(`  cached resolutions: ${resKeys.join(", ")}`);
    }
    console.info(lines.join("\n"));
  }
  return snap;
}

/**
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("./mode.js").mountReplayMode>} replay
 * @param {import("./engine/types.js").ReplayEngineState | null | undefined} engineState
 * @param {{ log?: boolean }} [opts]
 */
export function logReplayEngineDebugSnapshot(ctx, replay, engineState, opts = {}) {
  return logReplayDebugSnapshot(buildReplayEngineDebugSnapshot(ctx, replay, engineState), opts);
}
