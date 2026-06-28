/**
 * Shared order-line / position-overlay colors.
 * Override via bootChart({ orderLineTheme: { ... } }) or widget.setOrderLineTheme({ ... }).
 */

/** @type {{
 *   positionTextColor: string,
 *   bracketTextColor: string,
 *   defaultTextColor: string,
 *   axisLabelTextColor: string,
 * }} */
const DEFAULT_ORDER_LINE_THEME = {
  positionTextColor: "#ffffff",
  bracketTextColor: "#ffffff",
  defaultTextColor: "#ffffff",
  axisLabelTextColor: "#ffffff",
};

/** @type {typeof DEFAULT_ORDER_LINE_THEME} */
let orderLineTheme = { ...DEFAULT_ORDER_LINE_THEME };

/** @returns {typeof DEFAULT_ORDER_LINE_THEME} */
export function getOrderLineTheme() {
  return { ...orderLineTheme };
}

/**
 * @param {Partial<typeof DEFAULT_ORDER_LINE_THEME> | null | undefined} partial
 * @returns {typeof DEFAULT_ORDER_LINE_THEME}
 */
export function setOrderLineTheme(partial) {
  if (!partial || typeof partial !== "object") return getOrderLineTheme();
  orderLineTheme = { ...orderLineTheme, ...partial };
  return getOrderLineTheme();
}

/** @returns {typeof DEFAULT_ORDER_LINE_THEME} */
export function resetOrderLineTheme() {
  orderLineTheme = { ...DEFAULT_ORDER_LINE_THEME };
  return getOrderLineTheme();
}

/** @param {import("./types.js").OrderLineState | null | undefined} state */
export function resolveBodyTextColor(state) {
  const c = state?.bodyTextColor;
  if (c && String(c).trim() && c !== "transparent") return String(c);
  return orderLineTheme.defaultTextColor;
}

/** @param {import("./types.js").OrderLineState | null | undefined} state */
export function resolveQuantityTextColor(state) {
  const c = state?.quantityTextColor;
  if (c && String(c).trim() && c !== "transparent") return String(c);
  return orderLineTheme.defaultTextColor;
}

/**
 * @param {import("./types.js").OrderLineState | null | undefined} state
 * @param {string | undefined} fillColor
 */
export function resolveAxisLabelTextColor(state, fillColor) {
  const fill = String(fillColor || "").toLowerCase();
  if (fill === "#00ff00") return "#000000";
  if (fill === "#ff0000") return orderLineTheme.axisLabelTextColor;
  return resolveBodyTextColor(state);
}

export function getPositionTextColor() {
  return orderLineTheme.positionTextColor;
}

export function getBracketTextColor() {
  return orderLineTheme.bracketTextColor;
}
