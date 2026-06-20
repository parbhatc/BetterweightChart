import { packTvHeartbeat, packTvMessage, unpackTvFrames } from "./protocol.mjs";
import {
  barFromTv,
  mergeSeriesRows,
  symbolInfoFromResolved,
} from "./client.mjs";
import {
  isSymbolResolutionSupported,
  resolutionSec,
} from "../resolutions.mjs";

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

/** @param {string} tvSymbol @param {string | null} replaySessionId */
function symConfig(tvSymbol, replaySessionId = null) {
  const base = { adjustment: "splits", session: "extended", symbol: tvSymbol };
  if (replaySessionId) return { replay: replaySessionId, symbol: base };
  return base;
}

/**
 * Fetch OHLCV via TradingView replay session (walks backward when live history is exhausted).
 * @param {string} tvSymbol
 * @param {string} resolution
 * @param {number} countBack
 * @param {{ from?: number, to?: number } | null} [range]
 */
export function fetchTradingViewBarsReplay(tvSymbol, resolution, countBack = 300, range = null) {
  return new Promise((resolve, reject) => {
    const chartSession = randId("cs_");
    const symbolMainId = "sds_1";
    let symbolRequestId = "sds_sym_1";
    let symbolRequestCounter = 1;
    let symbolNumber = "s1";
    const resSec = resolutionSec(resolution);
    const beforeTime = range?.to != null ? Math.floor(range.to) : null;
    const nowSec = Math.floor(Date.now() / 1000);
    const depthToTarget =
      beforeTime != null ? Math.max(0, Math.ceil((nowSec - beforeTime) / resSec)) : 0;
    const seriesCountBack = Math.min(5000, Math.max(countBack, depthToTarget + countBack, 2500));

    let settled = false;
    let initialized = false;
    let seriesCreated = false;
    let replaySessionId = null;
    let replayMessageId = `${randId("", 11)}0`;
    let replayReady = false;
    let lastNoCandles = false;
    /** @type {number | null} */
    let oldStart = null;
    /** @type {object | null} */
    let symbolMeta = null;
    /** @type {{ time: number, open: number, high: number, low: number, close: number, volume?: number }[]} */
    const bars = [];

    const timer = setTimeout(() => finish(new Error("TradingView replay timeout")), 90000);

    const ws = new WebSocket(wsUrl(), { headers: { Origin: WS_ORIGIN } });

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) reject(err);
      else resolve(result);
    }

    function send(type, params) {
      ws.send(packTvMessage({ m: type, p: params }));
    }

    function nextReplayMessageId() {
      const match = replayMessageId.match(/^(.+?)(\d+)$/);
      if (match) replayMessageId = `${match[1]}${Number(match[2]) + 1}`;
      else replayMessageId = `${replayMessageId}_1`;
      return replayMessageId;
    }

    function nextSymbolRequestId() {
      symbolRequestCounter += 1;
      symbolRequestId = `sds_sym_${symbolRequestCounter}`;
      return symbolRequestId;
    }

    function nextSymbolNumber() {
      const match = symbolNumber.match(/^s(\d+)$/);
      symbolNumber = match ? `s${Number(match[1]) + 1}` : "s2";
      return symbolNumber;
    }

    function sortedBars() {
      return [...bars].sort((a, b) => a.time - b.time);
    }

    function completeFetch() {
      const all = sortedBars();
      let out = all;
      if (beforeTime != null) {
        out = all.filter((b) => b.time <= beforeTime);
        if (out.length > countBack) out = out.slice(-countBack);
      } else if (range?.from != null) {
        out = all.filter((b) => b.time >= range.from);
      }
      finish(null, {
        bars: out,
        symbolInfo: symbolInfoFromResolved(tvSymbol, symbolMeta ?? {}),
        noData: out.length === 0,
        meta: { source: "replay", fetched: all.length, oldest: out[0]?.time, newest: out[out.length - 1]?.time },
      });
    }

    function ensureReplaySession() {
      if (replaySessionId) return;
      replaySessionId = `rs_${randId("", 13)}`;
      send("replay_create_session", [replaySessionId]);
    }

    /** @param {number} timestamp */
    function replayStep(timestamp) {
      if (!replaySessionId) return;
      const msgId = nextReplayMessageId();
      send("replay_reset", [replaySessionId, msgId, timestamp]);
      const addId = nextReplayMessageId();
      const cfg = `=${JSON.stringify(symConfig(tvSymbol))}`;
      send("replay_add_series", [replaySessionId, addId, cfg, String(resolution)]);

      const reqId = nextSymbolRequestId();
      const resolveCfg = `=${JSON.stringify(symConfig(tvSymbol, replaySessionId))}`;
      send("resolve_symbol", [chartSession, reqId, resolveCfg]);
      send("modify_series", [
        chartSession,
        symbolMainId,
        nextSymbolNumber(),
        reqId,
        resolution,
        "",
      ]);
      replayReady = true;
    }

    function createInitialSeries() {
      if (seriesCreated) return;
      seriesCreated = true;
      send("create_series", [
        chartSession,
        symbolMainId,
        symbolNumber,
        symbolRequestId,
        resolution,
        seriesCountBack,
        "",
      ]);
    }

    function onSeriesPayload(series) {
      if (!series.length) {
        if (lastNoCandles) {
          completeFetch();
          return;
        }
        lastNoCandles = true;
        return;
      }

      lastNoCandles = false;
      mergeSeriesRows(series, bars);

      const sorted = sortedBars();
      if (beforeTime != null && sorted.length && sorted[0].time <= beforeTime) {
        completeFetch();
        return;
      }

      const first = series[0];
      if (!first?.v) {
        completeFetch();
        return;
      }

      const firstTime = first.v[0];
      if (oldStart === firstTime) {
        completeFetch();
        return;
      }
      oldStart = firstTime;

      ensureReplaySession();
      replayStep(firstTime);
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
          send("chart_create_session", [chartSession, ""]);
          const symJson = `=${JSON.stringify(symConfig(tvSymbol))}`;
          send("resolve_symbol", [chartSession, symbolRequestId, symJson]);
          continue;
        }

        switch (msg.m) {
          case "symbol_resolved": {
            symbolMeta = msg.p?.[2] ?? null;
            const info = symbolInfoFromResolved(tvSymbol, symbolMeta ?? {});
            symbolMeta = { ...symbolMeta, supported_resolutions: info.supported_resolutions };
            if (!isSymbolResolutionSupported(info, resolution)) {
              finish(null, {
                bars: [],
                symbolInfo: info,
                noData: true,
                meta: { source: "replay", reason: "unsupported_resolution" },
              });
              break;
            }
            createInitialSeries();
            break;
          }
          case "timescale_update": {
            const payload = msg.p?.[1] ?? {};
            onSeriesPayload(payload[symbolMainId]?.s ?? []);
            break;
          }
          case "du": {
            const payload = msg.p?.[1] ?? {};
            onSeriesPayload(payload[symbolMainId]?.s ?? []);
            break;
          }
          case "series_completed":
            if (bars.length && !replayReady) completeFetch();
            break;
          case "replay_error":
            if (bars.length) completeFetch();
            else finish(new Error(msg.p?.[1]?.errorCode ?? "replay_error"));
            break;
          case "symbol_error":
            finish(new Error(msg.p?.[2] ?? "Unknown symbol"));
            break;
          case "series_error":
            if (bars.length) completeFetch();
            else
              finish(null, {
                bars: [],
                symbolInfo: symbolInfoFromResolved(tvSymbol, symbolMeta ?? {}),
                noData: true,
                meta: { source: "replay", reason: "series_error" },
              });
            break;
          case "critical_error":
            if (bars.length) completeFetch();
            else finish(new Error("TradingView critical error"));
            break;
          default:
            break;
        }
      }
    });

    ws.addEventListener("error", () => finish(new Error("TradingView replay websocket error")));
    ws.addEventListener("close", () => {
      if (!settled) finish(new Error("TradingView replay websocket closed"));
    });
  });
}
