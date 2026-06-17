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
