import { listIndicators } from "../catalog.js";
import { ICON_CLEAR, ICON_CLOSE, ICON_SEARCH } from "./icons.js";
import {
  loadIndicatorFavorites,
  toggleIndicatorFavorite,
  isIndicatorFavorite,
  STAR_FILLED,
  STAR_OUTLINE,
} from "./favorites.js";

/**
 * @param {object} opts
 * @param {(defId: string) => void} opts.onSelect
 * @param {() => void} [opts.onFavoritesChange]
 */
export function createIndicatorsLibraryDialog(opts) {
  const { onSelect, onFavoritesChange } = opts;

  const root = document.createElement("div");
  root.className = "tv-ind-lib";
  root.hidden = true;
  root.innerHTML = `<div class="tv-ind-lib__backdrop" data-backdrop></div>
<div class="tv-ind-lib__dialog" role="dialog" aria-modal="true" aria-labelledby="tv-ind-lib-title" data-name="indicators-dialog">
  <div class="tv-ind-lib__header">
    <h2 class="tv-ind-lib__title" id="tv-ind-lib-title">Indicators</h2>
    <button type="button" class="tv-ind-lib__close" data-close aria-label="Close menu">${ICON_CLOSE}</button>
  </div>
  <div class="tv-ind-lib__search-wrap">
    <span class="tv-ind-lib__search-icon">${ICON_SEARCH}</span>
    <input type="text" class="tv-ind-lib__search" role="searchbox" placeholder="Search indicators" autocomplete="off" data-search />
    <div class="tv-ind-lib__search-actions">
      <button type="button" class="tv-ind-lib__fav-filter" data-fav-filter aria-pressed="false" aria-label="Show favorites only" title="Favorites">${STAR_OUTLINE}</button>
      <button type="button" class="tv-ind-lib__clear" data-clear aria-label="Clear" title="Clear" hidden>${ICON_CLEAR}</button>
    </div>
  </div>
  <div class="tv-ind-lib__body">
    <div class="tv-ind-lib__list" role="listbox" data-list></div>
  </div>
  <div class="tv-ind-lib__footer">Select an indicator to add it to your chart</div>
</div>`;
  document.body.appendChild(root);

  const searchInput = root.querySelector("[data-search]");
  const listEl = root.querySelector("[data-list]");
  const clearBtn = root.querySelector("[data-clear]");
  const favFilterBtn = root.querySelector("[data-fav-filter]");

  if (!(searchInput instanceof HTMLInputElement) || !(listEl instanceof HTMLElement)) {
    throw new Error("Indicators library dialog mount failed");
  }

  let favorites = loadIndicatorFavorites();
  let query = "";
  let favoritesOnly = false;
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

  function syncClearButton() {
    if (!(clearBtn instanceof HTMLButtonElement)) return;
    clearBtn.hidden = !searchInput.value.trim();
  }

  function syncFavFilterButton() {
    if (!(favFilterBtn instanceof HTMLButtonElement)) return;
    favFilterBtn.setAttribute("aria-pressed", favoritesOnly ? "true" : "false");
    favFilterBtn.classList.toggle("is-active", favoritesOnly);
    favFilterBtn.innerHTML = favoritesOnly ? STAR_FILLED : STAR_OUTLINE;
    favFilterBtn.title = favoritesOnly ? "Show all indicators" : "Show favorites only";
    favFilterBtn.setAttribute(
      "aria-label",
      favoritesOnly ? "Show all indicators" : "Show favorites only",
    );
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const items = listIndicators().filter((d) => {
      if (favoritesOnly && !isIndicatorFavorite(favorites, d.id)) return false;
      if (!q) return true;
      const title = d.title.toLowerCase();
      const shortTitle = (d.shortTitle || "").toLowerCase();
      return title.includes(q) || shortTitle.includes(q);
    });
    if (!items.length) {
      const message = favoritesOnly
        ? q
          ? "No favorite indicators matched your criteria"
          : "No favorite indicators yet"
        : q
          ? "No indicators matched your criteria"
          : "No indicators available";
      const hint = favoritesOnly
        ? q
          ? "Try a different search term"
          : "Star indicators to add them here"
        : q
          ? "Try a different search term"
          : "Check back later for new scripts";
      listEl.innerHTML = `<div class="tv-ind-lib__empty" role="status">
        <div class="tv-ind-lib__empty-icon" aria-hidden="true">${ICON_SEARCH}</div>
        <p class="tv-ind-lib__empty-text">${message}</p>
        <p class="tv-ind-lib__empty-hint">${hint}</p>
      </div>`;
      return;
    }
    listEl.innerHTML = `<div class="tv-ind-lib__section-title">${favoritesOnly ? "Favorites" : "Script name"}</div>${items
      .map((d) => {
        const fav = isIndicatorFavorite(favorites, d.id);
        return `<div class="tv-ind-lib__item" role="option" data-id="${d.id}" tabindex="0">
          <span class="tv-ind-lib__item-title">${d.title}</span>
          <div class="tv-ind-lib__item-actions">
            <button type="button" class="tv-ind-lib__fav-btn${fav ? " is-fav" : ""}" data-fav-toggle data-id="${d.id}" aria-label="${fav ? "Remove from favorites" : "Add to favorites"}" title="${fav ? "Remove from favorites" : "Add to favorites"}">${fav ? STAR_FILLED : STAR_OUTLINE}</button>
          </div>
        </div>`;
      })
      .join("")}`;
  }

  function close() {
    removeDocListener();
    openAnchor = null;
    root.hidden = true;
    document.body.classList.remove("tv-ind-lib-open");
    searchInput.value = "";
    query = "";
    favoritesOnly = false;
    syncClearButton();
    syncFavFilterButton();
  }

  /** @param {HTMLElement} [anchor] */
  function open(anchor) {
    favorites = loadIndicatorFavorites();
    syncFavFilterButton();
    renderList();
    openAnchor = anchor ?? null;
    root.hidden = false;
    document.body.classList.add("tv-ind-lib-open");
    searchInput.value = "";
    query = "";
    syncClearButton();
    requestAnimationFrame(() => searchInput.focus());
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

    if (target.closest("[data-close], [data-backdrop]")) {
      close();
      return;
    }

    if (target.closest("[data-fav-filter]")) {
      favoritesOnly = !favoritesOnly;
      syncFavFilterButton();
      renderList();
      return;
    }

    const favBtn = target.closest("[data-fav-toggle]");
    if (favBtn instanceof HTMLElement) {
      ev.stopPropagation();
      const id = favBtn.dataset.id;
      if (!id) return;
      favorites = toggleIndicatorFavorite(favorites, id);
      renderList();
      onFavoritesChange?.();
      return;
    }

    const item = target.closest(".tv-ind-lib__item");
    if (item instanceof HTMLElement && item.dataset.id) {
      onSelect(item.dataset.id);
      close();
    }
  });

  listEl.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const item = ev.target instanceof Element ? ev.target.closest(".tv-ind-lib__item") : null;
    if (!(item instanceof HTMLElement) || !item.dataset.id) return;
    if (ev.target instanceof Element && ev.target.closest("[data-fav-toggle]")) return;
    ev.preventDefault();
    onSelect(item.dataset.id);
    close();
  });

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    syncClearButton();
    renderList();
  });

  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      openAnchor?.focus?.();
    }
  });

  if (clearBtn instanceof HTMLButtonElement) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      query = "";
      syncClearButton();
      searchInput.focus();
      renderList();
    });
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !root.hidden) {
      close();
      openAnchor?.focus?.();
    }
  });

  return { open, close };
}
