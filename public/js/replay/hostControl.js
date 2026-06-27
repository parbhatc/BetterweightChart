/**
 * Host-controlled replay: toolbar UI stays active but the chart engine does not
 * slice bars or move the viewport. Actions are logged (or forwarded via callback).
 *
 * @param {import("../app/boot/chart/state.js").BootContext | null | undefined} ctx
 */
export function isReplayHostControlled(ctx) {
  return Boolean(ctx?.opts?.replayHostControlled);
}

/**
 * @param {import("../app/boot/chart/state.js").BootContext | null | undefined} ctx
 * @param {string} action
 * @param {Record<string, unknown>} [detail]
 */
export function emitReplayHostAction(ctx, action, detail = {}) {
  const payload = { action, ...detail };
  if (typeof ctx?.opts?.onReplayHostAction === "function") {
    ctx.opts.onReplayHostAction(action, payload);
    return;
  }
  console.log("[BWC replay:host]", payload);
}
