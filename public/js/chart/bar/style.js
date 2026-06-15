export const TV_UP_RGB = "rgb(8, 153, 129)";
export const TV_DOWN_RGB = "rgb(242, 54, 69)";

/**
 * @param {{ open: number, close: number }} bar
 * @param {{ close: number } | undefined} prevBar
 * @param {boolean} [colorBarsOnPrevClose]
 */
export function isBarUp(bar, prevBar, colorBarsOnPrevClose = false) {
  if (colorBarsOnPrevClose && prevBar) return bar.close >= prevBar.close;
  return bar.close >= bar.open;
}

/** @param {boolean} up */
export function barPriceColor(up) {
  return up ? TV_UP_RGB : TV_DOWN_RGB;
}

/** @param {boolean} up */
export function barPriceClass(up) {
  return up ? "bar-price--up" : "bar-price--down";
}

/**
 * Status line / tooltip price color matching visible candle style.
 * @param {object} [sym]
 * @param {boolean} up
 */
export function candleValueColor(sym, up) {
  const s = sym ?? {};
  if (up) {
    if (s.bodyVisible !== false) return s.bodyUpColor ?? "#089981";
    if (s.wickVisible !== false) return s.wickUpColor ?? "#089981";
    return s.bordersVisible !== false ? s.bordersUpColor ?? "#089981" : TV_UP_RGB;
  }
  if (s.bodyVisible !== false) return s.bodyDownColor ?? "#f23645";
  if (s.wickVisible !== false) return s.wickDownColor ?? "#f23645";
  return s.bordersVisible !== false ? s.bordersDownColor ?? "#f23645" : TV_DOWN_RGB;
}

/**
 * Bar change for status line / tooltips: close vs previous close (TV convention).
 * Falls back to close − open when there is no previous bar.
 * @param {{ open: number, close: number }} bar
 * @param {{ close: number } | undefined} [prevBar]
 */
export function barChangeFromPrevClose(bar, prevBar) {
  const base = prevBar?.close ?? bar.open;
  const change = bar.close - base;
  const pct = base ? (change / base) * 100 : 0;
  return { change, pct, base };
}
