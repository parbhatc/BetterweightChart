import {
  isFavorite,
  loadFavorites,
  MAX_FAVORITES,
  saveLastResolution,
  toggleFavorite,
} from "./favorites.js";
import {
  addCustomResolution,
  isCustomResolution,
  loadCustomResolutions,
  removeCustomResolution,
  saveCustomResolutions,
} from "./custom.js";
import { closeAllContextMenus, registerContextMenu } from "../context/registry.js";
import { openCustomIntervalDialog } from "./customDialog.js";
import {
  CHART_RESOLUTION_IDS,
  mergeWithCustomResolutions,
  resolutionDef,
  resolutionDisplayTitle,
  resolutionShortLabel,
} from "../../chart/resolutions.js";

const GROUPS = [
  { id: "ticks", title: "Ticks", match: (id) => /^\d+T$/i.test(id) },
  { id: "seconds", title: "Seconds", match: (id) => /^\d+S$/i.test(id) },
  {
    id: "minutes",
    title: "Minutes",
    match: (id) => {
      if (!/^\d+$/.test(id)) return false;
      const n = Number(id);
      return n < 60 || n % 60 !== 0;
    },
  },
  {
    id: "hours",
    title: "Hours",
    match: (id) => {
      if (!/^\d+$/.test(id)) return false;
      const n = Number(id);
      return n >= 60 && n % 60 === 0;
    },
  },
  { id: "days", title: "Days", match: (id) => ["D", "W", "M"].includes(id) },
];

const BUILTIN_IDS = new Set(CHART_RESOLUTION_IDS);

const STAR_OUTLINE = `<svg viewBox="0 0 18 18" width="16" height="16" fill="none" aria-hidden="true"><path stroke="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z"/></svg>`;
const STAR_FILLED = `<svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 16 8" width="14" height="8" aria-hidden="true"><path fill="currentColor" d="M0 1.475l7.396 6.04.596.485.593-.49L16 1.39 14.807 0 7.393 6.122 8.58 6.12 1.186.08z"/></svg>`;
const PLUS = `<svg viewBox="0 0 28 28" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M13.9 14.1V22h1.2v-7.9H23v-1.2h-7.9V5h-1.2v7.9H6v1.2h7.9Z"/></svg>`;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {Array<{ id: string, label: string }>} opts.resolutions
 * @param {string} opts.initial
 * @param {(resolution: string, label: string) => void} opts.onChange
 * @param {(resolutions: Array<{ id: string, label: string, sec: number }>) => void} [opts.onResolutionsChange]
 */
export function mountTimeframePicker(opts) {
  const { root, resolutions: initialResolutions, initial, onChange, onResolutionsChange } = opts;

  let active = initial;
  /** @type {Array<{ id: string, label: string, sec: number }>} */
  let resolutions = mergeWithCustomResolutions(initialResolutions);
  /** @type {Array<{ id: string, label: string, sec: number }>} */
  let customResolutions = loadCustomResolutions();
  let favorites = loadFavorites(resolutions);
  let panelOpen = false;
  /** @type {Record<string, boolean>} */
  const expanded = Object.fromEntries(GROUPS.map((g) => [g.id, true]));

  const labelOf = (id) => resolutions.find((r) => r.id === id)?.label ?? resolutionShortLabel(id);
  const titleOf = (id) => resolutionDisplayTitle(id);

  root.innerHTML = `<div class="tv-tf__bar">
    <div class="tv-tf__favorites" role="group" aria-label="Favorite timeframes"></div>
    <div class="tv-tf__overflow" hidden></div>
    <div class="tv-tf__menu-wrap">
      <button type="button" class="tv-tf__menu-btn" aria-haspopup="tree" aria-expanded="false" aria-controls="tf-interval-panel" title="All intervals">
        <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true"><path fill="currentColor" d="M1 .75 4 3.75 7 .75"/></svg>
      </button>
    </div>
  </div>`;

  const barEl = root.querySelector(".tv-tf__bar");
  const favEl = root.querySelector(".tv-tf__favorites");
  const overflowEl = root.querySelector(".tv-tf__overflow");
  const menuBtn = root.querySelector(".tv-tf__menu-btn");

  const panel = document.createElement("div");
  panel.className = "tv-tf__panel";
  panel.id = "tf-interval-panel";
  panel.hidden = true;
  panel.setAttribute("role", "treegrid");
  document.body.appendChild(panel);

  if (!barEl || !favEl || !overflowEl || !menuBtn) throw new Error("Timeframe picker markup missing");

  function syncResolutions() {
    resolutions = mergeWithCustomResolutions(initialResolutions, customResolutions);
    onResolutionsChange?.(resolutions);
  }

  function tfBtn(id, isActive) {
    return `<button type="button" class="tv-tf__btn${isActive ? " is-active" : ""}" data-resolution="${id}" title="${titleOf(id)}">${labelOf(id)}</button>`;
  }

  /**
   * @param {{ id: string }} r
   * @param {boolean} removable
   */
  function intervalRow(r, removable) {
    const fav = isFavorite(favorites, r.id);
    const sel = r.id === active;
    return `<div class="tv-tf__interval${sel ? " is-active" : ""}" data-resolution="${r.id}" role="row" aria-selected="${sel}">
      <span class="tv-tf__interval-label" role="gridcell">${titleOf(r.id)}</span>
      <div class="tv-tf__interval-actions">
        ${removable ? `<button type="button" class="tv-tf__remove-btn" data-remove-custom data-resolution="${r.id}" aria-label="Remove custom interval" title="Remove">×</button>` : ""}
        <button type="button" class="tv-tf__fav-btn${fav ? " is-fav" : ""}" data-fav-toggle data-resolution="${r.id}" aria-label="${fav ? "Remove from favorites" : "Add to favorites"}" title="${fav ? "Remove from favorites" : "Add to favorites"}">${fav ? STAR_FILLED : STAR_OUTLINE}</button>
      </div>
    </div>`;
  }

  function addCustomRowHtml() {
    return `<button type="button" class="tv-tf__add-custom" data-open-custom role="row" aria-haspopup="dialog">
      <span class="tv-tf__add-custom-icon">${PLUS}</span>
      <span class="tv-tf__add-custom-label">Add custom interval…</span>
    </button>
    <div class="tv-tf__group-divider" role="separator"></div>`;
  }

  function renderPanel() {
    const parts = GROUPS.map((group) => {
      const items = resolutions.filter((r) => group.match(r.id));
      if (!items.length) return "";
      const open = expanded[group.id];
      return `<div class="tv-tf__group" data-group="${group.id}">
        <button type="button" class="tv-tf__group-head" aria-expanded="${open}" data-group-toggle="${group.id}">
          <span class="tv-tf__group-title">${group.title}</span>
          <span class="tv-tf__group-chev${open ? "" : " is-collapsed"}">${CHEVRON}</span>
        </button>
        <div class="tv-tf__group-body"${open ? "" : " hidden"}>
          ${items.map((r) => intervalRow(r, isCustomResolution(r.id, customResolutions) && !BUILTIN_IDS.has(r.id))).join("")}
        </div>
      </div>`;
    }).filter(Boolean);

    panel.innerHTML = `<div class="tv-tf__panel-scroll">${addCustomRowHtml()}${parts.join('<div class="tv-tf__group-divider" role="separator"></div>')}</div>`;
  }

  /** @type {(() => void) | null} */
  let closeCustomDialog = null;

  function renderFavorites() {
    if (!favorites.length) {
      favEl.innerHTML = tfBtn(active, true);
      overflowEl.hidden = true;
      overflowEl.innerHTML = "";
      return;
    }

    favEl.innerHTML = favorites.map((id) => tfBtn(id, id === active)).join("");

    if (!favorites.includes(active)) {
      overflowEl.hidden = false;
      overflowEl.innerHTML = tfBtn(active, true);
    } else {
      overflowEl.hidden = true;
      overflowEl.innerHTML = "";
    }
  }

  function positionPanel() {
    const rect = root.getBoundingClientRect();
    const pad = 8;
    const gap = 4;
    let top = rect.bottom + gap;
    let left = Math.max(pad, rect.left);
    const maxHeight = Math.max(160, window.innerHeight - top - pad);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.height = "auto";
    panel.style.maxHeight = "";
    const scroll = panel.querySelector(".tv-tf__panel-scroll");
    if (scroll instanceof HTMLElement) {
      scroll.style.maxHeight = `${maxHeight}px`;
    }

    const panelRect = panel.getBoundingClientRect();
    if (panelRect.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - panelRect.width - pad);
      panel.style.left = `${left}px`;
    }

    if (panelRect.bottom > window.innerHeight - pad) {
      const flipTop = rect.top - panelRect.height - gap;
      if (flipTop >= pad) {
        panel.style.top = `${flipTop}px`;
        const flipMax = Math.max(160, rect.top - gap - pad);
        if (scroll instanceof HTMLElement) {
          scroll.style.maxHeight = `${flipMax}px`;
        }
      }
    }
  }

  function closePanel() {
    panelOpen = false;
    panel.hidden = true;
    closeCustomDialog?.();
    closeCustomDialog = null;
    menuBtn.setAttribute("aria-expanded", "false");
    barEl.classList.remove("tv-tf__bar--open");
    root.classList.remove("tv-tf--open");
  }

  function openPanel() {
    closeAllContextMenus();
    renderPanel();
    panel.hidden = false;
    panelOpen = true;
    menuBtn.setAttribute("aria-expanded", "true");
    barEl.classList.add("tv-tf__bar--open");
    root.classList.add("tv-tf--open");
    positionPanel();
  }

  function setActive(resolution) {
    if (resolution === active) {
      closePanel();
      return;
    }
    active = resolution;
    renderFavorites();
    if (panelOpen) renderPanel();
    closePanel();
    saveLastResolution(resolution);
    onChange(resolution, labelOf(resolution));
  }

  function toggleFavoriteId(id) {
    if (!isFavorite(favorites, id) && favorites.length >= MAX_FAVORITES) return;
    favorites = toggleFavorite(favorites, id, resolutions);
    renderFavorites();
    if (panelOpen) renderPanel();
  }

  function openCustomDialog() {
    closeCustomDialog?.();
    closeCustomDialog = openCustomIntervalDialog({
      anchorEl: panel,
      existingIds: resolutions.map((r) => r.id),
      onAdd: ({ id }) => {
        if (resolutions.some((r) => r.id === id)) {
          setActive(id);
          return;
        }
        const def = resolutionDef(id);
        customResolutions = addCustomResolution(customResolutions, def);
        saveCustomResolutions(customResolutions);
        syncResolutions();
        favorites = loadFavorites(resolutions);
        renderPanel();
        positionPanel();
        setActive(id);
      },
      onClose: () => {
        closeCustomDialog = null;
      },
    });
  }

  function removeCustomInterval(id) {
    if (BUILTIN_IDS.has(id)) return;
    customResolutions = removeCustomResolution(customResolutions, id);
    saveCustomResolutions(customResolutions);
    syncResolutions();
    favorites = favorites.filter((f) => f !== id);
    renderFavorites();
    if (panelOpen) renderPanel();
  }

  renderFavorites();

  root.addEventListener("click", (ev) => {
    if (ev.target.closest(".tv-tf__menu-btn")) {
      if (panelOpen) closePanel();
      else openPanel();
      return;
    }
    const favBtn = ev.target.closest("[data-fav-toggle]");
    if (favBtn) {
      ev.stopPropagation();
      toggleFavoriteId(favBtn.dataset.resolution);
      return;
    }
    const btn = ev.target.closest("[data-resolution]");
    if (!btn || btn.closest(".tv-tf__panel")) return;
    setActive(btn.dataset.resolution);
  });

  panel.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-open-custom]")) {
      openCustomDialog();
      return;
    }
    const head = ev.target.closest("[data-group-toggle]");
    if (head) {
      const id = head.dataset.groupToggle;
      expanded[id] = !expanded[id];
      renderPanel();
      return;
    }
    const removeBtn = ev.target.closest("[data-remove-custom]");
    if (removeBtn) {
      ev.stopPropagation();
      removeCustomInterval(removeBtn.dataset.resolution);
      return;
    }
    const favBtn = ev.target.closest("[data-fav-toggle]");
    if (favBtn) {
      ev.stopPropagation();
      toggleFavoriteId(favBtn.dataset.resolution);
      return;
    }
    const row = ev.target.closest("[data-resolution]");
    if (!row) return;
    setActive(row.dataset.resolution);
  });

  window.addEventListener("resize", () => {
    if (panelOpen) positionPanel();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !closeCustomDialog) closePanel();
  });

  registerContextMenu({
    close: () => {
      closeCustomDialog?.();
      closeCustomDialog = null;
      closePanel();
    },
    isOpen: () => panelOpen || Boolean(closeCustomDialog),
    contains: (node) => root.contains(node) || panel.contains(node) || Boolean(node?.closest?.(".tv-tf-dialog-overlay")),
  });

  return {
    getResolution: () => active,
    getFavorites: () => [...favorites],
    getResolutions: () => [...resolutions],
    openPanel,
    setResolution(resolution) {
      setActive(resolution);
    },
    getLabel: () => labelOf(active),
  };
}
