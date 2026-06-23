/**
 * Lightweight per-chart spinner while data stays on screen (symbol / TF / replay switches).
 */
const OVERLAY_MIN_VISIBLE_MS = 180;

export function createChartOverlayLoader() {
  /** @type {Map<HTMLElement, HTMLElement>} */
  const hosts = new Map();
  let pending = 0;
  let shownAt = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let hideTimer = null;

  /** @param {HTMLElement} stage */
  function mount(stage) {
    let el = hosts.get(stage);
    if (!el) {
      el = document.createElement("div");
      el.className = "app-loader app-loader--overlay";
      el.setAttribute("role", "status");
      el.setAttribute("aria-label", "Updating chart");
      el.innerHTML = '<div class="app-loader__spinner" aria-hidden="true"></div>';
      stage.appendChild(el);
      hosts.set(stage, el);
    }
    el.classList.remove("app-loader--hidden");
    stage.setAttribute("aria-busy", "true");
  }

  function unmountAll() {
    for (const [stage, el] of hosts) {
      el.classList.add("app-loader--hidden");
      el.remove();
      stage.removeAttribute("aria-busy");
    }
    hosts.clear();
  }

  /** @param {HTMLElement | HTMLElement[] | null | undefined} [roots] */
  function resolveStages(roots) {
    if (roots == null) {
      const stage = document.querySelector(".tv-chart-wrap__stage");
      return stage ? [stage] : [];
    }
    return (Array.isArray(roots) ? roots : [roots]).filter(
      (el) => el instanceof HTMLElement,
    );
  }

  function scheduleHide() {
    clearTimeout(hideTimer ?? undefined);
    const elapsed = Date.now() - shownAt;
    const delay = Math.max(0, OVERLAY_MIN_VISIBLE_MS - elapsed);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (pending === 0) unmountAll();
    }, delay);
  }

  return {
    /** @param {HTMLElement | HTMLElement[] | null | undefined} [roots] */
    show(roots) {
      clearTimeout(hideTimer ?? undefined);
      hideTimer = null;
      pending += 1;
      if (pending === 1) shownAt = Date.now();
      for (const stage of resolveStages(roots)) mount(stage);
    },
    hide() {
      pending = Math.max(0, pending - 1);
      if (pending === 0) scheduleHide();
      return new Promise((resolve) => {
        if (pending > 0) {
          resolve();
          return;
        }
        const elapsed = Date.now() - shownAt;
        const delay = Math.max(0, OVERLAY_MIN_VISIBLE_MS - elapsed);
        setTimeout(resolve, delay);
      });
    },
    /** @param {HTMLElement | HTMLElement[] | null | undefined} roots @param {() => Promise<unknown>} fn */
    async wrap(roots, fn) {
      this.show(roots);
      try {
        return await fn();
      } finally {
        this.hide();
      }
    },
  };
}

/** Chart-stage loading overlay with spinner. */
export function createAppLoader(root = document.querySelector(".tv-stage")) {
  const el =
    document.getElementById("app-loader") ??
    (() => {
      const loader = document.createElement("div");
      loader.id = "app-loader";
      loader.className = "app-loader";
      loader.setAttribute("role", "status");
      loader.setAttribute("aria-label", "Loading chart");
      loader.innerHTML = '<div class="app-loader__spinner" aria-hidden="true"></div>';
      root?.prepend(loader);
      return loader;
    })();

  if (root && el.parentElement !== root) {
    root.prepend(el);
  }

  let pending = 0;

  function sync() {
    const on = pending > 0;
    el.classList.toggle("app-loader--hidden", !on);
    root?.setAttribute("aria-busy", on ? "true" : "false");
  }

  return {
    show() {
      pending += 1;
      sync();
    },
    hide() {
      pending = Math.max(0, pending - 1);
      sync();
    },
    async wrap(fn) {
      this.show();
      try {
        return await fn();
      } finally {
        this.hide();
      }
    },
  };
}
