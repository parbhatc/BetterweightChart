import { TF_MAP, TIMEFRAME_FAVORITES_KEY } from "../core/constants.js";

export class TimeframeFavorites {
  /** All supported timeframe keys (stable order) */
  static ALL_TIMEFRAMES = /** @type {(keyof typeof TF_MAP)[]} */ (Object.keys(TF_MAP));

  static VALID_TF = new Set(TimeframeFavorites.ALL_TIMEFRAMES);

  static DEFAULT_FAVORITES = ["1m", "5m", "15m"];

  /**
   * @param {string[]} arr
   * @returns {string[]}
   */
  static normalizeList(arr) {
    const out = [];
    const seen = new Set();
    for (const t of arr) {
      if (TimeframeFavorites.VALID_TF.has(t) && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out.length ? out : [...TimeframeFavorites.DEFAULT_FAVORITES];
  }

  /** @returns {string[]} */
  static load() {
    try {
      const raw = localStorage.getItem(TIMEFRAME_FAVORITES_KEY);
      if (typeof raw !== "string") return [...TimeframeFavorites.DEFAULT_FAVORITES];
      const j = JSON.parse(raw);
      if (!Array.isArray(j)) return [...TimeframeFavorites.DEFAULT_FAVORITES];
      return TimeframeFavorites.normalizeList(j);
    } catch {
      return [...TimeframeFavorites.DEFAULT_FAVORITES];
    }
  }

  /** @param {string[]} favs */
  static save(favs) {
    try {
      localStorage.setItem(TIMEFRAME_FAVORITES_KEY, JSON.stringify(TimeframeFavorites.normalizeList(favs)));
    } catch {
      //
    }
  }

  /**
   * @param {string} tf
   * @param {string[]} favorites
   * @returns {string[]}
   */
  static toggleStar(tf, favorites) {
    if (!TimeframeFavorites.VALID_TF.has(tf)) return favorites;
    const i = favorites.indexOf(tf);
    if (i !== -1) {
      const next = favorites.filter((t) => t !== tf);
      return next.length ? next : [...TimeframeFavorites.DEFAULT_FAVORITES];
    }
    return [...favorites, tf];
  }
}

export const ALL_TIMEFRAMES = TimeframeFavorites.ALL_TIMEFRAMES;
export const VALID_TF = TimeframeFavorites.VALID_TF;
export const loadTfFavorites = () => TimeframeFavorites.load();
export const saveTfFavorites = (favs) => TimeframeFavorites.save(favs);
export const toggleTfStar = (tf, favorites) => TimeframeFavorites.toggleStar(tf, favorites);
