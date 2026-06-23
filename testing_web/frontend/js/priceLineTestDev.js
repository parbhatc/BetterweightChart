/**
 * Native vs custom createPriceLine comparison (testing site).
 *
 * Open: http://localhost:3460/testing/?priceLineTest=1
 *
 * Console:
 *   __BWC_PRICE_LINE_TEST__.compare()   — gray native (top) + blue custom (bottom)
 *   __BWC_PRICE_LINE_TEST__.native()    — native LWC createPriceLine only
 *   __BWC_PRICE_LINE_TEST__.custom()    — createCustomPriceLine only
 *   __BWC_PRICE_LINE_TEST__.clear()
 */

import { LineStyle } from "lightweight-charts";
import { attachCustomPriceLineHost } from "/js/primitives/priceLine/customPriceLine.js";

/** @type {import("lightweight-charts").IPriceLine | null} */
let nativeLine = null;
/** @type {ReturnType<ReturnType<typeof attachCustomPriceLineHost>["createCustomPriceLine"]> | null} */
let customLine = null;
/** @type {ReturnType<typeof attachCustomPriceLineHost> | null} */
let customHost = null;

const NATIVE_COLOR = "#9B9B9B";
const CUSTOM_COLOR = "#2962FF";

/** @param {object} widget */
function lastClose(widget) {
  const last = widget.getBars().at(-1);
  if (!last) return null;
  const n = Number(last.close);
  return Number.isFinite(n) ? n : null;
}

/** Fixed ±offset from last close for side-by-side comparison. */
const COMPARE_OFFSET = 200;

/** @param {object} widget */
function lineOptions(widget, price, color) {
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

/** @param {object} widget */
function ensureHost(widget) {
  if (customHost) return customHost;
  customHost = attachCustomPriceLineHost({
    series: widget.series,
    getContext: () => ({
      scaleId: "right",
      scaleVisible: true,
      reservedAnchors: [],
    }),
  });
  return customHost;
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
  if (customLine) {
    customLine.remove();
    customLine = null;
  }
}

/**
 * @param {object} widget
 * @param {{ nativePrice?: number, customPrice?: number }} [opts]
 */
function compare(widget, opts = {}) {
  const base = lastClose(widget);
  if (base == null) {
    console.warn("[BWC:price-line-test] no bars yet");
    return null;
  }

  const nativePrice = opts.nativePrice ?? base + COMPARE_OFFSET;
  const customPrice = opts.customPrice ?? base - COMPARE_OFFSET;

  clear(widget);

  nativeLine = widget.series.createPriceLine(lineOptions(widget, nativePrice, NATIVE_COLOR));
  customLine = ensureHost(widget).createCustomPriceLine(
    lineOptions(widget, customPrice, CUSTOM_COLOR),
  );

  const result = {
    nativePrice,
    customPrice,
    close: base,
    offset: COMPARE_OFFSET,
    note: `Gray = native (+${COMPARE_OFFSET}). Blue = custom (-${COMPARE_OFFSET}) from close.`,
  };
  console.info("[BWC:price-line-test] compare", result);
  return result;
}

/** @param {object} widget */
function nativeOnly(widget) {
  const base = lastClose(widget);
  if (base == null) return null;
  clear(widget);
  nativeLine = widget.series.createPriceLine(lineOptions(widget, base, NATIVE_COLOR));
  console.info("[BWC:price-line-test] native @", base);
  return base;
}

/** @param {object} widget */
function customOnly(widget) {
  const base = lastClose(widget);
  if (base == null) return null;
  clear(widget);
  customLine = ensureHost(widget).createCustomPriceLine(lineOptions(widget, base, CUSTOM_COLOR));
  console.info("[BWC:price-line-test] custom @", base);
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
    custom: () => customOnly(widget),
    clear: () => clear(widget),
    destroy: () => {
      clear(widget);
      customHost?.destroy();
      customHost = null;
    },
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
    "[BWC:price-line-test] ready — __BWC_PRICE_LINE_TEST__.compare() | .native() | .custom() | .clear()",
  );
}
