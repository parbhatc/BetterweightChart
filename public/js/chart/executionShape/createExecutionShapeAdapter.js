/**
 * TradingView-compatible execution shape (buy/sell arrow at bar).
 * @param {import("./ExecutionShapeManager.js").ExecutionShapeManager} manager
 * @param {string} id
 */
export function createExecutionShapeAdapter(manager, id) {
  /** @type {import("./types.js").ExecutionShapeState} */
  const state = {
    id,
    direction: "buy",
    time: 0,
    price: 0,
    text: "",
    tooltip: "",
    arrowColor: "#22c55e",
    textColor: "rgba(0,0,0,0)",
    arrowHeight: 10,
    arrowSpacing: 2,
    removed: false,
  };

  const adapter = {
    setDirection(direction) {
      const d = String(direction ?? "buy").toLowerCase();
      state.direction = d === "sell" ? "sell" : "buy";
      manager.requestRefresh();
      return adapter;
    },
    setTime(time) {
      // TradingView API: Unix seconds in UTC (see tradeseaExecutions.toChartExecutionTimeSeconds).
      state.time = Number(time) || 0;
      manager.requestRefresh();
      return adapter;
    },
    setPrice(price) {
      state.price = Number(price) || 0;
      manager.requestRefresh();
      return adapter;
    },
    setText(text) {
      state.text = String(text ?? "");
      manager.requestRefresh();
      return adapter;
    },
    setTooltip(tooltip) {
      state.tooltip = String(tooltip ?? "");
      return adapter;
    },
    setArrowColor(color) {
      state.arrowColor = String(color ?? state.arrowColor);
      manager.requestRefresh();
      return adapter;
    },
    setTextColor(color) {
      state.textColor = String(color ?? state.textColor);
      manager.requestRefresh();
      return adapter;
    },
    setArrowHeight(h) {
      state.arrowHeight = Math.max(4, Number(h) || 10);
      manager.requestRefresh();
      return adapter;
    },
    setArrowSpacing(spacing) {
      state.arrowSpacing = Math.max(0, Number(spacing) || 2);
      manager.requestRefresh();
      return adapter;
    },
    remove() {
      manager.remove(adapter);
      return adapter;
    },
  };

  Object.defineProperty(adapter, "_state", { value: state, enumerable: false });
  return adapter;
}
