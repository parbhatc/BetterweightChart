/**
 * Remote market datafeed — search, history, and live stream via server proxy.
 * WebSocket protocol adapted from https://github.com/parbhatc/tradingview
 */

import { normalizeBar } from "../custom.js";

/** @typedef {import("../types.js").Bar} Bar */

/**
 * @param {string} [baseUrl]
 */
export function createTradingViewDatafeed(baseUrl = "/datafeed/tv") {
  const root = baseUrl.replace(/\/$/, "");
  /** @type {Promise<object> | null} */
  let readyPromise = null;
  /** @type {Map<string, EventSource>} */
  const streams = new Map();

  async function getJson(path) {
    const res = await fetch(`${root}${path}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  return {
    onReady() {
      if (!readyPromise) readyPromise = getJson("/config");
      return readyPromise;
    },

    async searchSymbols(userInput, _exchange = "", _symbolType = "", limit = 50) {
      const q = new URLSearchParams({ query: userInput || "", limit: String(limit) });
      return getJson(`/search?${q}`);
    },

    async resolveSymbol(symbolName) {
      const sym = String(symbolName || "").trim();
      const info = await getJson(`/symbols?symbol=${encodeURIComponent(sym)}`);
      if (info.s === "error") throw new Error(info.errmsg || "Unknown symbol");
      return info;
    },

    async getBars(symbolInfo, resolution, periodParams = {}) {
      const q = new URLSearchParams({
        symbol: symbolInfo.ticker || symbolInfo.name,
        resolution,
      });
      if (periodParams.to != null) q.set("to", String(periodParams.to));
      if (periodParams.from != null) q.set("from", String(periodParams.from));
      if (periodParams.countBack != null) q.set("countback", String(periodParams.countBack));

      const data = await getJson(`/history?${q}`);
      if (data.s === "no_data") return { bars: [], noData: true, meta: data.meta };
      if (data.s === "error") return { bars: [], noData: true, meta: data.meta };

      /** @type {Bar[]} */
      const bars = data.t.map((time, i) =>
        normalizeBar({
          time,
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v?.[i],
        }),
      );

      return { bars, meta: data.meta, noData: Boolean(data.meta?.noData) };
    },

    subscribeBars(symbolInfo, resolution, onTick, subscriberUID) {
      const sym = symbolInfo.ticker || symbolInfo.name;
      const q = new URLSearchParams({ symbol: sym, resolution });
      const es = new EventSource(`${root}/stream?${q}`);
      es.onmessage = (ev) => {
        try {
          const bar = normalizeBar(JSON.parse(ev.data));
          onTick(bar);
        } catch {
          // ignore
        }
      };
      streams.set(subscriberUID, es);
    },

    unsubscribeBars(subscriberUID) {
      const es = streams.get(subscriberUID);
      if (es) {
        es.close();
        streams.delete(subscriberUID);
      }
    },
  };
}
