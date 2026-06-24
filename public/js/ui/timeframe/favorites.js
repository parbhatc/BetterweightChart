import { resolutionSec } from "../../chart/resolutions.js";

export const FAV_STORAGE_KEY = "tv-tf-favorites";
export const LAST_RESOLUTION_KEY = "tv-last-resolution";
export const MAX_FAVORITES = 8;

/** Default favorite bar order when none are saved yet. */
export const DEFAULT_FAVORITES = ["30S", "1", "5", "15", "60"];

/**
 * @param {string[]} ids
 * @param {Array<{ id: string }>} resolutions
 */
function normalizeFavorites(ids, resolutions) {
  const allowed = new Set(resolutions.map((r) => r.id));
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out
    .sort((a, b) => {
      const da = resolutionSec(a);
      const db = resolutionSec(b);
      if (da !== db) return da - db;
      return String(a).localeCompare(String(b));
    })
    .slice(0, MAX_FAVORITES);
}

/**
 * @param {Array<{ id: string }>} resolutions
 * @returns {string[]}
 */
function defaultFavorites(resolutions) {
  return normalizeFavorites(DEFAULT_FAVORITES, resolutions);
}

/** @param {Array<{ id: string }>} resolutions */
export function loadFavorites(resolutions) {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (!raw) return defaultFavorites(resolutions);
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) throw new Error("bad");
    const next = normalizeFavorites(ids, resolutions);
    return next.length ? next : defaultFavorites(resolutions);
  } catch {
    return defaultFavorites(resolutions);
  }
}

/** @param {string[]} favorites @param {Array<{ id: string }>} resolutions */
function persistFavorites(favorites, resolutions) {
  const next = normalizeFavorites(favorites, resolutions);
  localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next));
  return next;
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
    return persistFavorites(next, resolutions);
  }

  return persistFavorites([...favorites, id], resolutions);
}

/** @param {string[]} favorites @param {string} id */
export function isFavorite(favorites, id) {
  return favorites.includes(id);
}
