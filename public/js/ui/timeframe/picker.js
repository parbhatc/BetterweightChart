import {
  isFavorite,
  loadFavorites,
  MAX_FAVORITES,
  saveLastResolution,
  toggleFavorite,
} from "./favorites.js";
import { closeAllContextMenus, registerContextMenu } from "../context/registry.js";

const GROUPS = [
  { id: "minutes", title: "Minutes", match: (id) => ["1", "3", "5", "15", "30"].includes(id) },
  { id: "hours", title: "Hours", match: (id) => ["60", "240"].includes(id) },
  { id: "days", title: "Days", match: (id) => ["D", "W"].includes(id) },
];

const DISPLAY = {
  1: "1 minute",
  3: "3 minutes",
  5: "5 minutes",
  15: "15 minutes",
  30: "30 minutes",
  60: "1 hour",
  240: "4 hours",
  D: "1 day",
  W: "1 week",
};

const STAR_OUTLINE = `<svg viewBox="0 0 18 18" width="16" height="16" fill="none" aria-hidden="true"><path stroke="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z"/></svg>`;
const STAR_FILLED = `<svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="m4.67 10.62.66.76L9 8.16l3.67 3.22.66-.76L9 6.84l-4.33 3.78Z"/></svg>`;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {Array<{ id: string, label: string }>} opts.resolutions
 * @param {string} opts.initial
 * @param {(resolution: string, label: string) => void} opts.onChange
 */
export function mountTimeframePicker(opts) {
  const { root, resolutions, initial, onChange } = opts;

  let active = initial;
  let favorites = loadFavorites(resolutions);
  let panelOpen = false;
  /** @type {Record<string, boolean>} */
  const expanded = Object.fromEntries(GROUPS.map((g) => [g.id, true]));

  const labelOf = (id) => resolutions.find((r) => r.id === id)?.label ?? id;
  const titleOf = (id) => DISPLAY[id] ?? labelOf(id);

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

  function tfBtn(id, isActive) {
    return `<button type="button" class="tv-tf__btn${isActive ? " is-active" : ""}" data-resolution="${id}" title="${titleOf(id)}">${labelOf(id)}</button>`;
  }

  function intervalRow(r) {
    const fav = isFavorite(favorites, r.id);
    const sel = r.id === active;
    return `<div class="tv-tf__interval${sel ? " is-active" : ""}" data-resolution="${r.id}" role="row" aria-selected="${sel}">
      <span class="tv-tf__interval-label" role="gridcell">${titleOf(r.id)}</span>
      <button type="button" class="tv-tf__fav-btn${fav ? " is-fav" : ""}" data-fav-toggle data-resolution="${r.id}" aria-label="${fav ? "Remove from favorites" : "Add to favorites"}" title="${fav ? "Remove from favorites" : "Add to favorites"}">${fav ? STAR_FILLED : STAR_OUTLINE}</button>
    </div>`;
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
          ${items.map(intervalRow).join("")}
        </div>
      </div>`;
    }).filter(Boolean);

    panel.innerHTML = `<div class="tv-tf__panel-scroll">${parts.join('<div class="tv-tf__group-divider" role="separator"></div>')}</div>`;
  }

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
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${Math.max(pad, rect.left)}px`;
    panel.style.maxHeight = `${Math.min(window.innerHeight * 0.75, window.innerHeight - rect.bottom - pad)}px`;
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.right > window.innerWidth - pad) {
      panel.style.left = `${window.innerWidth - panelRect.width - pad}px`;
    }
  }

  function closePanel() {
    panelOpen = false;
    panel.hidden = true;
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
    const head = ev.target.closest("[data-group-toggle]");
    if (head) {
      const id = head.dataset.groupToggle;
      expanded[id] = !expanded[id];
      renderPanel();
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
    if (ev.key === "Escape") closePanel();
  });

  registerContextMenu({
    close: closePanel,
    isOpen: () => panelOpen,
    contains: (node) => root.contains(node) || panel.contains(node),
  });

  return {
    getResolution: () => active,
    getFavorites: () => [...favorites],
    setResolution(resolution) {
      setActive(resolution);
    },
    getLabel: () => labelOf(active),
  };
}
