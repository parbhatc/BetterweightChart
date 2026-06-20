/**
 * TradingView-compatible chart() API for embed hosts (e.g. Auren trade UI).
 *
 * @param {object} opts
 * @param {() => string} opts.getSymbol
 * @param {(sym: string) => void | Promise<void>} opts.setSymbol
 * @param {() => string} opts.getResolution
 * @param {import("./OrderLineManager.js").OrderLineManager} opts.orderLines
 */
export function createTradingViewChartApi(opts) {
  const { getSymbol, setSymbol, getResolution, orderLines } = opts;

  return {
    symbol() {
      return String(getSymbol() ?? "");
    },

    setSymbol(sym, cb) {
      void Promise.resolve(setSymbol(sym)).then(() => {
        if (typeof cb === "function") cb();
      });
    },

    resolution() {
      return String(getResolution() ?? "1");
    },

    createOrderLine() {
      return orderLines.createOrderLine();
    },
  };
}
