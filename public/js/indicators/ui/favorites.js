export const INDICATOR_FAV_KEY = "bwc-indicator-favorites";
export const MAX_INDICATOR_FAVORITES = 12;

export const STAR_OUTLINE = `<svg viewBox="0 0 18 18" width="16" height="16" fill="none" aria-hidden="true"><path stroke="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z"/></svg>`;

export const STAR_FILLED = `<svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z"/></svg>`;

/** @returns {string[]} */
export function loadIndicatorFavorites() {
  try {
    const raw = localStorage.getItem(INDICATOR_FAV_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** @param {string[]} favorites */
export function saveIndicatorFavorites(favorites) {
  localStorage.setItem(
    INDICATOR_FAV_KEY,
    JSON.stringify(favorites.slice(0, MAX_INDICATOR_FAVORITES)),
  );
}

/** @param {string[]} favorites @param {string} id */
export function isIndicatorFavorite(favorites, id) {
  return favorites.includes(id);
}

/** @param {string[]} favorites @param {string} id */
export function toggleIndicatorFavorite(favorites, id) {
  if (favorites.includes(id)) {
    const next = favorites.filter((f) => f !== id);
    saveIndicatorFavorites(next);
    return next;
  }
  if (favorites.length >= MAX_INDICATOR_FAVORITES) return favorites;
  const next = [...favorites, id];
  saveIndicatorFavorites(next);
  return next;
}
