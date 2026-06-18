/** @param {string} symbol */
export function symbolTicker(symbol) {
  const raw = String(symbol ?? "");
  const colon = raw.indexOf(":");
  const ticker = colon >= 0 ? raw.slice(colon + 1) : raw;
  return ticker.replace(/!$/, "") || ticker;
}
