/**
 * TradingView-compatible order line adapter returned by chart.createOrderLine().
 * @param {import("./OrderLineManager.js").OrderLineManager} manager
 * @param {string} id
 */
export function createOrderLineAdapter(manager, id) {
  /** @type {import("./types.js").OrderLineState} */
  const state = {
    id,
    price: 0,
    text: "",
    quantity: "",
    lineStyle: 0,
    lineLength: 8,
    lineColor: "#089981",
    bodyBackgroundColor: "#089981",
    bodyTextColor: "#ffffff",
    bodyBorderColor: "#000000",
    quantityBackgroundColor: "#089981",
    quantityTextColor: "#ffffff",
    quantityBorderColor: "#000000",
    cancelButtonBorderColor: "#000000",
    cancelButtonIconColor: "#000000",
    cancelTooltip: "",
    removed: false,
    target: null,
    isMoving: false,
  };

  /** @type {import("./types.js").OrderLineHandlers} */
  const handlers = {
    modify: null,
    cancel: null,
    move: null,
    moving: null,
    contextMenu: null,
  };

  const adapter = {
    target: null,
    isMoving: false,

    onModify(fn) {
      handlers.modify = typeof fn === "function" ? fn : null;
      return adapter;
    },
    onCancel(fn) {
      handlers.cancel = typeof fn === "function" ? fn : null;
      return adapter;
    },
    onMove(fn) {
      handlers.move = typeof fn === "function" ? fn : null;
      return adapter;
    },
    onMoving(fn) {
      handlers.moving = typeof fn === "function" ? fn : null;
      return adapter;
    },
    onContextMenu(fn) {
      handlers.contextMenu = typeof fn === "function" ? fn : null;
      return adapter;
    },

    getPrice() {
      return state.price;
    },
    setPrice(price) {
      const p = Number(price);
      if (!Number.isFinite(p)) return adapter;
      state.price = p;
      manager.requestRefresh();
      return adapter;
    },
    setText(text) {
      state.text = String(text ?? "");
      manager.requestRefresh();
      return adapter;
    },
    setQuantity(qty) {
      state.quantity = String(qty ?? "");
      manager.requestRefresh();
      return adapter;
    },
    setLineStyle(style) {
      state.lineStyle = Number(style) || 0;
      manager.requestRefresh();
      return adapter;
    },
    setLineLength(len) {
      state.lineLength = Math.max(1, Number(len) || 8);
      manager.requestRefresh();
      return adapter;
    },
    setLineColor(color) {
      state.lineColor = String(color ?? state.lineColor);
      manager.requestRefresh();
      return adapter;
    },
    setBodyBackgroundColor(color) {
      state.bodyBackgroundColor = String(color ?? state.bodyBackgroundColor);
      manager.requestRefresh();
      return adapter;
    },
    setBodyTextColor(color) {
      state.bodyTextColor = String(color ?? state.bodyTextColor);
      manager.requestRefresh();
      return adapter;
    },
    setBodyBorderColor(color) {
      state.bodyBorderColor = String(color ?? state.bodyBorderColor);
      manager.requestRefresh();
      return adapter;
    },
    setQuantityBackgroundColor(color) {
      state.quantityBackgroundColor = String(color ?? state.quantityBackgroundColor);
      manager.requestRefresh();
      return adapter;
    },
    setQuantityTextColor(color) {
      state.quantityTextColor = String(color ?? state.quantityTextColor);
      manager.requestRefresh();
      return adapter;
    },
    setQuantityBorderColor(color) {
      state.quantityBorderColor = String(color ?? state.quantityBorderColor);
      manager.requestRefresh();
      return adapter;
    },
    setCancelButtonBorderColor(color) {
      state.cancelButtonBorderColor = String(color ?? state.cancelButtonBorderColor);
      manager.requestRefresh();
      return adapter;
    },
    setCancelButtonIconColor(color) {
      state.cancelButtonIconColor = String(color ?? state.cancelButtonIconColor);
      manager.requestRefresh();
      return adapter;
    },
    setCancelTooltip(text) {
      state.cancelTooltip = String(text ?? "");
      return adapter;
    },

    remove() {
      manager.remove(adapter);
      return adapter;
    },
  };

  Object.defineProperty(adapter, "_state", { value: state, enumerable: false });
  Object.defineProperty(adapter, "_handlers", { value: handlers, enumerable: false });

  return adapter;
}
