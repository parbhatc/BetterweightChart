const ICON_REPORT = `<svg class="tv-strategy-report-reopen__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16" fill="none" aria-hidden="true"><path fill="currentColor" d="m16.001 7.05-4.81 4.887-4.308-3.835-3.81 3.899L2 10.95l4.81-4.92 4.312 3.838 3.81-3.87z"/></svg>`;

/**
 * Bottom-bar control to reopen a dismissed indicator bottom pane.
 * @param {{ onReopen?: () => void }} [opts]
 */
export function createBottomPaneReopenButton(opts = {}) {
  /** @type {HTMLButtonElement | null} */
  let btn = null;

  function ensureMount() {
    const bar = document.querySelector(".tv-chart-bottom-bar");
    if (!bar) return null;

    let left = bar.querySelector(".tv-chart-bottom-bar__left");
    if (!left) {
      left = document.createElement("div");
      left.className = "tv-chart-bottom-bar__left";
      bar.insertBefore(left, bar.firstChild);
    }

    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tv-strategy-report-reopen tv-bottom-pane-reopen";
      btn.hidden = true;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        opts.onReopen?.();
      });
      left.appendChild(btn);
    }
    return btn;
  }

  /**
   * @param {{ title: string, subtitle?: string, loading?: boolean } | null} state
   */
  function sync(state) {
    const el = ensureMount();
    if (!el) return;

    if (!state) {
      el.hidden = true;
      return;
    }

    const subtitle = state.subtitle
      ? `<span class="tv-strategy-report-reopen__sub">${state.subtitle}</span>`
      : "";
    el.innerHTML = `${ICON_REPORT}<span class="tv-strategy-report-reopen__label">${state.title}</span>${subtitle}`;
    el.hidden = false;
    el.classList.toggle("is-loading", Boolean(state.loading));
    el.title = `Open ${state.title}`;
    el.setAttribute("aria-label", `Open bottom pane: ${state.title}`);
  }

  return { sync };
}
