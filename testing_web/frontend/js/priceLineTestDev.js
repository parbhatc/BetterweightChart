/**
 * Native createPriceLine vs createOrderLine comparison (testing site).
 *
 * Open: http://localhost:3460/testing/?priceLineTest=1
 *
 * Console:
 *   __BWC_PRICE_LINE_TEST__.compare()   — gray price line (top) + green order line (bottom)
 *   __BWC_PRICE_LINE_TEST__.native()    — createPriceLine only
 *   __BWC_PRICE_LINE_TEST__.order()     — createOrderLine only
 *   __BWC_PRICE_LINE_TEST__.clear()
 */

import { LineStyle } from "lightweight-charts";

/** @type {import("lightweight-charts").IPriceLine | null} */
let nativeLine = null;
/** @type {import("lightweight-charts").IOrderLine | null} */
let orderLine = null;

const NATIVE_COLOR = "#9B9B9B";
const ORDER_COLOR = "#089981";

/** @param {object} widget */
function lastClose(widget) {
  const last = widget.getBars().at(-1);
  if (!last) return null;
  const n = Number(last.close);
  return Number.isFinite(n) ? n : null;
}

const COMPARE_OFFSET = 200;

/** @param {number} price @param {string} color */
function priceLineOptions(price, color) {
  return {
    price,
    color,
    lineVisible: true,
    axisLabelVisible: true,
    axisLabelColor: color,
    axisLabelTextColor: "#ffffff",
    lineWidth: 1,
    lineStyle: LineStyle.Dotted,
    title: "Bid",
  };
}

/** @param {number} price */
function orderLineOptions(price) {
  return {
    ...priceLineOptions(price, ORDER_COLOR),
    axisLabelText: price.toFixed(2),
    pills: {
      body: { text: "Limit Buy" },
      quantity: { text: "1", visible: true },
    },
  };
}

/** @param {object} widget */
function clear(widget) {
  if (nativeLine) {
    try {
      widget.series.removePriceLine(nativeLine);
    } catch {
      //
    }
    nativeLine = null;
  }
  if (orderLine) {
    try {
      widget.series.removeOrderLine(orderLine);
    } catch {
      //
    }
    orderLine = null;
  }
}

/**
 * @param {object} widget
 * @param {{ nativePrice?: number, orderPrice?: number }} [opts]
 */
function compare(widget, opts = {}) {
  const base = lastClose(widget);
  if (base == null) {
    console.warn("[BWC:price-line-test] no bars yet");
    return null;
  }

  const nativePrice = opts.nativePrice ?? base + COMPARE_OFFSET;
  const orderPrice = opts.orderPrice ?? base - COMPARE_OFFSET;

  clear(widget);

  nativeLine = widget.series.createPriceLine(priceLineOptions(nativePrice, NATIVE_COLOR));
  orderLine = widget.series.createOrderLine(orderLineOptions(orderPrice));

  const result = {
    nativePrice,
    orderPrice,
    close: base,
    offset: COMPARE_OFFSET,
    note: `Gray = createPriceLine (+${COMPARE_OFFSET}). Green = createOrderLine (-${COMPARE_OFFSET}) from close.`,
  };
  console.info("[BWC:price-line-test] compare", result);
  return result;
}

/** @param {object} widget */
function nativeOnly(widget) {
  const base = lastClose(widget);
  if (base == null) return null;
  clear(widget);
  nativeLine = widget.series.createPriceLine(priceLineOptions(base, NATIVE_COLOR));
  console.info("[BWC:price-line-test] native @", base);
  return base;
}

/** @param {object} widget */
function orderOnly(widget) {
  const base = lastClose(widget);
  if (base == null) return null;
  clear(widget);
  orderLine = widget.series.createOrderLine(orderLineOptions(base));
  console.info("[BWC:price-line-test] order @", base);
  return base;
}

/**
 * @param {object} widget
 * @param {{ auto?: boolean }} [opts]
 */
export function mountPriceLineTestDev(widget, opts = {}) {
  if (typeof window === "undefined") return;

  const api = {
    compare: (o) => compare(widget, o),
    native: () => nativeOnly(widget),
    order: () => orderOnly(widget),
    /** @deprecated use .order() */
    custom: () => orderOnly(widget),
    clear: () => clear(widget),
  };

  window.__BWC_PRICE_LINE_TEST__ = api;

  const run = () => {
    if (lastClose(widget) != null) compare(widget);
  };

  if (opts.auto !== false) {
    widget.onChartReady(() => {
      queueMicrotask(run);
      requestAnimationFrame(run);
    });
  }

  console.info(
    "[BWC:price-line-test] ready — __BWC_PRICE_LINE_TEST__.compare() | .native() | .order() | .clear()",
  );
}
