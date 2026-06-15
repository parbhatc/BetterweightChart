/**
 * Lightweight HTTP client for chart data and config.
 */
export class ChartApi {
  /** @param {string} [baseUrl] */
  constructor(baseUrl = "") {
    this.base = baseUrl.replace(/\/$/, "");
  }

  async #get(path) {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
    return res.json();
  }

  health() {
    return this.#get("/api/health");
  }

  config() {
    return this.#get("/api/v1/config");
  }

  symbols() {
    return this.#get("/api/v1/symbols");
  }

  /**
   * @param {string} symbol
   * @param {{ countback?: number, seed?: number }} [opts]
   */
  bars(symbol, opts = {}) {
    const q = new URLSearchParams({ symbol: String(symbol).toUpperCase() });
    if (opts.countback != null) q.set("countback", String(opts.countback));
    if (opts.seed != null) q.set("seed", String(opts.seed));
    return this.#get(`/api/v1/bars?${q}`);
  }

  /** UDF-style datafeed config (same as createDatafeed().onReady()). */
  datafeedConfig() {
    return this.#get("/datafeed/config");
  }
}

export { createDatafeed, readPageOptions } from "../../datafeed/client.js";
export {
  createCustomDatafeed,
  createStaticDatafeed,
  normalizeBar,
  normalizeBars,
  resolveDatafeed,
} from "../../datafeed/index.js";
export { bootChart } from "../../app/boot/chart.js";
