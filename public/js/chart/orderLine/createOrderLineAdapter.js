import {
  applyNativeOrderLinePatch,
} from "./orderLinePriceLineSync.js";
import {
  formatOrderLinePrice,
  resolveOrderLineFontFamily,
  resolveOrderLineFontSize,
  resolveOrderLineFontWeight,
} from "./rowLayout.js";

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
    bodyBorderColor: "transparent",
    quantityBackgroundColor: "#089981",
    quantityTextColor: "#ffffff",
    quantityBorderColor: "transparent",
    cancelButtonBorderColor: "rgba(0, 0, 0, 0.1)",
    cancelButtonBackgroundColor: "rgba(255, 255, 255, 0.96)",
    cancelButtonIconColor: "rgba(0, 0, 0, 0.55)",
    cancelTooltip: "",
    bodyTooltip: "",
    quantityTooltip: "",
    removed: false,
    target: null,
    isMoving: false,
    pillSide: "right",
    pillOffset: 10,
    lineFullWidth: false,
    bodyFontWeight: 600,
    quantityFontWeight: 600,
    bodyFontSize: 12,
    quantityFontSize: 12,
    bodyFontFamily: "",
    quantityFontFamily: "",
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
      if (typeof fn === "function") {
        handlers.modify = fn;
      } else if (arguments.length >= 2 && typeof arguments[1] === "function") {
        const data = fn;
        const cb = arguments[1];
        handlers.modify = () => cb.call(adapter, data);
      } else {
        handlers.modify = null;
      }
      return adapter;
    },
    onCancel(fn) {
      if (typeof fn === "function") {
        handlers.cancel = fn;
      } else if (arguments.length >= 2 && typeof arguments[1] === "function") {
        const data = fn;
        const cb = arguments[1];
        handlers.cancel = () => cb.call(adapter, data);
      } else {
        handlers.cancel = null;
      }
      return adapter;
    },
    onMove(fn) {
      if (typeof fn === "function") {
        handlers.move = fn;
      } else if (arguments.length >= 2 && typeof arguments[1] === "function") {
        const data = fn;
        const cb = arguments[1];
        handlers.move = () => cb.call(adapter, data);
      } else {
        handlers.move = null;
      }
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
      if (
        !applyNativeOrderLinePatch(state, {
          price: p,
          axisLabelText: formatOrderLinePrice(p),
          pills: { moving: state.isMoving },
        })
      ) {
        manager.requestRefresh();
      }
      return adapter;
    },
    setText(text) {
      state.text = String(text ?? "");
      if (
        !applyNativeOrderLinePatch(state, {
          pills: { body: { text: state.text } },
        })
      ) {
        manager.requestRefresh();
      }
      return adapter;
    },
    setQuantity(qty) {
      state.quantity = String(qty ?? "");
      const qtyText = state.quantity;
      if (
        !applyNativeOrderLinePatch(state, {
          pills: { quantity: { text: qtyText, visible: Boolean(qtyText) } },
        })
      ) {
        manager.requestRefresh();
      }
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
      const c = state.lineColor;
      if (
        !applyNativeOrderLinePatch(state, {
          color: c,
          lineColor: c,
          axisLabelColor: c,
        })
      ) {
        manager.requestRefresh();
      }
      return adapter;
    },
    setBodyBackgroundColor(color) {
      state.bodyBackgroundColor = String(color ?? state.bodyBackgroundColor);
      const c = state.bodyBackgroundColor;
      if (!applyNativeOrderLinePatch(state, { pills: { body: { backgroundColor: c } } })) {
        manager.requestRefresh();
      }
      return adapter;
    },
    setBodyTextColor(color) {
      state.bodyTextColor = String(color ?? state.bodyTextColor);
      const c = state.bodyTextColor;
      if (!applyNativeOrderLinePatch(state, { pills: { body: { textColor: c } } })) {
        manager.requestRefresh();
      }
      return adapter;
    },
    setBodyBorderColor(color) {
      state.bodyBorderColor = String(color ?? state.bodyBorderColor);
      manager.requestRefresh();
      return adapter;
    },
    setQuantityBackgroundColor(color) {
      state.quantityBackgroundColor = String(color ?? state.quantityBackgroundColor);
      const c = state.quantityBackgroundColor;
      if (!applyNativeOrderLinePatch(state, { pills: { quantity: { backgroundColor: c } } })) {
        manager.requestRefresh();
      }
      return adapter;
    },
    setQuantityTextColor(color) {
      state.quantityTextColor = String(color ?? state.quantityTextColor);
      const c = state.quantityTextColor;
      if (!applyNativeOrderLinePatch(state, { pills: { quantity: { textColor: c } } })) {
        manager.requestRefresh();
      }
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
    setCancelButtonBackgroundColor(color) {
      state.cancelButtonBackgroundColor = String(color ?? state.cancelButtonBackgroundColor);
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
      manager.requestRefresh();
      return adapter;
    },
    setBodyTooltip(text) {
      state.bodyTooltip = String(text ?? "");
      manager.requestRefresh();
      return adapter;
    },
    setQuantityTooltip(text) {
      state.quantityTooltip = String(text ?? "");
      manager.requestRefresh();
      return adapter;
    },
    setPillSide(side) {
      state.pillSide = side === "left" ? "left" : "right";
      manager.requestRefresh();
      return adapter;
    },
    getPillSide() {
      return state.pillSide;
    },
    setPillOffset(offset) {
      const n = Number(offset);
      state.pillOffset = Number.isFinite(n) ? Math.max(0, n) : 0;
      manager.requestRefresh();
      return adapter;
    },
    getPillOffset() {
      return state.pillOffset;
    },
    setLineFullWidth(full) {
      state.lineFullWidth = Boolean(full);
      manager.requestRefresh();
      return adapter;
    },
    setBodyFontWeight(weight) {
      state.bodyFontWeight = resolveOrderLineFontWeight(weight);
      manager.requestRefresh();
      return adapter;
    },
    setQuantityFontWeight(weight) {
      state.quantityFontWeight = resolveOrderLineFontWeight(weight);
      manager.requestRefresh();
      return adapter;
    },
    setBodyFontSize(size) {
      state.bodyFontSize = resolveOrderLineFontSize(size);
      manager.requestRefresh();
      return adapter;
    },
    setQuantityFontSize(size) {
      state.quantityFontSize = resolveOrderLineFontSize(size);
      manager.requestRefresh();
      return adapter;
    },
    setBodyFontFamily(family) {
      state.bodyFontFamily = resolveOrderLineFontFamily(family);
      manager.requestRefresh();
      return adapter;
    },
    setQuantityFontFamily(family) {
      state.quantityFontFamily = resolveOrderLineFontFamily(family);
      manager.requestRefresh();
      return adapter;
    },

    /**
     * Single native patch for live PnL ticks (text + profit colors).
     * @param {{ text?: string, quantityText?: string, profit?: boolean, fill?: string, quantityFill?: string, textColor?: string }} appearance
     */
    applyAppearance(appearance) {
      const patch = { pills: {} };
      let changed = false;

      if (appearance.text != null) {
        state.text = String(appearance.text);
        patch.pills.body = { ...(patch.pills.body || {}), text: state.text };
        changed = true;
      }

      if (appearance.quantityText != null) {
        state.quantity = String(appearance.quantityText);
        patch.pills.quantity = {
          ...(patch.pills.quantity || {}),
          text: state.quantity,
          visible: Boolean(state.quantity),
        };
        changed = true;
      }

      if (appearance.fill != null) {
        const fill = String(appearance.fill);
        state.lineColor = fill;
        state.bodyBackgroundColor = fill;
        patch.color = fill;
        patch.pills.body = {
          ...(patch.pills.body || {}),
          backgroundColor: fill,
        };
        changed = true;
      }

      if (appearance.quantityFill != null) {
        const qFill = String(appearance.quantityFill);
        state.quantityBackgroundColor = qFill;
        patch.pills.quantity = {
          ...(patch.pills.quantity || {}),
          backgroundColor: qFill,
        };
        changed = true;
      }

      if (appearance.textColor != null) {
        const textColor = String(appearance.textColor);
        state.bodyTextColor = textColor;
        state.quantityTextColor = textColor;
        patch.pills.body = {
          ...(patch.pills.body || {}),
          textColor,
        };
        patch.pills.quantity = {
          ...(patch.pills.quantity || {}),
          textColor,
        };
        changed = true;
      }

      if (appearance.profit != null && appearance.fill == null) {
        changed = true;
      }

      if (!changed) return adapter;

      if (!applyNativeOrderLinePatch(state, patch)) {
        manager.requestRefresh();
      }
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
