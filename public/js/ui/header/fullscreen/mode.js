import { FULLSCREEN, FULLSCREEN_EXIT } from "../icons.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.appEl
 * @param {HTMLElement} opts.toggleBtn
 * @param {HTMLElement} [opts.iconEl]
 */
export function mountFullscreenMode(opts) {
  const { appEl, toggleBtn, iconEl } = opts;
  let active = false;
  /** @type {Set<(active: boolean) => void>} */
  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => fn(active));
  }

  function setActive(next) {
    if (active === next) return;
    active = next;
    appEl.classList.toggle("tv-app--chart-fullscreen", active);
    toggleBtn.setAttribute("aria-pressed", active ? "true" : "false");
    toggleBtn.setAttribute("aria-label", active ? "Exit fullscreen mode" : "Fullscreen mode");
    toggleBtn.dataset.tooltip = active ? "Exit fullscreen mode" : "Fullscreen mode";
    if (iconEl) iconEl.innerHTML = active ? FULLSCREEN_EXIT : FULLSCREEN;
    notify();
  }

  function toggle() {
    setActive(!active);
  }

  toggleBtn.addEventListener("click", toggle);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && active) {
      ev.preventDefault();
      setActive(false);
      return;
    }
    if (ev.shiftKey && ev.key.toLowerCase() === "f" && !isTypingTarget(ev.target)) {
      ev.preventDefault();
      toggle();
    }
  });

  return {
    isActive: () => active,
    enter: () => setActive(true),
    exit: () => setActive(false),
    toggle,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function ensureBottomBarLeftMount(mountEl) {
  const bar =
    mountEl.closest?.(".tv-chart-bottom-bar") ??
    document.querySelector(".tv-chart-bottom-bar");
  if (!(bar instanceof HTMLElement)) return mountEl;

  let left = bar.querySelector(".tv-chart-bottom-bar__left");
  if (!(left instanceof HTMLElement)) {
    left = document.createElement("div");
    left.className = "tv-chart-bottom-bar__left";
    bar.insertBefore(left, bar.firstChild);
  }
  return left;
}

/**
 * Mobile exit control for chart fullscreen (no Escape key on touch devices).
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl
 * @param {{ exit: () => void, subscribe: (fn: (active: boolean) => void) => () => void }} opts.fullscreen
 */
export function mountBottomFullscreenExit(opts) {
  const { mountEl, fullscreen } = opts;
  const target = ensureBottomBarLeftMount(mountEl);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tv-fullscreen-exit";
  btn.hidden = true;
  btn.setAttribute("aria-label", "Exit fullscreen");
  btn.title = "Exit fullscreen";
  btn.innerHTML = `<span class="tv-fullscreen-exit__icon" aria-hidden="true">${FULLSCREEN_EXIT}</span><span class="tv-fullscreen-exit__label">Exit</span>`;
  btn.addEventListener("click", () => fullscreen.exit());
  target.prepend(btn);

  function sync(active) {
    btn.hidden = !active;
  }

  sync(fullscreen.isActive?.() ?? false);
  fullscreen.subscribe(sync);

  return { button: btn };
}

/** @param {EventTarget | null} target */
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
