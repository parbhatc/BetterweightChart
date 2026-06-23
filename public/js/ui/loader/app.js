/**
 * Lightweight per-chart spinner while data stays on screen (e.g. replay TF switch).
 */
export function createChartOverlayLoader() {
  /** @type {Map<HTMLElement, HTMLElement>} */
  const hosts = new Map();
  let pending = 0;

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

  return {
    /** @param {HTMLElement | HTMLElement[] | null | undefined} [roots] */
    show(roots) {
      pending += 1;
      for (const stage of resolveStages(roots)) mount(stage);
    },
    hide() {
      pending = Math.max(0, pending - 1);
      if (pending === 0) unmountAll();
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
