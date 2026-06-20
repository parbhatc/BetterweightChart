import { listIndicators } from "../catalog.js";
import { mountDialogDrag } from "../../drawings/settings/dialog/utils.js";
import { ICON_CLOSE, ICON_SEARCH, ICON_STAR } from "./icons.js";

const FAV_KEY = "bwc-indicator-favorites";

/** @returns {Set<string>} */
function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/** @param {Set<string>} favs */
function saveFavorites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
}

/**
 * @param {object} opts
 * @param {(defId: string) => void} opts.onSelect
 */
export function createIndicatorsLibraryDialog(opts) {
  const { onSelect } = opts;

  const root = document.createElement("div");
  root.className = "tv-ind-lib";
  root.hidden = true;
  root.innerHTML = `<div class="tv-ind-lib__dialog" role="dialog" aria-modal="true" aria-labelledby="tv-ind-lib-title" data-name="indicators-dialog">
    <div class="tv-ind-lib__header" data-drag-handle>
      <div class="tv-ind-lib__title" id="tv-ind-lib-title">Indicators</div>
      <button type="button" class="tv-ind-lib__close" data-close aria-label="Close menu">${ICON_CLOSE}</button>
    </div>
    <div class="tv-ind-lib__search-wrap">
      <input type="text" class="tv-ind-lib__search" role="searchbox" placeholder="Search" autocomplete="off" data-search />
      <span class="tv-ind-lib__search-icon">${ICON_SEARCH}</span>
    </div>
    <div class="tv-ind-lib__list" role="listbox" data-list></div>
  </div>`;
  document.body.appendChild(root);

  const dialog = root.querySelector(".tv-ind-lib__dialog");
  const searchInput = root.querySelector("[data-search]");
  const listEl = root.querySelector("[data-list]");
  const dragHandle = root.querySelector("[data-drag-handle]");

  if (!(dialog instanceof HTMLElement) || !(searchInput instanceof HTMLInputElement) || !(listEl instanceof HTMLElement)) {
    throw new Error("Indicators library dialog mount failed");
  }
  if (dragHandle instanceof HTMLElement) mountDialogDrag(dialog, dragHandle);

  let favorites = loadFavorites();
  let query = "";
  /** @type {HTMLElement | null} */
  let openAnchor = null;
  /** @type {((ev: Event) => void) | null} */
  let docClickHandler = null;

  function removeDocListener() {
    if (docClickHandler) {
      document.removeEventListener("click", docClickHandler, true);
      docClickHandler = null;
    }
  }

  function position(anchor) {
    const pad = 8;
    const w = 340;
    let left = window.innerWidth / 2 - w / 2;
    let top = 120;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 6;
    }
    dialog.style.width = `${w}px`;
    dialog.style.left = `${Math.max(pad, Math.min(left, window.innerWidth - w - pad))}px`;
    dialog.style.top = `${Math.max(pad, Math.min(top, window.innerHeight - 420))}px`;
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const items = listIndicators().filter((d) => {
      if (!q) return true;
      const title = d.title.toLowerCase();
      const shortTitle = (d.shortTitle || "").toLowerCase();
      return title.includes(q) || shortTitle.includes(q);
    });
    if (!items.length) {
      const message = q ? "No indicators matched your criteria" : "No indicators available";
      const hint = q ? "Try a different search term" : "Check back later for new scripts";
      listEl.innerHTML = `<div class="tv-ind-lib__empty" role="status">
        <div class="tv-ind-lib__empty-icon" aria-hidden="true">${ICON_SEARCH}</div>
        <p class="tv-ind-lib__empty-text">${message}</p>
        <p class="tv-ind-lib__empty-hint">${hint}</p>
      </div>`;
      return;
    }
    listEl.innerHTML = `<div class="tv-ind-lib__section-title">Script name</div>${items
      .map((d) => {
        const fav = favorites.has(d.id);
        return `<button type="button" class="tv-ind-lib__item" role="option" data-id="${d.id}">
          <span class="tv-ind-lib__fav${fav ? " is-active" : ""}" data-fav="${d.id}" role="img" aria-label="${fav ? "Remove from favorites" : "Add to favorites"}" title="${fav ? "Remove from favorites" : "Add to favorites"}">${ICON_STAR}</span>
          <span class="tv-ind-lib__item-title">${d.title}</span>
        </button>`;
      })
      .join("")}`;
  }

  function close() {
    removeDocListener();
    openAnchor = null;
    root.hidden = true;
    searchInput.value = "";
    query = "";
  }

  /** @param {HTMLElement} [anchor] */
  function open(anchor) {
    favorites = loadFavorites();
    renderList();
    openAnchor = anchor ?? null;
    position(anchor);
    root.hidden = false;
    searchInput.focus();
    removeDocListener();
    docClickHandler = (ev) => {
      if (root.hidden) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (root.contains(t)) return;
      if (openAnchor?.contains(t)) return;
      close();
    };
    setTimeout(() => {
      if (docClickHandler) document.addEventListener("click", docClickHandler, true);
    }, 0);
  }

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-close]")) {
      close();
      return;
    }

    const favEl = target.closest("[data-fav]");
    if (favEl instanceof HTMLElement) {
      ev.stopPropagation();
      const id = favEl.dataset.fav;
      if (!id) return;
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      saveFavorites(favorites);
      renderList();
      return;
    }

    const item = target.closest(".tv-ind-lib__item");
    if (item instanceof HTMLElement && item.dataset.id) {
      onSelect(item.dataset.id);
      close();
    }
  });

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    renderList();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !root.hidden) close();
  });

  return { open, close };
}
