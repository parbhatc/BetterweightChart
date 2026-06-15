export const PANE_SYMBOLS_KEY = "tv-pane-symbols";

/** @returns {Record<string, string>} */
export function loadPaneSymbols() {
  try {
    const raw = localStorage.getItem(PANE_SYMBOLS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {string} fallback
 */
export function loadLastSymbol(fallback) {
  const map = loadPaneSymbols();
  return map["0"] || fallback;
}

/**
 * @param {number} paneIndex
 * @param {string} fallback
 */
export function getPaneSymbol(paneIndex, fallback) {
  const map = loadPaneSymbols();
  return map[String(paneIndex)] ?? map["0"] ?? fallback;
}

/** @param {Record<string, string>} map */
function writePaneSymbols(map) {
  try {
    localStorage.setItem(PANE_SYMBOLS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** @param {number} paneIndex @param {string} symbol */
export function savePaneSymbol(paneIndex, symbol) {
  if (!symbol) return;
  const map = loadPaneSymbols();
  map[String(paneIndex)] = symbol;
  if (paneIndex === 0) map["0"] = symbol;
  writePaneSymbols(map);
}

/**
 * @param {Array<{ index: number, symbol: string }>} panes
 */
export function savePaneSymbols(panes) {
  if (!panes.length) return;
  const map = loadPaneSymbols();
  for (const pane of panes) {
    if (!pane.symbol) continue;
    map[String(pane.index)] = pane.symbol;
  }
  if (map["0"] == null && panes[0]?.symbol) map["0"] = panes[0].symbol;
  writePaneSymbols(map);
}
