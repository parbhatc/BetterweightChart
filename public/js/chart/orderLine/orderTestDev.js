/**
 * Dev console alias for position overlay (testing routes only).
 */

import { createPositionOverlay } from "./positionOverlay.js";

/**
 * @param {object} widget
 * @param {{ auto?: boolean }} [opts]
 */
export function mountOrderTestDev(widget, opts = {}) {
  const auto = opts.auto === true;
  const overlay = widget.positionOverlay ?? createPositionOverlay(widget);
  if (!widget.positionOverlay) {
    widget.positionOverlay = overlay;
  }

  const api = {
    buy: (priceOrOpts) => overlay.buy(priceOrOpts),
    sell: (priceOrOpts) => overlay.sell(priceOrOpts),
    buyLimit: (price, opts) => overlay.buyLimit(price, opts),
    sellLimit: (price, opts) => overlay.sellLimit(price, opts),
    setStopLoss: (price) => overlay.setStopLoss(price),
    setTakeProfit: (price) => overlay.setTakeProfit(price),
    clearStopLoss: () => overlay.clearStopLoss(),
    clearTakeProfit: () => overlay.clearTakeProfit(),
    createDefaultOrderline: () => overlay.buy(),
    setPillOffset: (offset) => overlay.setPillOffset(offset),
    setBracketPillOffset: (offset) => overlay.setBracketPillOffset(offset),
    position: () => overlay.getPosition(),
    onStopLossChanged: (cb) => overlay.onStopLossChanged(cb),
    onTakeProfitChanged: (cb) => overlay.onTakeProfitChanged(cb),
    onClose: (cb) => overlay.onClose(cb),
    onOpen: (cb) => overlay.onOpen(cb),
    clear: () => overlay.clear(),
  };

  if (typeof window !== "undefined") {
    window.__BWC_TEST_ORDER__ = api;
  }

  if (auto) {
    widget.onChartReady?.(() => {
      void overlay.buy();
    });
  }

  console.info(
    "[BWC:test-order] use widget.positionOverlay or __BWC_TEST_ORDER__",
  );
  return api;
}
