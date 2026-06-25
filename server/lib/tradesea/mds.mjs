import crypto from "node:crypto";
import WebSocket from "ws";
import { TRADESEA_DELAYED, TRADESEA_PROD, tradeseaConfig, tradeseaConfigured } from "./config.mjs";
import { tradeseaResolutionSec } from "./resolutions.mjs";

const TRADESEA_ORIGIN = "https://app.tradesea.ai";
const F_CANDLES = 5;
const RESUBSCRIBE_DELAY_MS = 75;

const DEFAULT_CONNECTION_GROUP_ID = crypto
  .createHash("sha256")
  .update("betterweightchart-mds")
  .digest("hex");

/** @type {Map<string, { ws: WebSocket, refs: number, listeners: Set<(bar: object) => void>, useMdsProtocol: boolean, streamSymbol: string, resolution: string }>} */
const liveStreams = new Map();

/** @param {number} time */
function barTimeToSec(time) {
  if (!Number.isFinite(time)) return Math.floor(Date.now() / 1000);
  return time > 1e12 ? Math.floor(time / 1000) : Math.floor(time);
}

/** @param {number} timeSec @param {string} resolution */
function alignBarTimeSec(timeSec, resolution) {
  const barSec = Math.max(1, tradeseaResolutionSec(resolution));
  const sec = barTimeToSec(timeSec);
  return Math.floor(sec / barSec) * barSec;
}

/** @param {import("./types.mjs").TradeseaServerConfig} config */
function connectionGroupId(config) {
  return config.connectionGroupId || DEFAULT_CONNECTION_GROUP_ID;
}

/** @param {string} apiUrl */
function aurenWsOrigin(apiUrl) {
  const parsed = new URL(apiUrl);
  parsed.pathname = parsed.pathname.replace(/\/api\/?$/, "");
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

/** @param {import("./types.mjs").TradeseaServerConfig} config */
function buildMdsWsUrl(config) {
  const groupId = connectionGroupId(config);
  if (config.mode === "auren") {
    const q = new URLSearchParams({
      accountId: config.accountId,
      token: config.aurenJwt,
      connectionGroupId: groupId,
    });
    return {
      url: `${aurenWsOrigin(config.aurenApi)}/tradesea-mds-ws?${q}`,
      useMdsProtocol: true,
      headers: {},
    };
  }

  const mdsBase = config.mdsStreamBase || (config.delayed ? TRADESEA_DELAYED.MDS_STREAM : TRADESEA_PROD.MDS_STREAM);
  const parts = [];
  if (config.accessToken) parts.push(`access_token=${config.accessToken}`);
  if (config.refreshToken) parts.push(`refresh_token=${config.refreshToken}`);
  const cookie = parts.join("; ");
  return {
    url: `${mdsBase.replace(/\/$/, "")}/${encodeURIComponent(config.connectionUserId)}/${groupId}`,
    useMdsProtocol: false,
    headers: {
      Origin: TRADESEA_ORIGIN,
      Referer: `${TRADESEA_ORIGIN}/`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  };
}

function isPingText(text) {
  const trimmed = text.trim();
  if (trimmed === "ping") return true;
  if (!trimmed.startsWith("{")) return false;
  try {
    const json = JSON.parse(trimmed);
    const action = String(json.action || json.op || json.type || json.event || "").toLowerCase();
    return action === "ping";
  } catch {
    return false;
  }
}

function buildPongReply(pingRaw) {
  const text = pingRaw.trim();
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text);
      if (json.action != null || json.op != null) {
        return JSON.stringify({ action: "pong" });
      }
    } catch {
      /* fall through */
    }
  }
  return "pong";
}

/** @param {WebSocket} ws @param {boolean} useMdsProtocol @param {string} streamSymbol @param {string} resolution @param {boolean} subscribe */
function sendCandleControl(ws, useMdsProtocol, streamSymbol, resolution, subscribe) {
  const res = String(resolution);
  if (useMdsProtocol) {
    ws.send(
      JSON.stringify({
        action: subscribe ? "subscribe" : "unsubscribe",
        type: "bar",
        symbols: [streamSymbol],
        resolutions: [res],
      }),
    );
    return;
  }

  ws.send(
    JSON.stringify({
      f: F_CANDLES,
      s: subscribe ? [streamSymbol] : [],
      u: subscribe ? [] : [streamSymbol],
      sr: subscribe ? [res] : [],
      ur: subscribe ? [] : [res],
      l: 0,
    }),
  );
}

/** @param {unknown} obj @param {string} resolution */
function barFromWire(obj, resolution) {
  if (!obj || typeof obj !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (obj);

  if (row.f === F_CANDLES) {
    return {
      time: alignBarTimeSec(Number(row.t), resolution),
      open: Number(row.o),
      high: Number(row.h),
      low: Number(row.l),
      close: Number(row.c),
      volume: row.v != null ? Number(row.v) : undefined,
    };
  }

  const type = String(row.type || "");
  if (type === "bar" || type === "candles") {
    return {
      time: alignBarTimeSec(Number(row.time ?? row.t), resolution),
      open: Number(row.open ?? row.o),
      high: Number(row.high ?? row.h),
      low: Number(row.low ?? row.l),
      close: Number(row.close ?? row.c),
      volume: row.volume != null ? Number(row.volume) : row.v != null ? Number(row.v) : undefined,
    };
  }

  return null;
}

/**
 * @param {string} streamSymbol wire ticker e.g. CME:MNQ
 * @param {string} resolution
 * @param {(bar: object) => void} onBar
 */
export function subscribeTradeseaBars(streamSymbol, resolution, onBar) {
  const config = tradeseaConfig();
  if (!tradeseaConfigured(config)) {
    throw new Error("Tradesea not configured");
  }

  const symbol = String(streamSymbol || "").trim();
  const res = String(resolution || "1");
  const key = `${symbol}|${res}`;
  let stream = liveStreams.get(key);

  if (!stream) {
    const { url, useMdsProtocol, headers } = buildMdsWsUrl(config);
    const ws = new WebSocket(url, { headers });
    stream = {
      ws,
      refs: 0,
      listeners: new Set(),
      useMdsProtocol,
      streamSymbol: symbol,
      resolution: res,
    };
    liveStreams.set(key, stream);

    ws.addEventListener("open", () => {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          sendCandleControl(ws, useMdsProtocol, symbol, res, true);
        }
      }, RESUBSCRIBE_DELAY_MS);
    });

    ws.addEventListener("message", (ev) => {
      const text = String(ev.data || "").trim();
      if (!text) return;
      if (isPingText(text)) {
        try {
          ws.send(buildPongReply(text));
        } catch {
          /* ignore */
        }
        return;
      }

      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        return;
      }

      const bar = barFromWire(obj, res);
      if (!bar || !Number.isFinite(bar.time)) return;
      for (const fn of stream.listeners) fn(bar);
    });

    ws.addEventListener("close", () => {
      liveStreams.delete(key);
    });

    ws.addEventListener("error", (err) => {
      console.warn("[tradesea:mds] websocket error:", err.message || err);
    });
  }

  stream.refs += 1;
  stream.listeners.add(onBar);

  return () => {
    stream.listeners.delete(onBar);
    stream.refs -= 1;
    if (stream.refs <= 0 && stream.listeners.size === 0) {
      try {
        if (stream.ws.readyState === WebSocket.OPEN) {
          sendCandleControl(
            stream.ws,
            stream.useMdsProtocol,
            stream.streamSymbol,
            stream.resolution,
            false,
          );
        }
        stream.ws.close();
      } catch {
        /* ignore */
      }
      liveStreams.delete(key);
    }
  };
}
