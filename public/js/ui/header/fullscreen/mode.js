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

  function setActive(next) {
    active = next;
    appEl.classList.toggle("tv-app--chart-fullscreen", active);
    toggleBtn.setAttribute("aria-pressed", active ? "true" : "false");
    toggleBtn.setAttribute("aria-label", active ? "Exit fullscreen mode" : "Fullscreen mode");
    toggleBtn.dataset.tooltip = active ? "Exit fullscreen mode" : "Fullscreen mode";
    if (iconEl) iconEl.innerHTML = active ? FULLSCREEN_EXIT : FULLSCREEN;
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
  };
}

/** @param {EventTarget | null} target */
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
