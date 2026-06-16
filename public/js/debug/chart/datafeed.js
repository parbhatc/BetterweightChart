import { chartDebug } from "./index.js";

/**
 * Log TradingView-style datafeed.getBars() requests when debug is on.
 * @param {import("../../datafeed/types.js").Datafeed} datafeed
 */
export function wrapDatafeedDebug(datafeed) {
  if (!datafeed || typeof datafeed.getBars !== "function") return datafeed;

  const origGetBars = datafeed.getBars.bind(datafeed);
  datafeed.getBars = async (symbolInfo, resolution, periodParams = {}) => {
    const symbol =
      symbolInfo?.ticker || symbolInfo?.name || symbolInfo?.full_name || symbolInfo?.symbol || "?";
    chartDebug("data", "getBars request", {
      symbol,
      resolution,
      from: periodParams.from,
      to: periodParams.to,
      countBack: periodParams.countBack,
      firstDataRequest: periodParams.firstDataRequest,
    });
    const result = await origGetBars(symbolInfo, resolution, periodParams);
    chartDebug("data", "getBars result", {
      symbol,
      resolution,
      bars: result?.bars?.length ?? 0,
      noData: Boolean(result?.noData),
      meta: result?.meta,
    });
    return result;
  };

  return datafeed;
}
