/**
 * Public replay controls for host apps (widget.replay).
 * @param {{ replay: ReturnType<import("./mode.js").mountReplayMode> | null | undefined, replayEngine?: object | null }} deps
 */
export function createReplayControlApi(deps) {
  const replay = deps?.replay ?? null;
  const replayEngine = deps?.replayEngine ?? null;

  /** @type {() => void} */
  const noop = () => {};

  if (!replay) {
    return {
      getState: () => null,
      isActive: () => false,
      subscribe: () => noop,
      enter: noop,
      exit: noop,
      toggle: noop,
      toggleSelectBar: noop,
      play: noop,
      pause: noop,
      stepForward: noop,
      jumpToEnd: noop,
      setSpeed: noop,
      setStepInterval: noop,
      setAutoSelectInterval: noop,
      getMaxBarIndex: () => null,
      hasForwardBars: () => false,
      getCursorBarIndex: () => null,
    };
  }

  return {
    getState: () => replay.getState(),
    isActive: () => replay.isActive(),
    subscribe: (fn) => replay.subscribe(fn),
    enter: () => replay.enter(),
    exit: () => replay.exit(),
    toggle: () => replay.toggle(),
    toggleSelectBar: () => replay.toggleSelectBar(),
    play: () => replay.play(),
    pause: () => replay.pause(),
    stepForward: () => {
      if (typeof replayEngine?.stepForward === "function") void replayEngine.stepForward();
      else replay.stepForward();
    },
    jumpToEnd: () => {
      if (typeof replayEngine?.jumpToEnd === "function") void replayEngine.jumpToEnd();
      else replay.jumpToEnd();
    },
    setSpeed: (speed) => replay.setSpeed(speed),
    setStepInterval: (stepInterval) => replay.setStepInterval(stepInterval),
    setAutoSelectInterval: (on) => replay.setAutoSelectInterval(on),
    getMaxBarIndex: () => replayEngine?.getMaxBarIndex?.() ?? null,
    hasForwardBars: () => replayEngine?.hasForwardBars?.() ?? false,
    getCursorBarIndex: () =>
      replayEngine?.getCursorBarIndex?.() ?? replay.getState().currentBarIndex ?? null,
  };
}
