export const DEFAULT_FAVORITES = ["1", "5", "15", "60", "D"];
export const FAV_STORAGE_KEY = "tv-tf-favorites";
export const LAST_RESOLUTION_KEY = "tv-last-resolution";
export const MAX_FAVORITES = 8;

/** @param {Array<{ id: string }>} resolutions */
export function loadFavorites(resolutions) {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (!raw) return DEFAULT_FAVORITES.filter((id) => resolutions.some((r) => r.id === id));
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) throw new Error("bad");
    return ids.filter((id) => resolutions.some((r) => r.id === id)).slice(0, MAX_FAVORITES);
  } catch {
    return DEFAULT_FAVORITES.filter((id) => resolutions.some((r) => r.id === id));
  }
}

/** @param {string[]} favorites */
export function saveFavorites(favorites) {
  localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favorites.slice(0, MAX_FAVORITES)));
}

/**
 * @param {string} fallback
 * @param {Array<{ id: string }>} [resolutions]
 */
export function loadLastResolution(fallback, resolutions) {
  try {
    const id = localStorage.getItem(LAST_RESOLUTION_KEY);
    if (!id) return fallback;
    if (resolutions?.length && !resolutions.some((r) => r.id === id)) return fallback;
    return id;
  } catch {
    return fallback;
  }
}

/** @param {string} resolution */
export function saveLastResolution(resolution) {
  if (!resolution) return;
  localStorage.setItem(LAST_RESOLUTION_KEY, resolution);
}

/**
 * @param {string[]} favorites
 * @param {string} id
 * @param {Array<{ id: string }>} resolutions
 */
export function toggleFavorite(favorites, id, resolutions) {
  const valid = resolutions.some((r) => r.id === id);
  if (!valid) return favorites;

  if (favorites.includes(id)) {
    const next = favorites.filter((f) => f !== id);
    saveFavorites(next);
    return next;
  }

  const next = [...favorites, id];
  saveFavorites(next);
  return next;
}

/** @param {string[]} favorites @param {string} id */
export function isFavorite(favorites, id) {
  return favorites.includes(id);
}
