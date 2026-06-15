export { createDatafeed, readPageOptions } from "./client.js";
export { createCustomDatafeed, createStaticDatafeed, normalizeBar, normalizeBars } from "./custom.js";
export { createSimpleDatafeed } from "./simple.js";
export { createTradingViewDatafeed } from "./tradingview/index.js";

import { createDatafeed } from "./client.js";
import { createStaticDatafeed } from "./custom.js";
import { createTradingViewDatafeed } from "./tradingview/index.js";

/**
 * Pick a datafeed from boot options: custom instance, static bars, or HTTP UDF.
 * @param {object} [options]
 * @param {import("./types.js").Datafeed} [options.datafeed]
 * @param {import("./types.js").Bar[]} [options.bars]
 * @param {Record<string, import("./types.js").Bar[]>} [options.symbols]
 * @param {string} [options.datafeedUrl]
 */
export function resolveDatafeed(options = {}) {
  if (options.datafeed) return options.datafeed;
  if (options.datafeedType === "tradingview" || options.tradingview) {
    return createTradingViewDatafeed(options.datafeedUrl ?? "/datafeed/tv");
  }
  if (options.bars?.length || options.symbols) {
    return createStaticDatafeed({
      symbol: options.symbol,
      name: options.symbolName,
      bars: options.bars,
      symbols: options.symbols,
      tick: options.tick,
      exchange: options.exchange,
      type: options.symbolType,
      timezone: options.timezone,
      resolutions: options.resolutions,
    });
  }
  return createDatafeed(options.datafeedUrl ?? "/datafeed");
}
