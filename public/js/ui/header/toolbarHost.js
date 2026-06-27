/** @typedef {'left' | 'right'} ToolbarRegion */
/** @typedef {'symbol' | 'timeframe' | 'indicators' | 'replay' | 'end'} ToolbarSlotAnchor */

/** @type {Record<string, string>} */
const ANCHOR_SELECTORS = {
  symbol: "#symbol-picker",
  timeframe: "#timeframe-picker",
  indicators: "#header-toolbar-indicators",
  replay: "#header-toolbar-replay",
  end: "",
};

/** @param {string} after */
function resolveAnchor(regionEl, after) {
  if (after === "end") return null;
  const staticSel = ANCHOR_SELECTORS[after];
  if (staticSel) {
    const el = regionEl.querySelector(staticSel);
    if (el instanceof HTMLElement) return el;
  }
  const hostSlot = regionEl.querySelector(`[data-toolbar-slot="${after}"]`);
  return hostSlot instanceof HTMLElement ? hostSlot : null;
}

/**
 * Host API for mounting custom controls in the chart header toolbar.
 * @param {import("../../app/boot/chart/state.js").BootContext} ctx
 */
export function createToolbarApi(ctx) {
  /** @type {Map<string, { id: string, region: ToolbarRegion, element: HTMLElement, remove: () => void }>} */
  const slots = new Map();

  function getConnectedShellRoot() {
    const cached = ctx.shellRoot;
    if (cached instanceof HTMLElement && cached.isConnected) return cached;
    if (ctx.el instanceof HTMLElement && ctx.el.isConnected) {
      const root = ctx.el.closest(".tv-app");
      if (root instanceof HTMLElement && root.isConnected) return root;
    }
    return null;
  }

  function resolveChromeEl() {
    const root = getConnectedShellRoot();
    if (!root) return null;
    const cached = ctx.chromeEl;
    if (
      cached instanceof HTMLElement &&
      cached.isConnected &&
      root.contains(cached)
    ) {
      return cached;
    }
    const chrome = root.querySelector(".tv-toolbar");
    if (chrome instanceof HTMLElement && chrome.isConnected) {
      ctx.chromeEl = chrome;
      return chrome;
    }
    return null;
  }

  /** @param {ToolbarRegion} region */
  function getRegionEl(region) {
    const chrome = resolveChromeEl();
    if (!chrome) return null;
    const selector = region === "right" ? ".tv-toolbar__right" : ".tv-toolbar__left";
    const regionEl = chrome.querySelector(selector);
    return regionEl instanceof HTMLElement && regionEl.isConnected ? regionEl : null;
  }

  /**
   * @param {HTMLElement} regionEl
   * @param {HTMLElement} mount
   * @param {ToolbarSlotAnchor} after
   */
  function insertAfterAnchor(regionEl, mount, after) {
    if (after === "end") {
      regionEl.appendChild(mount);
      return;
    }
    const anchor = resolveAnchor(regionEl, after);
    if (anchor instanceof HTMLElement) {
      anchor.insertAdjacentElement("afterend", mount);
      return;
    }
    regionEl.appendChild(mount);
  }

  /**
   * @param {object} opts
   * @param {ToolbarRegion} [opts.region]
   * @param {string} opts.id
   * @param {string} [opts.className]
   * @param {ToolbarSlotAnchor} [opts.after]
   * @param {boolean} [opts.separator]
   */
  function createSlot(opts) {
    const {
      region = "left",
      id,
      className = "",
      after = "end",
      separator = false,
    } = opts;

    if (!id) throw new Error("toolbar.createSlot requires an id");

    const existing = slots.get(id);
    if (existing?.element.isConnected) return existing;
    if (existing) existing.remove();

    const regionEl = getRegionEl(region);
    if (!(regionEl instanceof HTMLElement)) {
      throw new Error(`Toolbar region "${region}" is not available`);
    }

    const mount = document.createElement("div");
    mount.className = ["tv-toolbar__slot", className].filter(Boolean).join(" ");
    mount.dataset.toolbarSlot = id;

    /** @type {HTMLElement | null} */
    let sepEl = null;
    if (separator) {
      sepEl = document.createElement("div");
      sepEl.className = "tv-toolbar__sep tv-toolbar__sep--host-slot";
      sepEl.dataset.toolbarSlotSep = id;
      sepEl.setAttribute("aria-hidden", "true");
      insertAfterAnchor(regionEl, sepEl, after);
      sepEl.insertAdjacentElement("afterend", mount);
    } else {
      insertAfterAnchor(regionEl, mount, after);
    }

    const slot = {
      id,
      region,
      element: mount,
      remove() {
        sepEl?.remove();
        mount.remove();
        slots.delete(id);
      },
    };

    slots.set(id, slot);
    return slot;
  }

  /** @param {string} id */
  function getSlot(id) {
    const slot = slots.get(id);
    if (!slot) return null;
    if (!slot.element.isConnected) return null;
    return slot;
  }

  /** @param {string} id */
  function removeSlot(id) {
    slots.get(id)?.remove();
  }

  function destroy() {
    for (const id of [...slots.keys()]) {
      removeSlot(id);
    }
  }

  return {
    createSlot,
    getSlot,
    removeSlot,
    destroy,
  };
}
