/**
 * Console helpers for placing test order lines.
 *
 *   __BWC_TEST_ORDER__.buy()              — limit buy below last price
 *   __BWC_TEST_ORDER__.sell()             — limit sell above last price
 *   __BWC_TEST_ORDER__.buy(123.45)        — buy at explicit price
 *   __BWC_TEST_ORDER__.createDefaultOrderline()
 *   __BWC_TEST_ORDER__.setPillOffset(40)
 *   __BWC_TEST_ORDER__.clear()
 */

/** @type {object[]} */
const activeLines = [];

const DEFAULT_PILL_OFFSET = 20;
const BUY_COLOR = "#089981";
const SELL_COLOR = "#f23645";

/** @param {object[]} bars */
function lastPrice(bars) {
  const last = bars.at(-1);
  if (!last) return null;
  return Number.isFinite(last.close) ? last.close : last.open;
}

function clear() {
  for (const line of activeLines.splice(0)) {
    try {
      line.remove();
    } catch {
      //
    }
  }
}

/**
 * @param {number | { pillOffset?: number } | undefined} offsetOrOpts
 */
function resolvePillOffset(offsetOrOpts) {
  if (typeof offsetOrOpts === "number" && Number.isFinite(offsetOrOpts)) {
    return Math.max(0, offsetOrOpts);
  }
  if (offsetOrOpts && typeof offsetOrOpts === "object" && offsetOrOpts.pillOffset != null) {
    const n = Number(offsetOrOpts.pillOffset);
    return Number.isFinite(n) ? Math.max(0, n) : DEFAULT_PILL_OFFSET;
  }
  return DEFAULT_PILL_OFFSET;
}

/**
 * @param {number} close
 * @param {"buy" | "sell"} side
 */
function defaultTestPrice(close, side) {
  const bump = Math.max(close * 0.002, 0.01);
  return side === "buy" ? close - bump : close + bump;
}

/**
 * @param {object} line
 * @param {"buy" | "sell"} side
 */
function styleOrderLine(line, side) {
  const isBuy = side === "buy";
  const color = isBuy ? BUY_COLOR : SELL_COLOR;
  line
    .setText(isBuy ? "Limit Buy" : "Limit Sell")
    .setQuantity("1")
    .setLineColor(color)
    .setBodyBackgroundColor(color)
    .setQuantityBackgroundColor(color)
    .setBodyTextColor("#ffffff")
    .setQuantityTextColor("#ffffff")
    .setPillSide("right")
    .setCancelTooltip("Cancel order");
  return line;
}

/**
 * @param {object} widget
 * @param {"buy" | "sell"} side
 * @param {number | { pillOffset?: number; price?: number } | undefined} priceOrOpts
 */
async function createTestOrderLine(widget, side, priceOrOpts) {
  const close = lastPrice(widget.getBars());
  if (close == null) {
    console.warn("[BWC:test-order] no bars loaded yet");
    return null;
  }

  let price = defaultTestPrice(close, side);
  let pillOffset = DEFAULT_PILL_OFFSET;
  if (typeof priceOrOpts === "number" && Number.isFinite(priceOrOpts)) {
    price = priceOrOpts;
  } else if (priceOrOpts && typeof priceOrOpts === "object") {
    if (priceOrOpts.price != null && Number.isFinite(Number(priceOrOpts.price))) {
      price = Number(priceOrOpts.price);
    }
    pillOffset = resolvePillOffset(priceOrOpts);
  }

  const line = await widget.chart().createOrderLine();
  if (!line) return null;

  styleOrderLine(line, side)
    .setPrice(price)
    .setPillOffset(pillOffset);

  line.onCancel(() => {
    line.remove();
    const i = activeLines.indexOf(line);
    if (i >= 0) activeLines.splice(i, 1);
  });

  activeLines.push(line);
  console.info(`[BWC:test-order] ${side} @`, price, { pillOffset });
  return line;
}

/**
 * @param {object} widget
 * @param {number | { pillOffset?: number } | undefined} offsetOrOpts
 */
async function createDefaultOrderline(widget, offsetOrOpts) {
  const close = lastPrice(widget.getBars());
  if (close == null) return null;
  return createTestOrderLine(widget, "buy", {
    price: close,
    pillOffset: resolvePillOffset(offsetOrOpts),
  });
}

/** @param {number} offset */
function setPillOffset(offset) {
  const pillOffset = Math.max(0, Number(offset) || 0);
  for (const line of activeLines) {
    line.setPillOffset(pillOffset);
  }
  return pillOffset;
}

/**
 * @param {object} widget
 * @param {{ auto?: boolean }} [opts]
 */
export function mountOrderTestDev(widget, opts = {}) {
  const auto = opts.auto === true;

  const api = {
    buy: (priceOrOpts) => createTestOrderLine(widget, "buy", priceOrOpts),
    sell: (priceOrOpts) => createTestOrderLine(widget, "sell", priceOrOpts),
    createDefaultOrderline: (offsetOrOpts) => createDefaultOrderline(widget, offsetOrOpts),
    setPillOffset: (offset) => setPillOffset(offset),
    clear,
  };

  if (typeof window !== "undefined") {
    window.__BWC_TEST_ORDER__ = api;
  }

  if (auto) {
    widget.onChartReady?.(() => {
      void createDefaultOrderline(widget);
    });
  }

  console.info(
    "[BWC:test-order] .buy() | .sell() | .buy(price) | .sell(price) | .clear()",
  );
  return api;
}
