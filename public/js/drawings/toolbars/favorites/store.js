/** Global user prefs (localStorage) — not stored on chart layouts. */
export const FAV_TOOLS_KEY = "tv-draw-fav-tools";
export const FAV_TOOLBAR_VISIBLE_KEY = "tv-draw-fav-toolbar-visible";
export const FAV_TOOLBAR_POS_KEY = "tv-draw-fav-toolbar-pos";
export const EDIT_TOOLBAR_POS_KEY = "tv-draw-edit-toolbar-pos";
export const MAX_FAVORITE_TOOLS = 20;

/** @returns {string[]} */
export function loadFavoriteTools() {
  try {
    const raw = localStorage.getItem(FAV_TOOLS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** @param {string[]} tools */
export function saveFavoriteTools(tools) {
  localStorage.setItem(FAV_TOOLS_KEY, JSON.stringify(tools.slice(0, MAX_FAVORITE_TOOLS)));
}

/** @returns {boolean} */
export function loadFavoriteToolbarVisible() {
  try {
    return localStorage.getItem(FAV_TOOLBAR_VISIBLE_KEY) === "true";
  } catch {
    return false;
  }
}

/** @param {boolean} visible */
export function saveFavoriteToolbarVisible(visible) {
  localStorage.setItem(FAV_TOOLBAR_VISIBLE_KEY, visible ? "true" : "false");
}

/** @returns {{ left: number, top: number } | null} */
export function loadFavoriteToolbarPos() {
  try {
    const raw = localStorage.getItem(FAV_TOOLBAR_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left === "number" && typeof parsed?.top === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** @param {{ left: number, top: number }} pos */
export function saveFavoriteToolbarPos(pos) {
  localStorage.setItem(FAV_TOOLBAR_POS_KEY, JSON.stringify(pos));
}

/** @returns {{ left: number, top: number } | null} */
export function loadEditToolbarPos() {
  try {
    const raw = localStorage.getItem(EDIT_TOOLBAR_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left === "number" && typeof parsed?.top === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** @param {{ left: number, top: number }} pos */
export function saveEditToolbarPos(pos) {
  localStorage.setItem(EDIT_TOOLBAR_POS_KEY, JSON.stringify(pos));
}

/** @param {string[]} favorites @param {string} id */
export function isFavoriteTool(favorites, id) {
  return favorites.includes(id);
}

/** @param {string[]} favorites @param {string} id */
export function toggleFavoriteTool(favorites, id) {
  if (favorites.includes(id)) {
    const next = favorites.filter((f) => f !== id);
    saveFavoriteTools(next);
    return next;
  }
  const next = [...favorites, id].slice(0, MAX_FAVORITE_TOOLS);
  saveFavoriteTools(next);
  return next;
}
