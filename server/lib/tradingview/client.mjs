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

/** @param {number[]} v */
function barFromTv(v) {
  return {
    time: Math.floor(v[0]),
    open: v[1],
    high: v[2],
    low: v[3],
    close: v[4],
    volume: v[5],
  };
}

/** @param {object} meta */
function symbolInfoFromResolved(tvSymbol, meta) {
  const pricescale = meta.pricescale ?? 100;
  const minmov = meta.minmov ?? 1;
  return {
    name: tvSymbol,
    ticker: tvSymbol,
    description: meta.description ?? meta.short_description ?? tvSymbol,
    type: meta.type ?? "stock",
    exchange: meta.exchange ?? meta.listed_exchange ?? meta.source_id ?? "",
    listed_exchange: meta.listed_exchange ?? meta.source_id ?? "",
    session: meta.session ?? meta["session-display"] ?? "24x7",
    timezone: meta.timezone ?? "Etc/UTC",
    minmov,
    pricescale,
    tick: minmov / pricescale,
    has_intraday: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: ["1", "5", "15", "60", "D"],
    volume_precision: 0,
    data_status: "streaming",
    currency_code: meta.currency_code,
    logoid: meta.logoid ?? meta.logo?.logoid,
    logoUrl: meta.logoid || meta.logo?.logoid ? `https://s3-symbol-logo.tradingview.com/${meta.logoid ?? meta.logo?.logoid}--big.svg` : undefined,
  };
}

const RES_SEC = { "1": 60, "5": 300, "15": 900, "60": 3600, D: 86400 };

function resolutionSec(resolution) {
  return RES_SEC[resolution] ?? 60;
}

/** @param {object[]} series @param {{ time: number }[]} bars */
function mergeSeriesRows(series, bars) {
  for (const row of series) {
    if (!row?.v) continue;
    const bar = barFromTv(row.v);
    const idx = bars.findIndex((b) => b.time === bar.time);
    if (idx >= 0) bars[idx] = bar;
    else bars.push(bar);
  }
  bars.sort((a, b) => a.time - b.time);
}

/**
 * Fetch OHLCV history via TradingView widget websocket (protocol from parbhatc/tradingview).
 * When range.to is set, uses request_more_data to walk backward (range create_series is unreliable).
 * @param {string} tvSymbol e.g. CME_MINI:NQ1!
 * @param {string} resolution e.g. 1, 5, D
 * @param {number} countBack
 * @param {{ from?: number, to?: number } | null} [range]
 */
export function fetchTradingViewBars(tvSymbol, resolution, countBack = 300, range = null) {
  return new Promise((resolve, reject) => {
    const chartSession = randId("cs_");
    const symbolId = "sds_sym_1";
    const symbolNumber = "s1";
    const symbolMainId = "sds_1";
    const beforeTime = range?.to != null ? Math.floor(range.to) : null;
    const maxMore = beforeTime != null ? 8 : 0;

    let settled = false;
    let initialized = false;
    let seriesCreated = false;
    let morePending = false;
    let moreAttempts = 0;
    let lastOldest = null;
    /** @type {object | null} */
    let symbolMeta = null;
    /** @type {{ time: number, open: number, high: number, low: number, close: number, volume?: number }[]} */
    const bars = [];

    const timer = setTimeout(() => finish(new Error("TradingView history timeout")), 30000);

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

    function sortedBars() {
      return [...bars].sort((a, b) => a.time - b.time);
    }

    function completeFetch() {
      let out = sortedBars();
      if (beforeTime != null) {
        out = out.filter((b) => b.time <= beforeTime);
      }
      if (range?.from != null) {
        out = out.filter((b) => b.time >= range.from);
      }
      finish(null, {
        bars: out,
        symbolInfo: symbolInfoFromResolved(tvSymbol, symbolMeta ?? {}),
        noData: out.length === 0,
      });
    }

    function createInitialSeries() {
      if (seriesCreated) return;
      seriesCreated = true;
      send("create_series", [
        chartSession,
        symbolMainId,
        symbolNumber,
        symbolId,
        resolution,
        countBack,
        "",
      ]);
    }

    function maybeRequestMore() {
      if (beforeTime == null) {
        if (bars.length) completeFetch();
        return;
      }
      const sorted = sortedBars();
      if (!sorted.length) {
        finish(new Error("TradingView returned no bars"));
        return;
      }
      const oldest = sorted[0].time;
      if (oldest <= beforeTime) {
        completeFetch();
        return;
      }
      if (morePending || moreAttempts >= maxMore) {
        completeFetch();
        return;
      }
      if (lastOldest != null && oldest >= lastOldest) {
        completeFetch();
        return;
      }
      lastOldest = oldest;
      morePending = true;
      moreAttempts += 1;
      send("request_more_data", [chartSession, symbolNumber, countBack]);
    }

    function onSeriesPayload(series) {
      if (!series.length) return;
      mergeSeriesRows(series, bars);
      morePending = false;
      if (beforeTime != null) {
        maybeRequestMore();
      } else if (series.length > 1 || bars.length >= countBack * 0.5) {
        completeFetch();
      }
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
          const symJson = `=${JSON.stringify({ adjustment: "splits", symbol: tvSymbol })}`;
          send("resolve_symbol", [chartSession, symbolId, symJson]);
          continue;
        }

        switch (msg.m) {
          case "symbol_resolved":
            symbolMeta = msg.p?.[2] ?? null;
            createInitialSeries();
            break;
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
            morePending = false;
            if (beforeTime != null) maybeRequestMore();
            else if (bars.length) completeFetch();
            break;
          case "symbol_error":
            finish(new Error(msg.p?.[2] ?? "Unknown symbol"));
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

    ws.addEventListener("error", () => finish(new Error("TradingView websocket error")));
    ws.addEventListener("close", () => {
      if (!settled) finish(new Error("TradingView websocket closed"));
    });
  });
}

/** @type {Map<string, { ws: WebSocket, refs: number, listeners: Set<(bar: object) => void> }>} */
const liveStreams = new Map();

/**
 * @param {string} tvSymbol
 * @param {string} resolution
 * @param {(bar: object) => void} onBar
 */
export function subscribeTradingViewBars(tvSymbol, resolution, onBar) {
  const key = `${tvSymbol}|${resolution}`;
  let stream = liveStreams.get(key);

  if (!stream) {
    const chartSession = randId("cs_");
    const symbolId = "sds_sym_1";
    const symbolNumber = "s1";
    const symbolMainId = "sds_1";
    const ws = new WebSocket(wsUrl(), { headers: { Origin: WS_ORIGIN } });
    let initialized = false;
    stream = { ws, refs: 0, listeners: new Set() };
    liveStreams.set(key, stream);

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
          send("chart_create_session", [chartSession, ""]);
          const symJson = `=${JSON.stringify({ adjustment: "splits", symbol: tvSymbol })}`;
          send("resolve_symbol", [chartSession, symbolId, symJson]);
          continue;
        }
        if (msg.m === "symbol_resolved") {
          send("create_series", [
            chartSession,
            symbolMainId,
            symbolNumber,
            symbolId,
            resolution,
            2,
            "",
          ]);
          continue;
        }
        if (msg.m !== "du") continue;
        const payload = msg.p?.[1] ?? {};
        const series = payload[symbolMainId]?.s ?? [];
        if (!series[0]?.v) continue;
        const bar = barFromTv(series[0].v);
        for (const fn of stream.listeners) fn(bar);
      }
    });

    ws.addEventListener("close", () => {
      liveStreams.delete(key);
    });
  }

  stream.refs += 1;
  stream.listeners.add(onBar);

  return () => {
    stream.listeners.delete(onBar);
    stream.refs -= 1;
    if (stream.refs <= 0 && stream.listeners.size === 0) {
      try {
        stream.ws.close();
      } catch {
        // ignore
      }
      liveStreams.delete(key);
    }
  };
}
