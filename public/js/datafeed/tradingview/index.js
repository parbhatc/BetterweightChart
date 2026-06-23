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

  /** @type {Map<string, EventSource>} */
  const quoteStreams = new Map();
  let quotesSupported = false;

  async function ensureQuotesSupported() {
    if (quotesSupported) return true;
    try {
      const cfg = await (readyPromise ?? getJson("/config"));
      quotesSupported = Boolean(cfg?.supports_quotes);
    } catch {
      quotesSupported = false;
    }
    return quotesSupported;
  }

  return {
    get supportsQuotes() {
      return quotesSupported;
    },

    onReady() {
      if (!readyPromise) {
        readyPromise = getJson("/config").then((cfg) => {
          quotesSupported = Boolean(cfg?.supports_quotes);
          return cfg;
        });
      }
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

    async getQuotes(symbolInfos) {
      if (!(await ensureQuotesSupported())) return [];
      const list = Array.isArray(symbolInfos) ? symbolInfos : [symbolInfos];
      const out = [];
      for (const info of list) {
        const sym = info.ticker || info.name;
        if (!sym) continue;
        try {
          const data = await getJson(`/quotes?symbol=${encodeURIComponent(sym)}&snapshot=1`);
          if (data.s === "ok" && data.bid != null && data.ask != null) {
            out.push({
              s: "ok",
              n: sym,
              v: { bid: data.bid, ask: data.ask, lp: data.last },
            });
          }
        } catch {
          // skip
        }
      }
      return out;
    },

    subscribeQuotes(symbolInfos, onQuotes, subscriberUID) {
      void ensureQuotesSupported().then((ok) => {
        if (!ok) return;
        const list = Array.isArray(symbolInfos) ? symbolInfos : [symbolInfos];
        const info = list[0];
        const sym = info?.ticker || info?.name;
        if (!sym) return;
        const q = new URLSearchParams({ symbol: sym });
        const es = new EventSource(`${root}/quotes?${q}`);
        es.onmessage = (ev) => {
          try {
            const quote = JSON.parse(ev.data);
            if (quote?.bid == null || quote?.ask == null) return;
            onQuotes([
              {
                s: "ok",
                n: quote.symbol || sym,
                v: { bid: quote.bid, ask: quote.ask, lp: quote.last },
              },
            ]);
          } catch {
            // ignore
          }
        };
        quoteStreams.set(subscriberUID, es);
      });
    },

    unsubscribeQuotes(subscriberUID) {
      const es = quoteStreams.get(subscriberUID);
      if (es) {
        es.close();
        quoteStreams.delete(subscriberUID);
      }
    },
  };
}
