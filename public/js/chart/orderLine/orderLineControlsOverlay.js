import {
  measureOrderLineRow,
  orderLineCenterY,
  ORDER_LINE_CANCEL_W,
  ORDER_LINE_FONT,
  ORDER_LINE_FONT_SIZE,
  ORDER_LINE_ROW_H,
} from "./rowLayout.js";

/** @param {import("./types.js").OrderLineState} state */
function controlSignature(state) {
  return [
    state.text,
    state.quantity,
    state.lineColor,
    state.bodyBackgroundColor,
    state.bodyTextColor,
    state.quantityBackgroundColor,
    state.quantityTextColor,
    state.cancelButtonIconColor,
    state.bodyTooltip,
    state.quantityTooltip,
    state.cancelTooltip,
  ].join("\0");
}

/**
 * DOM overlay for interactive order-line controls (tooltip-style pill).
 * Canvas keeps the horizontal line + axis badge; this handles hover, cursor, and clicks.
 * @param {HTMLElement} paneEl
 */
export function createOrderLineControlsOverlay(paneEl) {
  const root = document.createElement("div");
  root.className = "order-line-overlay";
  root.hidden = true;
  paneEl.appendChild(root);

  /** @type {Map<string, HTMLElement>} */
  const nodes = new Map();

  /**
   * @param {Array<{
   *   id: string;
   *   left: number;
   *   y: number;
   *   state: import("./types.js").OrderLineState;
   * }>} entries
   */
  function sync(entries) {
    const seen = new Set();
    for (const entry of entries) {
      seen.add(entry.id);
      let el = nodes.get(entry.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "order-line-control";
        el.dataset.olId = entry.id;
        root.appendChild(el);
        nodes.set(entry.id, el);
      }
      paintControl(el, entry);
    }
    for (const [id, el] of nodes) {
      if (seen.has(id)) continue;
      el.remove();
      nodes.delete(id);
    }
    root.hidden = entries.length === 0;
  }

  /**
   * @param {HTMLElement} el
   * @param {{ id: string; left: number; y: number; state: import("./types.js").OrderLineState }} entry
   */
  function paintControl(el, entry) {
    const { state, left, y } = entry;
    const centerY = orderLineCenterY(y);

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${centerY}px`;
    el.dataset.olId = entry.id;
    el.classList.toggle("order-line-control--moving", Boolean(state.isMoving));

    const signature = controlSignature(state);
    if (el.dataset.olSignature === signature) return;
    el.dataset.olSignature = signature;

    const { bodyText, qtyText, bodyW, qtyW } = measureOrderLineRow(state);
    const accent = state.lineColor || state.bodyBackgroundColor;
    const bodyBg = state.bodyBackgroundColor || accent;
    const qtyBg = state.quantityBackgroundColor || accent;

    el.innerHTML = "";

    const body = document.createElement("button");
    body.type = "button";
    body.className = "order-line-control__segment order-line-control__body";
    body.dataset.olPart = "body";
    body.style.width = `${bodyW}px`;
    body.style.backgroundColor = bodyBg;
    body.style.color = state.bodyTextColor || "#ffffff";
    body.textContent = bodyText;
    body.title = state.bodyTooltip || "Modify order";
    el.appendChild(body);

    if (qtyW) {
      const qty = document.createElement("button");
      qty.type = "button";
      qty.className = "order-line-control__segment order-line-control__qty";
      qty.dataset.olPart = "qty";
      qty.style.width = `${qtyW}px`;
      qty.style.backgroundColor = qtyBg;
      qty.style.color = state.quantityTextColor || "#ffffff";
      qty.textContent = qtyText;
      qty.title = state.quantityTooltip || state.bodyTooltip || "Modify order";
      el.appendChild(qty);
    }

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "order-line-control__segment order-line-control__cancel";
    cancel.dataset.olPart = "cancel";
    cancel.style.width = `${ORDER_LINE_CANCEL_W}px`;
    cancel.style.color = state.cancelButtonIconColor || "rgba(0,0,0,0.55)";
    cancel.setAttribute("aria-label", state.cancelTooltip || "Cancel order");
    cancel.title = state.cancelTooltip || "Cancel order";
    cancel.innerHTML =
      '<span class="order-line-control__cancel-icon" aria-hidden="true"></span>';
    el.appendChild(cancel);
  }

  function destroy() {
    root.remove();
    nodes.clear();
  }

  return { root, sync, destroy };
}

export { ORDER_LINE_ROW_H, ORDER_LINE_CANCEL_W, ORDER_LINE_FONT, ORDER_LINE_FONT_SIZE };
