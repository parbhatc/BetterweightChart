const STORAGE_KEY = "tv-draw-toolbar-collapsed";

const CHEVRON_LEFT = `<svg class="tv-draw-toolbar-toggle__icon" viewBox="0 0 10 16" width="8" height="12" aria-hidden="true"><path fill="currentColor" d="M6.6 1.4 5.2 0l-8 8 8 8 1.4-1.4L2.811 8 6.6 1.4z"/></svg>`;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.toolbarEl
 * @param {{ closeAllFlyouts: () => void }} opts.flyout
 */
export function createDrawingToolbarCollapse(opts) {
  const { toolbarEl, flyout } = opts;
  const workspace = toolbarEl.closest(".tv-workspace");
  /** @type {HTMLButtonElement | null} */
  let toggleBtn = null;

  function syncCollapsed(collapsed) {
    toolbarEl.classList.toggle("drawing-toolbar--collapsed", collapsed);
    workspace?.classList.toggle("tv-workspace--draw-toolbar-collapsed", collapsed);
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    toggleBtn.classList.toggle("tv-draw-toolbar-toggle--collapsed", collapsed);
    const label = collapsed ? "Show drawing toolbar" : "Hide drawing toolbar";
    toggleBtn.setAttribute("aria-label", label);
    toggleBtn.title = label;
  }

  function setCollapsed(collapsed, persist = true) {
    syncCollapsed(collapsed);
    if (persist) localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    if (collapsed) flyout.closeAllFlyouts();
    window.dispatchEvent(new Event("resize"));
  }

  function mountBottomToggle() {
    const bar = document.querySelector(".tv-chart-bottom-bar");
    if (!bar) return;

    let left = bar.querySelector(".tv-chart-bottom-bar__left");
    if (!left) {
      left = document.createElement("div");
      left.className = "tv-chart-bottom-bar__left";
      bar.insertBefore(left, bar.firstChild);
    }

    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "tv-draw-toolbar-toggle";
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.setAttribute("aria-label", "Hide drawing toolbar");
    toggleBtn.title = "Hide drawing toolbar";
    toggleBtn.innerHTML = CHEVRON_LEFT;
    toggleBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setCollapsed(!toolbarEl.classList.contains("drawing-toolbar--collapsed"));
    });
    left.appendChild(toggleBtn);
  }

  if (localStorage.getItem(STORAGE_KEY) === "1") {
    syncCollapsed(true);
  }

  return {
    expand: () => setCollapsed(false),
    collapse: () => setCollapsed(true),
    toggle: () => setCollapsed(toolbarEl.classList.contains("drawing-toolbar--collapsed")),
    isCollapsed: () => toolbarEl.classList.contains("drawing-toolbar--collapsed"),
    mountBottomToggle,
  };
}

export const NARROW_DRAW_TOOLBAR_MQ = window.matchMedia("(max-width: 480px)");
export const MOBILE_DRAW_TOOLBAR_MQ = window.matchMedia("(max-width: 840px)");
