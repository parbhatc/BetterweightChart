const STORAGE_KEY = "tv-draw-toolbar-collapsed";
const TOOLBAR_TRANSITION_MS = 200;

const CHEVRON_LEFT = `<svg class="tv-draw-toolbar-toggle__icon" viewBox="0 0 10 16" width="8" height="12" aria-hidden="true"><path fill="currentColor" d="M6.6 1.4 5.2 0l-8 8 8 8 1.4-1.4L2.811 8 6.6 1.4z"/></svg>`;

function notifyViewportLayout() {
  window.dispatchEvent(new Event("resize"));
}

/**
 * @param {HTMLElement} toolbarEl
 * @param {HTMLElement | null | undefined} workspace
 */
function wireToolbarLayoutNotify(toolbarEl, workspace) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let settleTimer = null;
  /** @type {number | null} */
  let settleRaf = null;

  const scheduleNotify = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      notifyViewportLayout();
    }, TOOLBAR_TRANSITION_MS + 40);

    if (settleRaf != null) cancelAnimationFrame(settleRaf);
    settleRaf = requestAnimationFrame(() => {
      settleRaf = requestAnimationFrame(() => {
        settleRaf = null;
        notifyViewportLayout();
      });
    });
  };

  toolbarEl.addEventListener("transitionend", (ev) => {
    if (ev.target !== toolbarEl || ev.propertyName !== "width") return;
    notifyViewportLayout();
  });

  const stage = workspace?.querySelector(".tv-stage");
  if (stage instanceof HTMLElement && typeof ResizeObserver !== "undefined") {
    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(() => scheduleNotify());
    });
    ro.observe(stage);
  }

  return scheduleNotify;
}

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
  const scheduleLayoutNotify = wireToolbarLayoutNotify(toolbarEl, workspace);

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
    scheduleLayoutNotify();
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
