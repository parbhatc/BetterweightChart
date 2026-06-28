import { mountReplayMode } from "../../../replay/mode.js";

import { mountReplayToolbar } from "../../../replay/toolbar.js";

import { attachReplaySelection } from "../../../replay/selection.js";

import { attachReplayFutureDim } from "../../../replay/futureDim.js";

import { attachReplayEngine } from "../../../replay/engine.js";

import { loadReplaySession } from "../../../replay/persist.js";

import { replayDebug } from "../../../replay/debug.js";



/**

 * @param {import("./state.js").BootContext} ctx

 */

export function attachReplayBoot(ctx) {
  if (!ctx.opts.chrome) return;

  const replayBtn = ctx.chartToolbarTools?.replayBtn;
  if (!replayBtn) return;

  const appEl = document.querySelector(".tv-app");

  const footerEl = document.querySelector(".tv-chart-replay-bar");

  if (!(appEl instanceof HTMLElement) || !(footerEl instanceof HTMLElement)) return;



  const pending = loadReplaySession();

  if (pending?.active) {
    ctx.replayPendingRestore = pending;
    replayDebug("persist.load", pending);
  } else {
    replayDebug("persist.load.none");
  }



  const replay = mountReplayMode({
    appEl,
    toggleBtn: replayBtn,
    hostControlled: Boolean(ctx.opts.replayHostControlled),
    lockActive: Boolean(ctx.opts.replayHideToggle || ctx.opts.replayPersistent),
  });



  ctx.replay = replay;

  ctx.replayToolbar = mountReplayToolbar({
    replay,
    ctx,
    footerEl,
    hideSelectModeMenu: Boolean(ctx.opts.replayHideSelectModeMenu),
    hideJumpEnd: Boolean(ctx.opts.replayHideJumpEnd ?? ctx.opts.replayHostControlled),
    hideExit: Boolean(ctx.opts.replayHideExit ?? ctx.opts.replayPersistent),
    getChartResolution: () => {
      const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
      return pane?.resolution ?? ctx.resolution ?? "1";
    },
  });

  attachReplaySelection(ctx, replay);

  ctx.replayFutureDim = attachReplayFutureDim(ctx, replay);

  ctx.replayEngine = attachReplayEngine(ctx, replay);



  replay.stepForward = () => void ctx.replayEngine.stepForward();

  replay.jumpToEnd = () => void ctx.replayEngine.jumpToEnd();

  replay.getMaxBarIndex = () => ctx.replayEngine.getMaxBarIndex();
  replay.hasForwardBars = () => ctx.replayEngine.hasForwardBars();
  replay.getCursorBarIndex = () => ctx.replayEngine.getCursorBarIndex();

  if (ctx.opts.replayHostControlled && ctx.opts.replayAutoEnter !== false) {
    replay.enter();
  }

  const prevAfterTimeframeChange = ctx.afterTimeframeChange;
  ctx.afterTimeframeChange = async () => {
    await ctx.replayEngine?.onChartResolutionChange?.();
    ctx.replayToolbar?.refresh?.();
    if (typeof prevAfterTimeframeChange === "function") await prevAfterTimeframeChange();
  };

  replayDebug("boot", { mounted: true });
}



/**

 * Call after initial loadBars when a replay session was persisted.

 * @param {import("./state.js").BootContext} ctx

 */

export async function restoreReplayAfterLoad(ctx) {
  if (ctx.opts.replayHostControlled) {
    delete ctx.replayPendingRestore;
    return;
  }
  if (!ctx.replayEngine?.restoreSession) {
    delete ctx.replayPendingRestore;
    return;
  }

  const pending = ctx.replayPendingRestore;

  if (!pending?.active) {

    delete ctx.replayPendingRestore;

    return;

  }



  const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);

  const sym = pane?.symbol ?? ctx.symbol ?? "";

  const res = pane?.resolution ?? ctx.resolution ?? "";

  if (pending.symbol && sym && pending.symbol !== sym) {

    delete ctx.replayPendingRestore;

    return;

  }

  if (pending.resolution && res && pending.resolution !== res) {

    delete ctx.replayPendingRestore;

    return;

  }



  const restored = await ctx.replayEngine.restoreSession(pending);
  if (restored) {
    delete ctx.replayPendingRestore;
  }
}

