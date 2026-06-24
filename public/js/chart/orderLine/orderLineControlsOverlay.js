import {
  measureOrderLineRow,
  orderLineCenterY,
  ORDER_LINE_CANCEL_W,
  ORDER_LINE_FONT,
  ORDER_LINE_FONT_SIZE,
  ORDER_LINE_ROW_H,
  resolveOrderLineFontFamily,
  resolveOrderLineFontSize,
  resolveOrderLineFontWeight,
} from "./rowLayout.js";
import { hasShellBorder } from "./pillLayout.js";

/** @param {import("./types.js").OrderLineState} state */
function controlSignature(state) {
  return [
    state.text,
    state.quantity,
    state.lineColor,
    state.bodyBackgroundColor,
    state.bodyTextColor,
    state.bodyBorderColor,
    state.quantityBackgroundColor,
    state.quantityTextColor,
    state.quantityBorderColor,
    state.cancelButtonBackgroundColor,
    state.cancelButtonBorderColor,
    state.cancelButtonIconColor,
    state.bodyTooltip,
    state.quantityTooltip,
    state.cancelTooltip,
    state.bodyFontWeight,
    state.quantityFontWeight,
    state.bodyFontSize,
    state.quantityFontSize,
    state.bodyFontFamily,
    state.quantityFontFamily,
  ].join("\0");
}

/** @param {string | undefined} color */
function dividerColor(color) {
  return color && color !== "transparent" ? color : "";
}

/** @param {import("./types.js").OrderLineState} state */
function qtyDividerColor(state) {
  return dividerColor(state.quantityBorderColor) || dividerColor(state.bodyBorderColor);
}

/**
 * @param {Element | null} el
 * @param {string | undefined} color
 * @param {number | undefined} weight
 * @param {number | undefined} size
 * @param {string | undefined} family
 */
function applySegmentTextStyle(el, color, weight, size, family) {
  if (!(el instanceof HTMLElement)) return;
  const fam = resolveOrderLineFontFamily(family);
  const w = resolveOrderLineFontWeight(weight);
  const px = resolveOrderLineFontSize(size);
  // Set sub-properties individually — `button { font: inherit }` in base.css
  // can swallow a partial font shorthand update.
  el.style.fontFamily = fam;
  el.style.fontSize = `${px}px`;
  el.style.fontWeight = String(w);
  el.style.lineHeight = "1";
  el.style.color = color || "#000000";
  el.style.setProperty("-webkit-font-smoothing", "auto");
  el.style.setProperty("-moz-osx-font-smoothing", "auto");
  el.style.setProperty("-webkit-text-stroke", "0.35px currentColor");
  el.style.setProperty("paint-order", "stroke fill");
}

/**
 * DOM overlay for interactive order-line controls (TradingView-style pill).
 * @param {HTMLElement} paneEl
 */
export function createOrderLineControlsOverlay(paneEl) {
  const root = document.createElement("div");
  root.className = "order-line-overlay";
  root.hidden = true;
  paneEl.appendChild(root);

  /** @type {Map<string, HTMLElement>} */
  const nodes = new Map();

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

  function paintControl(el, entry) {
    const { state, left, y } = entry;
    const centerY = orderLineCenterY(y);
    const accent = state.lineColor || state.bodyBackgroundColor;
    const shellBorder = dividerColor(state.bodyBorderColor);

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${centerY}px`;
    el.style.height = `${ORDER_LINE_ROW_H}px`;
    el.dataset.olId = entry.id;
    el.classList.toggle("order-line-control--moving", Boolean(state.isMoving));
    el.classList.toggle("order-line-control--pill-left", state.pillSide === "left");
    el.classList.toggle("order-line-control--tv", hasShellBorder(state));

    const signature = controlSignature(state);
    const prevSignature = el.dataset.olSignature;
    if (prevSignature === signature) {
      const body = el.querySelector(".order-line-control__body");
      const qty = el.querySelector(".order-line-control__qty");
      applySegmentTextStyle(
        body,
        state.bodyTextColor,
        state.bodyFontWeight,
        state.bodyFontSize,
        state.bodyFontFamily,
      );
      applySegmentTextStyle(
        qty,
        state.quantityTextColor,
        state.quantityFontWeight,
        state.quantityFontSize,
        state.quantityFontFamily,
      );
      return;
    }
    el.dataset.olSignature = signature;

    const rawBody = state.text?.trim() || "";
    const { bodyText, qtyText, bodyW, qtyW } = measureOrderLineRow(state);
    const qtyDiv = qtyDividerColor(state);

    if (shellBorder) {
      el.style.border = `1px solid ${shellBorder}`;
      el.style.borderRadius = "2px";
      el.style.boxShadow = "none";
    } else {
      el.style.border = "";
      el.style.borderRadius = "";
      el.style.boxShadow = "";
    }

    el.innerHTML = "";

    const body = document.createElement("button");
    body.type = "button";
    body.className = "order-line-control__segment order-line-control__body";
    body.dataset.olPart = "body";
    body.style.width = `${bodyW}px`;
    body.style.backgroundColor = state.bodyBackgroundColor || accent;
    applySegmentTextStyle(
      body,
      state.bodyTextColor,
      state.bodyFontWeight,
      state.bodyFontSize,
      state.bodyFontFamily,
    );
    body.textContent = bodyText;
    body.title = state.bodyTooltip || "Modify order";
    if (rawBody) el.appendChild(body);

    if (qtyW) {
      const qty = document.createElement("button");
      qty.type = "button";
      qty.className = "order-line-control__segment order-line-control__qty";
      qty.dataset.olPart = "qty";
      qty.style.width = `${qtyW}px`;
      qty.style.backgroundColor = state.quantityBackgroundColor || accent;
      applySegmentTextStyle(
        qty,
        state.quantityTextColor,
        state.quantityFontWeight,
        state.quantityFontSize,
        state.quantityFontFamily,
      );
      if (qtyDiv) {
        qty.style.borderLeft = `1px solid ${qtyDiv}`;
        qty.style.borderRight = `1px solid ${qtyDiv}`;
      }
      qty.textContent = qtyText;
      qty.title = state.quantityTooltip || state.bodyTooltip || "Modify order";
      el.appendChild(qty);
    }

    const cancelBg =
      state.cancelButtonBackgroundColor || "rgba(255, 255, 255, 0.96)";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "order-line-control__segment order-line-control__cancel";
    cancel.dataset.olPart = "cancel";
    cancel.style.width = `${ORDER_LINE_CANCEL_W}px`;
    cancel.style.backgroundColor = cancelBg;
    cancel.style.color = state.cancelButtonIconColor || "#000000";
    cancel.style.border = "0";
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

export {
  ORDER_LINE_ROW_H,
  ORDER_LINE_CANCEL_W,
  ORDER_LINE_FONT,
  ORDER_LINE_FONT_SIZE,
} from "./rowLayout.js";
