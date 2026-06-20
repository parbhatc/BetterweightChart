/**
 * Host-app hooks (Auren trade UI, shortcuts, context menu actions).
 * Register before or after bootChart(); chart menus read these at runtime.
 */

/** @typedef {object} TradeContextHandlers
 * @property {(quantity: number, price: number, time?: number) => void} [onMarketBuy]
 * @property {(quantity: number, price: number, time?: number) => void} [onMarketSell]
 * @property {(quantity: number, limitPrice: number, price: number, time?: number) => void} [onLimitBuy]
 * @property {(quantity: number, stopPrice: number, price: number, time?: number) => void} [onStopSell]
 */

/** @type {TradeContextHandlers | null} */
let tradeContextHandlers = null;

/** @param {TradeContextHandlers} handlers */
export function registerTradeContextActions(handlers) {
  tradeContextHandlers = handlers ?? null;
}

export function clearChartContextActions() {
  tradeContextHandlers = null;
}

/** @returns {TradeContextHandlers | null} */
export function getTradeContextActions() {
  return tradeContextHandlers;
}

/** @returns {boolean} */
export function hasTradeContextActions() {
  if (!tradeContextHandlers) return false;
  const h = tradeContextHandlers;
  return Boolean(h.onMarketBuy || h.onMarketSell || h.onLimitBuy || h.onStopSell);
}
