/**
 * Pause / throttle live candle updates for perf testing.
 *
 * Console:
 *   __BWC_LIVE__.pause()           — ignore all live ticks
 *   __BWC_LIVE__.pauseForming()    — block forming-bar series.update only
 *   __BWC_LIVE__.pauseNewBars()    — block new-bar appends only
 *   __BWC_LIVE__.setCoalesce(true) — one forming update per animation frame (default on)
 *   __BWC_LIVE__.resume()          — clear all pauses
 *   __BWC_LIVE__.status()
 */

let livePaused = false;
let formingPaused = false;
let newBarsPaused = false;
let coalesceForming = true;

/** @type {Set<() => void>} */
const pauseHooks = new Set();

/** Register cleanup when live updates are paused (e.g. cancel pending RAF coalesce). */
export function registerLivePauseHook(fn) {
  pauseHooks.add(fn);
  return () => pauseHooks.delete(fn);
}

function runPauseHooks() {
  for (const fn of pauseHooks) {
    try {
      fn();
    } catch {
      //
    }
  }
}

export function isLiveBarsPaused() {
  return livePaused;
}

export function isFormingUpdatesPaused() {
  return formingPaused;
}

export function isNewBarsPaused() {
  return newBarsPaused;
}

export function shouldCoalesceFormingUpdates() {
  return coalesceForming && !formingPaused && !livePaused;
}

export function pauseLiveBars() {
  livePaused = true;
  runPauseHooks();
  console.info("[BWC:live] paused — all live ticks ignored");
}

export function resumeLiveBars() {
  livePaused = false;
  console.info("[BWC:live] resumed — live ticks enabled");
}

export function pauseFormingUpdates() {
  formingPaused = true;
  runPauseHooks();
  console.info("[BWC:live] forming updates paused");
}

export function resumeFormingUpdates() {
  formingPaused = false;
  console.info("[BWC:live] forming updates resumed");
}

export function pauseNewBarUpdates() {
  newBarsPaused = true;
  console.info("[BWC:live] new-bar appends paused");
}

export function resumeNewBarUpdates() {
  newBarsPaused = false;
  console.info("[BWC:live] new-bar appends resumed");
}

export function setFormingCoalesce(on = true) {
  coalesceForming = Boolean(on);
  console.info(`[BWC:live] forming coalesce ${coalesceForming ? "on" : "off"}`);
}

export function resumeAllLiveControls() {
  livePaused = false;
  formingPaused = false;
  newBarsPaused = false;
  console.info("[BWC:live] all pauses cleared");
}

export function getLiveControlStatus() {
  return {
    livePaused,
    formingPaused,
    newBarsPaused,
    coalesceForming,
  };
}

export function installLiveControlGlobal() {
  if (typeof window === "undefined") return;
  if (window.__BWC_LIVE__) return;

  const api = {
    pause: pauseLiveBars,
    resume: resumeLiveBars,
    pauseForming: pauseFormingUpdates,
    resumeForming: resumeFormingUpdates,
    pauseNewBars: pauseNewBarUpdates,
    resumeNewBars: resumeNewBarUpdates,
    setCoalesce: setFormingCoalesce,
    resumeAll: resumeAllLiveControls,
    status: getLiveControlStatus,
  };

  window.__BWC_LIVE__ = api;

  if (!window.__BWC_LIVE_HINT__) {
    window.__BWC_LIVE_HINT__ = true;
    console.info(
      "[BWC:live] test helpers: __BWC_LIVE__.pause() | pauseForming() | pauseNewBars() | resume() | status()",
    );
  }
}
