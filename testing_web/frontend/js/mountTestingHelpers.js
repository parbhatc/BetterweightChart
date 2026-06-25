import { readPageOptions } from "/js/datafeed/client.js";
import { mountBarTestDev } from "./barTestDev.js";
import { mountOrderTestDev } from "./orderTestDev.js";
import { mountPriceLineTestDev } from "./priceLineTestDev.js";

/** @param {object} widget */
export function mountTestingHelpers(widget) {
  if (typeof window === "undefined") return;

  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;

  const pageOpts = readPageOptions();
  const priceLineTest =
    pageOpts.priceLineTest === true ||
    new URLSearchParams(window.location.search).get("priceLineTest") === "1";

  if (priceLineTest) {
    mountPriceLineTestDev(widget);
    return;
  }

  if (pageOpts.datafeedType === "tradingview" || pageOpts.tradingview) return;

  mountOrderTestDev(widget, { auto: true });
  mountBarTestDev(widget);
}
