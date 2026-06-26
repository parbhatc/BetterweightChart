export const RECENT_STORAGE_KEY = "bwc-symbol-recent";
export const TAB_STORAGE_KEY = "bwc-symbol-search-tab";
export const MAX_RECENT = 40;

/**
 * @typedef {{ symbol: string, meta: object, at: number }} RecentSymbolEntry
 */

/** @returns {RecentSymbolEntry[]} */
export function loadRecentSymbols() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((row) => row && typeof row.symbol === "string" && row.symbol)
      .map((row) => ({
        symbol: row.symbol,
        meta: row.meta && typeof row.meta === "object" ? row.meta : { symbol: row.symbol },
        at: Number(row.at) || 0,
      }))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** @param {RecentSymbolEntry[]} entries */
function writeRecentSymbols(entries) {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

/** @param {string} symbol @param {object} [meta] */
export function addRecentSymbol(symbol, meta = {}) {
  if (!symbol) return;
  const prev = loadRecentSymbols().filter((row) => row.symbol !== symbol);
  const entry = {
    symbol,
    meta: { ...meta, symbol },
    at: Date.now(),
  };
  writeRecentSymbols([entry, ...prev]);
}

/** @param {string} [fallback] */
export function loadSearchTab(fallback = "") {
  try {
    const tab = localStorage.getItem(TAB_STORAGE_KEY);
    return tab == null ? fallback : tab;
  } catch {
    return fallback;
  }
}

/** @param {string} tab */
export function saveSearchTab(tab) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}
