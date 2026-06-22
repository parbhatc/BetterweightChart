import { readPageOptions } from "/js/datafeed/client.js";
import { mountBarTestDev } from "./barTestDev.js";
import { mountOrderTestDev } from "./orderTestDev.js";

/** @param {object} widget */
export function mountTestingHelpers(widget) {
  if (typeof window === "undefined") return;

  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;

  const pageOpts = readPageOptions();
  if (pageOpts.datafeedType === "tradingview" || pageOpts.tradingview) return;

  mountOrderTestDev(widget);
  mountBarTestDev(widget);
}
