/**
 * TradingView UDF-style datafeed for lightweight-charts.
 * Mirrors the Advanced Chart datafeed API surface (onReady, resolveSymbol, getBars, searchSymbols).
 */

/** @typedef {{ time: number, open: number, high: number, low: number, close: number, volume?: number }} Bar */

/**
 * @param {string} [baseUrl]
 */
export function createDatafeed(baseUrl = "/datafeed") {
  const root = baseUrl.replace(/\/$/, "");
  /** @type {Promise<object> | null} */
  let readyPromise = null;

  async function getJson(path) {
    const res = await fetch(`${root}${path}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  return {
    /** @returns {Promise<object>} */
    onReady() {
      if (!readyPromise) readyPromise = getJson("/config");
      return readyPromise;
    },

    /**
     * @param {string} userInput
     * @param {string} [_exchange]
     * @param {string} [_symbolType]
     * @param {number} [limit]
     */
    async searchSymbols(userInput, _exchange = "", _symbolType = "", limit = 25) {
      const q = new URLSearchParams({ query: userInput || "", limit: String(limit) });
      const data = await getJson(`/search?${q}`);
      return data.map((row) => ({
        symbol: row.symbol,
        name: row.description,
        exchange: row.exchange,
        type: row.type,
        ticker: row.ticker,
        full_name: row.full_name,
      }));
    },

    /** @param {string} symbolName */
    async resolveSymbol(symbolName) {
      const sym = String(symbolName || "").toUpperCase();
      const info = await getJson(`/symbols?symbol=${encodeURIComponent(sym)}`);
      if (info.s === "error") throw new Error(info.errmsg || "Unknown symbol");
      return info;
    },

    /**
     * @param {object} symbolInfo
     * @param {string} resolution
     * @param {{ from?: number, to?: number, countBack?: number, firstDataRequest?: boolean }} periodParams
     */
    async getBars(symbolInfo, resolution, periodParams = {}) {
      const q = new URLSearchParams({
        symbol: symbolInfo.ticker || symbolInfo.name,
        resolution,
      });
      if (periodParams.to != null) q.set("to", String(periodParams.to));
      if (periodParams.from != null) q.set("from", String(periodParams.from));
      if (periodParams.countBack != null) q.set("countback", String(periodParams.countBack));

      const data = await getJson(`/history?${q}`);
      if (data.s === "no_data") return { bars: [], noData: true };
      if (data.s === "error") throw new Error(data.errmsg || "History error");

      /** @type {Bar[]} */
      const bars = data.t.map((time, i) => ({
        time,
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v?.[i],
      }));

      return { bars, meta: data.meta };
    },

    subscribeBars() {
      // Fake feed — no live stream.
    },

    unsubscribeBars() {
      //
    },
  };
}

/** @param {string} [search] */
export function readPageOptions(search = window.location.search) {
  const sp = new URLSearchParams(search);
  return {
    symbol: (sp.get("symbol") || "NQ").toUpperCase(),
    theme: sp.get("theme") === "light" ? "light" : "dark",
    resolution: sp.get("resolution") || "1",
    drawings: sp.get("drawings") !== "0",
    chrome: sp.get("chrome") !== "0",
    countBack: sp.get("countback") != null ? Number(sp.get("countback")) : 500,
  };
}
