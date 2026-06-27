import {
  CHEVRON_DOWN,
  CLOSE,
  getSelectModeDef,
  JUMP_TO_END,
  PAUSE,
  PLAY,
  SELECT_MODES,
  STEP_FORWARD,
} from "./icons.js";
import { normalizeResolutionId } from "../chart/resolutionFormat.js";
import {
  normalizeStepInterval,
  REPLAY_SPEED_OPTIONS,
  replaySpeedLabel,
  replayStepIntervalButtonLabel,
  replayStepOptionsForChart,
} from "./menus.js";
import { openReplayDateDialog } from "./dateDialog.js";
import { isReplayHostControlled, emitReplayHostAction } from "./hostControl.js";

/**
 * @param {boolean} hideSelectModeMenu
 * @param {string} modeMenuItems
 */
function buildSelectGroupHtml(hideSelectModeMenu, modeMenuItems) {
  const modeMenuBlock = hideSelectModeMenu
    ? `</div>`
    : `<button type="button" class="tv-chart-replay-bar__chev-btn" data-action="select-mode" aria-label="Select starting point" aria-haspopup="menu" aria-expanded="false" title="Select starting point">
            <span class="tv-chart-replay-bar__chev" aria-hidden="true">${CHEVRON_DOWN}</span>
          </button>
        </div>
        <div class="tv-replay-select-menu" role="menu" aria-label="Select starting point" hidden>
          <div class="tv-replay-select-menu__title">Select starting point</div>
          ${modeMenuItems}
        </div>`;

  return `<div class="tv-chart-replay-bar__group">
      <div class="tv-chart-replay-bar__select-wrap">
        <div class="tv-chart-replay-bar__select">
          <button type="button" class="tv-chart-replay-bar__btn tv-chart-replay-bar__btn--select" data-action="select-bar" title="Select bar">
            <span class="tv-chart-replay-bar__icon" data-select-icon aria-hidden="true"></span>
            <span class="tv-chart-replay-bar__label" data-select-label>Select bar</span>
          </button>
          ${modeMenuBlock}
      </div>
    </div>
    <span class="tv-chart-replay-bar__sep" aria-hidden="true"></span>`;
}

/**
 * @param {object} opts
 * @param {ReturnType<import("./mode.js").mountReplayMode>} opts.replay
 * @param {() => string} [opts.getChartResolution]
 * @param {import("../app/boot/chart/state.js").BootContext} [opts.ctx]
 * @param {HTMLElement} [opts.footerEl]
 * @param {HTMLElement} [opts.controlsEl]
 * @param {boolean} [opts.hideSelectModeMenu]
 * @param {boolean} [opts.hideJumpEnd]
 * @param {boolean} [opts.hideExit]
 */
export function mountReplayToolbar(opts) {
  const { replay, getChartResolution = () => "1", ctx } = opts;
  const hideSelectModeMenu = Boolean(opts.hideSelectModeMenu);
  const hideJumpEnd = Boolean(opts.hideJumpEnd);
  const hideExit = Boolean(opts.hideExit);

  const footer =
    opts.footerEl instanceof HTMLElement
      ? opts.footerEl
      : document.querySelector(".tv-chart-replay-bar");
  if (!(footer instanceof HTMLElement)) return null;

  const controls =
    opts.controlsEl instanceof HTMLElement
      ? opts.controlsEl
      : footer.querySelector(".tv-chart-replay-bar__controls");
  if (!(controls instanceof HTMLElement)) return null;

  const speedMenuItems = REPLAY_SPEED_OPTIONS.map(
    (opt) =>
      `<button type="button" class="tv-replay-dropdown-menu__item" role="menuitemradio" data-speed="${opt.value}" aria-checked="false">
        <span class="tv-replay-dropdown-menu__item-main">
          <span class="tv-replay-dropdown-menu__item-title">${opt.label}</span>
          <span class="tv-replay-dropdown-menu__item-hint">${opt.hint}</span>
        </span>
      </button>`,
  ).join("");

  const modeMenuItems = SELECT_MODES.map(
    (mode) =>
      `<button type="button" class="tv-replay-select-menu__item" role="menuitemradio" data-mode="${mode.id}" aria-checked="false">
        <span class="tv-replay-select-menu__icon" aria-hidden="true">${mode.icon}</span>
        <span class="tv-replay-select-menu__label">${mode.label}</span>
      </button>`,
  ).join("");

  const jumpEndBlock = hideJumpEnd
    ? ""
    : `<span class="tv-chart-replay-bar__sep" aria-hidden="true"></span>
    <div class="tv-chart-replay-bar__group">
      <button type="button" class="tv-chart-replay-bar__btn tv-chart-replay-bar__btn--icon" data-action="jump-end" title="Jump to end" disabled>
        <span class="tv-chart-replay-bar__icon" aria-hidden="true">${JUMP_TO_END}</span>
      </button>
    </div>`;

  const exitBlock = hideExit
    ? ""
    : `<div class="tv-chart-replay-bar__group tv-chart-replay-bar__group--close">
      <button type="button" class="tv-chart-replay-bar__btn tv-chart-replay-bar__btn--icon tv-chart-replay-bar__btn--close" data-action="exit" title="Exit Bar Replay" aria-label="Exit Bar Replay">
        <span class="tv-chart-replay-bar__icon" aria-hidden="true">${CLOSE}</span>
      </button>
    </div>`;

  controls.innerHTML = `${buildSelectGroupHtml(hideSelectModeMenu, modeMenuItems)}<div class="tv-chart-replay-bar__group">
      <button type="button" class="tv-chart-replay-bar__btn tv-chart-replay-bar__btn--icon" data-action="play" title="Play" disabled>
        <span class="tv-chart-replay-bar__icon" data-play-icon aria-hidden="true">${PLAY}</span>
      </button>
    </div>
    <div class="tv-chart-replay-bar__group">
      <button type="button" class="tv-chart-replay-bar__btn tv-chart-replay-bar__btn--icon" data-action="step-forward" title="Step forward" disabled>
        <span class="tv-chart-replay-bar__icon" aria-hidden="true">${STEP_FORWARD}</span>
      </button>
    </div>
    <div class="tv-chart-replay-bar__group tv-chart-replay-bar__group--speed">
      <div class="tv-chart-replay-bar__menu-wrap">
        <button type="button" class="tv-chart-replay-bar__btn tv-chart-replay-bar__btn--text" data-action="speed" title="Replay speed" aria-haspopup="menu" aria-expanded="false">1x</button>
        <div class="tv-replay-dropdown-menu" data-menu="speed" role="menu" aria-label="Replay speed" hidden>
          <div class="tv-replay-dropdown-menu__title">Replay speed</div>
          ${speedMenuItems}
        </div>
      </div>
      <div class="tv-chart-replay-bar__menu-wrap">
        <button type="button" class="tv-chart-replay-bar__btn tv-chart-replay-bar__btn--text" data-action="step-interval" title="Update interval" aria-haspopup="menu" aria-expanded="false">1m</button>
        <div class="tv-replay-dropdown-menu tv-replay-dropdown-menu--interval" data-menu="interval" role="menu" aria-label="Update interval" hidden>
          <div class="tv-replay-dropdown-menu__title">Update interval</div>
          <div class="tv-replay-dropdown-menu__scroll" data-interval-items></div>
          <div class="tv-replay-dropdown-menu__sep" role="separator" aria-hidden="true"></div>
          <label class="tv-replay-dropdown-menu__toggle" data-role="menuitem">
            <span class="tv-replay-dropdown-menu__toggle-label">Auto select interval</span>
            <span class="tv-replay-dropdown-menu__switch">
              <input type="checkbox" role="switch" data-auto-interval checked />
            </span>
          </label>
        </div>
      </div>
    </div>
    ${jumpEndBlock}
    ${exitBlock}`;

  const selectBtn = controls.querySelector('[data-action="select-bar"]');
  const selectIcon = controls.querySelector("[data-select-icon]");
  const selectLabel = controls.querySelector("[data-select-label]");
  const playBtn = controls.querySelector('[data-action="play"]');
  const playIcon = controls.querySelector("[data-play-icon]");
  const stepBtn = controls.querySelector('[data-action="step-forward"]');
  const jumpBtn = controls.querySelector('[data-action="jump-end"]');
  const speedBtn = controls.querySelector('[data-action="speed"]');
  const intervalBtn = controls.querySelector('[data-action="step-interval"]');
  const exitBtn = controls.querySelector('[data-action="exit"]');
  const selectModeBtn = controls.querySelector('[data-action="select-mode"]');
  const selectWrap = controls.querySelector(".tv-chart-replay-bar__select-wrap");
  const selectGroup = controls.querySelector(".tv-chart-replay-bar__select");
  const modeMenu = controls.querySelector(".tv-replay-select-menu");
  const speedMenu = controls.querySelector('[data-menu="speed"]');
  const intervalMenu = controls.querySelector('[data-menu="interval"]');
  const intervalItemsEl = controls.querySelector("[data-interval-items]");
  const autoIntervalInput = controls.querySelector("[data-auto-interval]");

  /** @param {boolean} on */
  function setTransportEnabled(on) {
    const enabled = isReplayHostControlled(ctx) ? replay.isActive() : on;
    playBtn?.toggleAttribute("disabled", !enabled);
    stepBtn?.toggleAttribute("disabled", !enabled);
    jumpBtn?.toggleAttribute("disabled", !enabled);
  }

  /** @param {HTMLElement | null | undefined} anchor @param {HTMLElement | null | undefined} menu */
  function positionMenu(anchor, menu) {
    if (!(anchor instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;

    menu.style.visibility = "hidden";
    menu.style.left = "0";
    menu.style.top = "0";

    const rect = anchor.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let left = rect.left;
    let top = rect.top - menuH - 6;

    if (top < 8) top = rect.bottom + 6;

    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - menuH - 8));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "";
  }

  function closeModeMenu() {
    modeMenu?.setAttribute("hidden", "");
    selectModeBtn?.setAttribute("aria-expanded", "false");
  }

  function closeSpeedMenu() {
    speedMenu?.setAttribute("hidden", "");
    speedBtn?.setAttribute("aria-expanded", "false");
  }

  function closeIntervalMenu() {
    intervalMenu?.setAttribute("hidden", "");
    intervalBtn?.setAttribute("aria-expanded", "false");
  }

  function closeAllMenus() {
    closeModeMenu();
    closeSpeedMenu();
    closeIntervalMenu();
  }

  function openModeMenu() {
    closeSpeedMenu();
    closeIntervalMenu();
    if (!(modeMenu instanceof HTMLElement)) return;
    modeMenu.removeAttribute("hidden");
    selectModeBtn?.setAttribute("aria-expanded", "true");
    positionMenu(selectModeBtn, modeMenu);
  }

  function isModeMenuOpen() {
    return modeMenu != null && !modeMenu.hidden;
  }

  function getAvailableResolutions() {
    return ctx?.resolutions?.length ? ctx.resolutions : undefined;
  }

  function ensureValidStepInterval() {
    const state = replay.getState();
    if (state.autoSelectInterval) return;
    const chartRes = getChartResolution();
    const options = replayStepOptionsForChart(chartRes, getAvailableResolutions());
    const current = normalizeStepInterval(state.stepInterval);
    if (options.some((opt) => opt.id === current)) return;
    const fallback =
      options.find((opt) => opt.id === normalizeResolutionId(chartRes))?.id ??
      options[options.length - 1]?.id ??
      "1";
    replay.setStepInterval(fallback);
  }

  function renderIntervalMenuItems() {
    if (!(intervalItemsEl instanceof HTMLElement)) return;
    ensureValidStepInterval();
    const state = replay.getState();
    const chartRes = getChartResolution();
    const options = replayStepOptionsForChart(chartRes, getAvailableResolutions());
    const activeId = state.autoSelectInterval
      ? normalizeResolutionId(chartRes)
      : normalizeStepInterval(state.stepInterval);

    intervalItemsEl.innerHTML = options
      .map(
        (opt) =>
          `<button type="button" class="tv-replay-dropdown-menu__item${activeId === opt.id ? " is-active" : ""}" role="menuitemradio" data-interval="${opt.id}" aria-checked="${activeId === opt.id ? "true" : "false"}">
            <span class="tv-replay-dropdown-menu__item-main tv-replay-dropdown-menu__item-main--single">
              <span class="tv-replay-dropdown-menu__item-title">${opt.label}</span>
            </span>
          </button>`,
      )
      .join("");
  }

  function openSpeedMenu() {
    closeModeMenu();
    closeIntervalMenu();
    if (!(speedMenu instanceof HTMLElement) || !(speedBtn instanceof HTMLElement)) return;
    speedMenu.removeAttribute("hidden");
    speedBtn.setAttribute("aria-expanded", "true");
    positionMenu(speedBtn, speedMenu);
  }

  function openIntervalMenu() {
    closeModeMenu();
    closeSpeedMenu();
    renderIntervalMenuItems();
    if (!(intervalMenu instanceof HTMLElement) || !(intervalBtn instanceof HTMLElement)) return;
    intervalMenu.removeAttribute("hidden");
    intervalBtn.setAttribute("aria-expanded", "true");
    positionMenu(intervalBtn, intervalMenu);
  }

  function isSpeedMenuOpen() {
    return speedMenu != null && !speedMenu.hidden;
  }

  function isIntervalMenuOpen() {
    return intervalMenu != null && !intervalMenu.hidden;
  }

  /** @param {{ active: boolean, selectedBarIndex: number | null, currentBarIndex: number | null, selectingBar: boolean, selectMode: import("./icons.js").ReplaySelectMode, playing: boolean, speed: number, stepInterval: string, autoSelectInterval: boolean }} state */
  function sync(state) {
    footer.hidden = !state.active;
    if (!state.active) closeAllMenus();

    if (state.active && state.selectedBarTime != null) {
      ctx.replayEngine?.refreshReplayLiveEnd?.();
    }

    const chartRes = getChartResolution();
    selectGroup?.classList.toggle("is-selecting", state.selectingBar);
    const hasSelection = state.selectedBarTime != null;
    setTransportEnabled(hasSelection);

    const hostControlled = isReplayHostControlled(ctx);
    const max = replay.getMaxBarIndex?.() ?? 0;
    const cursorIdx = replay.getCursorBarIndex?.() ?? state.currentBarIndex ?? 0;
    const atEnd =
      hasSelection && cursorIdx >= max && !(replay.hasForwardBars?.() ?? false);

    if (hostControlled) {
      stepBtn?.removeAttribute("disabled");
      playBtn?.removeAttribute("disabled");
    } else {
      stepBtn?.toggleAttribute("disabled", !hasSelection || atEnd);
      playBtn?.toggleAttribute("disabled", !hasSelection || atEnd);
    }

    if (playIcon) playIcon.innerHTML = state.playing ? PAUSE : PLAY;
    if (playBtn instanceof HTMLButtonElement) {
      playBtn.title = state.playing ? "Pause" : "Play";
    }

    if (speedBtn) speedBtn.textContent = replaySpeedLabel(state.speed);
    if (intervalBtn) {
      ensureValidStepInterval();
      const synced = replay.getState();
      intervalBtn.textContent = replayStepIntervalButtonLabel(
        synced.stepInterval,
        chartRes,
        synced.autoSelectInterval,
      );
    }
    if (autoIntervalInput instanceof HTMLInputElement) {
      autoIntervalInput.checked = state.autoSelectInterval;
    }

    speedMenu?.querySelectorAll("[data-speed]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const active = Number(el.dataset.speed) === state.speed;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-checked", active ? "true" : "false");
    });

    if (isIntervalMenuOpen()) renderIntervalMenuItems();

    const modeDef = getSelectModeDef(state.selectMode);
    if (selectIcon) selectIcon.innerHTML = modeDef.icon;
    if (selectLabel) selectLabel.textContent = modeDef.buttonLabel;
    if (selectBtn) {
      selectBtn.title = modeDef.buttonLabel;
      selectBtn.setAttribute("aria-pressed", state.selectingBar ? "true" : "false");
    }

    modeMenu?.querySelectorAll("[data-mode]").forEach((el) => {
      const active = el instanceof HTMLElement && el.dataset.mode === state.selectMode;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  replay.subscribe(sync);

  selectBtn?.addEventListener("click", () => {
    closeAllMenus();
    const state = replay.getState();
    if (!hideSelectModeMenu && state.selectMode === "date" && ctx) {
      openReplayDateDialog({
        ctx,
        replay,
        anchorEl: selectBtn instanceof HTMLElement ? selectBtn : undefined,
      });
      return;
    }
    replay.toggleSelectBar();
  });

  selectModeBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (isModeMenuOpen()) closeModeMenu();
    else openModeMenu();
  });

  selectModeBtn?.addEventListener("mousedown", (ev) => ev.stopPropagation());

  modeMenu?.querySelectorAll("[data-mode]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const mode = el instanceof HTMLElement ? el.dataset.mode : null;
      if (mode === "bar") {
        replay.setSelectMode("bar");
      } else if (mode === "date" && ctx) {
        replay.setSelectMode("date");
        openReplayDateDialog({
          ctx,
          replay,
          anchorEl: selectModeBtn instanceof HTMLElement ? selectModeBtn : undefined,
        });
      }
      closeModeMenu();
    });
  });

  speedMenu?.querySelectorAll("[data-speed]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!(el instanceof HTMLElement)) return;
      const speed = Number(el.dataset.speed);
      if (Number.isFinite(speed)) replay.setSpeed(speed);
      closeSpeedMenu();
    });
  });

  intervalItemsEl?.addEventListener("click", (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest("[data-interval]") : null;
    if (!(btn instanceof HTMLElement)) return;
    ev.stopPropagation();
    const id = btn.dataset.interval;
    if (!id) return;
    replay.setStepInterval(id);
    if (isReplayHostControlled(ctx)) {
      emitReplayHostAction(ctx, "stepInterval", {
        stepInterval: id,
        autoSelectInterval: false,
        chartResolution: getChartResolution(),
      });
    }
    closeIntervalMenu();
  });

  autoIntervalInput?.addEventListener("change", (ev) => {
    ev.stopPropagation();
    if (autoIntervalInput instanceof HTMLInputElement) {
      replay.setAutoSelectInterval(autoIntervalInput.checked);
      if (isReplayHostControlled(ctx)) {
        emitReplayHostAction(ctx, "stepInterval", {
          stepInterval: replay.getState().stepInterval,
          autoSelectInterval: autoIntervalInput.checked,
          chartResolution: getChartResolution(),
        });
      }
    }
  });

  modeMenu?.addEventListener("mousedown", (ev) => ev.stopPropagation());
  speedMenu?.addEventListener("mousedown", (ev) => ev.stopPropagation());
  intervalMenu?.addEventListener("mousedown", (ev) => ev.stopPropagation());

  document.addEventListener("mousedown", (ev) => {
    if (!(ev.target instanceof Node)) return;
    if (isModeMenuOpen()) {
      if (selectWrap?.contains(ev.target)) return;
      if (modeMenu?.contains(ev.target)) return;
      closeModeMenu();
    }
    if (isSpeedMenuOpen()) {
      if (speedBtn?.contains(ev.target)) return;
      if (speedMenu?.contains(ev.target)) return;
      closeSpeedMenu();
    }
    if (isIntervalMenuOpen()) {
      if (intervalBtn?.contains(ev.target)) return;
      if (intervalMenu?.contains(ev.target)) return;
      closeIntervalMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (isModeMenuOpen()) positionMenu(selectModeBtn, modeMenu);
    if (isSpeedMenuOpen()) positionMenu(speedBtn, speedMenu);
    if (isIntervalMenuOpen()) positionMenu(intervalBtn, intervalMenu);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeAllMenus();
  });

  playBtn?.addEventListener("click", () => {
    const { playing, selectedBarTime, currentBarIndex, currentBarTime, selectedBarIndex } = replay.getState();
    const hostControlled = isReplayHostControlled(ctx);
    if (!hostControlled && selectedBarTime == null) return;
    const max = replay.getMaxBarIndex?.() ?? 0;
    const cursorIdx = replay.getCursorBarIndex?.() ?? 0;
    if (!hostControlled && cursorIdx >= max && !(replay.hasForwardBars?.() ?? false)) return;

    if (playing) {
      replay.pause();
      if (hostControlled) {
        emitReplayHostAction(ctx, "pause", {
          currentBarIndex,
          currentBarTime,
          selectedBarIndex,
          selectedBarTime,
        });
      }
      return;
    }

    if (hostControlled) {
      replay.play();
      emitReplayHostAction(ctx, "play", {
        currentBarIndex,
        currentBarTime,
        selectedBarIndex,
        selectedBarTime,
      });
      return;
    }

    replay.play();
  });

  stepBtn?.addEventListener("click", () => replay.stepForward());
  jumpBtn?.addEventListener("click", () => replay.jumpToEnd());

  speedBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (isSpeedMenuOpen()) closeSpeedMenu();
    else openSpeedMenu();
  });

  intervalBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (isIntervalMenuOpen()) closeIntervalMenu();
    else openIntervalMenu();
  });

  exitBtn?.addEventListener("click", () => replay.exit());

  return {
    footer,
    controls,
    refresh: () => sync(replay.getState()),
  };
}
