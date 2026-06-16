import { chartDebug } from "./index.js";

/**
 * @param {object} detail
 * @param {string} detail.symbol
 * @param {string} [detail.from]
 * @param {number} [detail.paneIndex]
 * @param {boolean} [detail.sync]
 * @param {number} [detail.paneCount]
 */
export function debugSymbolChange(detail) {
  chartDebug("data", "symbol change", detail);
}

/**
 * @param {object} detail
 * @param {string} detail.resolution
 * @param {string} [detail.from]
 * @param {number} [detail.paneIndex]
 * @param {boolean} [detail.sync]
 * @param {number} [detail.paneCount]
 */
export function debugTimeframeChange(detail) {
  chartDebug("data", "timeframe change", detail);
}
