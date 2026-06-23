import { packTvHeartbeat, packTvMessage, unpackTvFrames } from "./protocol.mjs";

const WS_ORIGIN = "https://www.tradingview.com";

function wsUrl() {
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const params = new URLSearchParams({
    from: "embed-widget/tradingview-datafeed/",
    date,
    "page-uri": "charting-library.tradingview-widget.com/",
    "ancestor-origin": "charting-library.tradingview-widget.com",
  });
  return `wss://widgetdata.tradingview.com/socket.io/websocket?${params}`;
}

function randId(prefix, n = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${s}`;
}

/**
 * @param {object} payload
 * @returns {{ symbol: string, bid: number, ask: number, last?: number } | null}
 */
function quoteFromQsdPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const v = payload.v;
  if (!v || typeof v !== "object") return null;
  const bid = Number(v.bid);
  const ask = Number(v.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  const last = Number(v.lp);
  return {
    symbol: String(payload.n ?? ""),
    bid,
    ask,
    last: Number.isFinite(last) ? last : undefined,
  };
}

/** @type {Map<string, { ws: WebSocket, refs: number, listeners: Set<(quote: object) => void> }>} */
const liveQuoteStreams = new Map();

/**
 * @param {string} tvSymbol
 * @param {(quote: { symbol: string, bid: number, ask: number, last?: number }) => void} onQuote
 */
export function subscribeTradingViewQuotes(tvSymbol, onQuote) {
  const key = String(tvSymbol || "").trim();
  if (!key) return () => {};

  let stream = liveQuoteStreams.get(key);
  if (!stream) {
    const quoteSession = randId("qs_");
    const ws = new WebSocket(wsUrl(), { headers: { Origin: WS_ORIGIN } });
    let initialized = false;
    stream = { ws, refs: 0, listeners: new Set() };
    liveQuoteStreams.set(key, stream);

    function send(type, params) {
      ws.send(packTvMessage({ m: type, p: params }));
    }

    ws.addEventListener("message", (ev) => {
      for (const frame of unpackTvFrames(String(ev.data))) {
        if (frame.type === "heartbeat") {
          ws.send(packTvHeartbeat(frame.id));
          continue;
        }
        const msg = frame.data;
        if (!initialized && msg.session_id && msg.protocol) {
          initialized = true;
          send("set_auth_token", ["unauthorized_user_token"]);
          send("set_locale", ["en", "US"]);
          send("quote_create_session", [quoteSession]);
          send("quote_set_fields", [quoteSession, "bid", "ask", "lp", "spread"]);
          send("quote_add_symbols", [quoteSession, key]);
          continue;
        }
        if (msg.m !== "qsd") continue;
        const quote = quoteFromQsdPayload(msg.p?.[1]);
        if (!quote) continue;
        for (const fn of stream.listeners) fn(quote);
      }
    });

    ws.addEventListener("close", () => {
      liveQuoteStreams.delete(key);
    });
  }

  stream.refs += 1;
  stream.listeners.add(onQuote);

  return () => {
    stream.listeners.delete(onQuote);
    stream.refs = Math.max(0, stream.refs - 1);
    if (stream.refs === 0) {
      try {
        stream.ws.close();
      } catch {
        //
      }
      liveQuoteStreams.delete(key);
    }
  };
}

/**
 * @param {string} tvSymbol
 * @param {number} [timeoutMs]
 */
export function fetchTradingViewQuoteSnapshot(tvSymbol, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sym = String(tvSymbol || "").trim();
    if (!sym) {
      reject(new Error("symbol required"));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      reject(new Error("quote timeout"));
    }, timeoutMs);

    const unsub = subscribeTradingViewQuotes(sym, (quote) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(quote);
    });
  });
}
