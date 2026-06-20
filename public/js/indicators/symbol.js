/** @param {number} price @param {object | null | undefined} symbolInfo */
export function formatSymbolPrice(price, symbolInfo) {
  const scale = symbolInfo?.pricescale ?? 100;
  const minmov = symbolInfo?.minmov ?? 1;
  const decimals = Math.max(2, Math.round(Math.log10(scale / minmov)));
  return Number(price).toFixed(decimals);
}

/** @param {object | null | undefined} symbolInfo */
export function tickSizeFromSymbol(symbolInfo) {
  const scale = Number(symbolInfo?.pricescale) || 100;
  const minmov = Number(symbolInfo?.minmov) || 1;
  return minmov / scale;
}
