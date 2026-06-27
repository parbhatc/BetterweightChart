import { replayDebug, replayDebugState } from "./debug.js";

/**
 * @typedef {import("./icons.js").ReplaySelectMode} ReplaySelectMode
 * @typedef {object} ReplayState
 * @property {boolean} active
 * @property {number | null} selectedBarIndex
 * @property {number | null} currentBarIndex
 * @property {number | null} selectedBarTime
 * @property {number | null} currentBarTime
 * @property {boolean} selectingBar
 * @property {ReplaySelectMode} selectMode
 * @property {boolean} playing
 * @property {number} speed
 * @property {string} stepInterval
 * @property {boolean} autoSelectInterval
 */

/** @typedef {(state: ReplayState) => void} ReplayListener */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.appEl
 * @param {HTMLElement} opts.toggleBtn
 * @param {boolean} [opts.hostControlled]
 * @param {boolean} [opts.lockActive]
 */
export function mountReplayMode(opts) {
  const { appEl, toggleBtn, hostControlled = false, lockActive = false } = opts;

  /** @type {ReplayState} */
  let state = {
    active: false,
    selectedBarIndex: null,
    currentBarIndex: null,
    selectedBarTime: null,
    currentBarTime: null,
    selectingBar: false,
    selectMode: "bar",
    playing: false,
    speed: 1,
    stepInterval: "1",
    autoSelectInterval: true,
  };

  /** @type {Set<ReplayListener>} */
  const listeners = new Set();

  function notify() {
    replayDebugState({ ...state });
    listeners.forEach((fn) => fn({ ...state }));
  }

  /** @param {Partial<ReplayState>} patch */
  function patch(next) {
    state = { ...state, ...next };
    notify();
  }

  function setActive(next) {
    if (lockActive && !next && state.active) return;
    if (state.active === next) return;
    if (!next) {
      state = {
        active: false,
        selectedBarIndex: null,
        currentBarIndex: null,
        selectedBarTime: null,
        currentBarTime: null,
        selectingBar: false,
        selectMode: "bar",
        playing: false,
        speed: state.speed,
        stepInterval: state.stepInterval,
        autoSelectInterval: state.autoSelectInterval,
      };
      replayDebug("exit");
    } else {
      state = {
        ...state,
        active: true,
        selectingBar: false,
        selectMode: "bar",
        playing: false,
        selectedBarIndex: null,
        currentBarIndex: null,
        selectedBarTime: null,
        currentBarTime: null,
      };
      replayDebug("enter");
    }
    appEl.classList.toggle("tv-app--replay", state.active);
    toggleBtn.setAttribute("aria-pressed", state.active ? "true" : "false");
    toggleBtn.classList.toggle("is-pressed", state.active);
    notify();
  }

  function toggle() {
    if (lockActive && state.active) return;
    setActive(!state.active);
  }

  toggleBtn.addEventListener("click", toggle);

  if (!lockActive) {
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && state.active) {
        ev.preventDefault();
        setActive(false);
      }
    });
  }

  return {
    getState: () => ({ ...state }),
    isActive: () => state.active,
    enter: () => setActive(true),
    exit: () => {
      if (lockActive && state.active) return;
      setActive(false);
    },
    toggle,
    subscribe: (fn) => {
      listeners.add(fn);
      fn({ ...state });
      return () => listeners.delete(fn);
    },
    toggleSelectBar: () => {
      if (!state.active) return;
      const selectingBar = !state.selectingBar;
      replayDebug(selectingBar ? "selectBar.on" : "selectBar.off");
      patch({ selectingBar, playing: false });
    },
    setSelectMode: (selectMode) => {
      replayDebug("selectMode", { selectMode });
      patch({ selectMode, selectingBar: false, playing: false });
    },
    setSelectedBar: (index, utcTime) => {
      replayDebug("selectBar.set", { index, time: utcTime });
      patch({
        selectedBarIndex: index,
        currentBarIndex: index,
        selectedBarTime: utcTime,
        currentBarTime: utcTime,
        selectingBar: false,
        playing: false,
      });
    },
    setReplayCursor: (utcTime, opts = {}) => {
      if (!state.active || state.selectedBarTime == null) return;
      if (utcTime == null || !Number.isFinite(utcTime)) return;
      patch({
        currentBarTime: utcTime,
        ...(opts.index != null ? { currentBarIndex: opts.index } : {}),
        playing: opts.fromPlayback ? state.playing : false,
      });
    },
    /** @param {{ selectedBarIndex: number, currentBarIndex: number, selectedBarTime: number, currentBarTime: number }} pos */
    setReplayPosition: (pos) => {
      if (!state.active) return;
      patch({
        selectedBarIndex: pos.selectedBarIndex,
        currentBarIndex: pos.currentBarIndex,
        selectedBarTime: pos.selectedBarTime,
        currentBarTime: pos.currentBarTime,
        playing: false,
        selectingBar: false,
      });
    },
    setCursorBarIndex: (index, opts = {}) => {
      if (!state.active || state.selectedBarTime == null) return;
      if (index == null || !Number.isFinite(index)) return;
      patch({
        currentBarIndex: index,
        playing: opts.fromPlayback ? state.playing : false,
      });
    },
    play: () => {
      if (!state.active) return;
      if (!hostControlled && state.selectedBarTime == null) return;
      replayDebug("play");
      patch({ playing: true });
    },
    pause: () => {
      if (!state.playing) return;
      replayDebug("pause");
      patch({ playing: false });
    },
    stepForward: () => {
      if (!state.active || state.selectedBarTime == null) return;
      replayDebug("stepForward", { from: state.currentBarTime });
    },
    jumpToEnd: () => {
      if (!state.active) return;
      replayDebug("jumpToEnd");
      patch({ playing: false, selectingBar: false });
    },
    setSpeed: (speed) => {
      replayDebug("speed", { speed });
      patch({ speed });
    },
    setStepInterval: (stepInterval) => {
      replayDebug("stepInterval", { stepInterval });
      patch({ stepInterval, autoSelectInterval: false });
    },
    setAutoSelectInterval: (autoSelectInterval) => {
      replayDebug("autoSelectInterval", { autoSelectInterval });
      patch({ autoSelectInterval });
    },
    /** @param {Partial<ReplayState> & { active: true }} persisted */
    restoreFromPersist(persisted) {
      state = {
        ...state,
        ...persisted,
        active: true,
        playing: false,
        selectingBar: false,
      };
      appEl.classList.toggle("tv-app--replay", true);
      toggleBtn.setAttribute("aria-pressed", "true");
      toggleBtn.classList.toggle("is-pressed", true);
      replayDebug("restoreFromPersist", { ...state });
      notify();
    },
  };
}
