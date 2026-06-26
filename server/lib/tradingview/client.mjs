import { packTvHeartbeat, packTvMessage, unpackTvFrames } from "./protocol.mjs";
import {
  isSymbolResolutionSupported,
  resolutionSec,
  supportedResolutionsForSymbol,
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

/** Default delay for the free TradingView widget datafeed. */
const TRADINGVIEW_DATA_DELAY_MINUTES = 10;

/** @param {object} src */
function delayMinutesFromTvMeta(src) {
  for (const key of ["delay", "delay_minutes", "data_delay", "dataDelay"]) {
    const n = Number(src[key]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return TRADINGVIEW_DATA_DELAY_MINUTES;
}

/** @param {object} meta */
function symbolInfoFromResolved(tvSymbol, meta) {
  const src = meta && typeof meta === "object" ? meta : {};
  const pricescale = src.pricescale ?? 100;
  const minmov = src.minmov ?? 1;
  const tick = src.minTick ?? src.pipSize ?? minmov / pricescale;
  const logoid = src.logoid ?? src.logo?.logoid;
  const delay_minutes = delayMinutesFromTvMeta(src);

  return {
    ...src,
    name: src.name ?? tvSymbol,
    ticker: src.ticker ?? tvSymbol,
    description: src.description ?? src.short_description ?? tvSymbol,
    type: src.type ?? "stock",
    exchange: src.exchange ?? src.listed_exchange ?? src.source_id ?? "",
    listed_exchange: src.listed_exchange ?? src.source_id ?? "",
    session: src.session ?? src["session-display"] ?? "24x7",
    timezone: src.timezone ?? "Etc/UTC",
    minmov,
    pricescale,
    tick,
    minTick: src.minTick ?? tick,
    pipSize: src.pipSize ?? tick,
    pipValue: src.pipValue,
    pointvalue: src.pointvalue,
    has_intraday: src.has_intraday ?? true,
    has_daily: src.has_daily ?? true,
    has_weekly_and_monthly: src.has_weekly_and_monthly ?? true,
    has_ticks: src.has_ticks,
    has_seconds: src.has_seconds,
    has_empty_bars: src.has_empty_bars,
    intraday_multipliers: src.intraday_multipliers,
    seconds_multipliers: src.seconds_multipliers,
    weekly_multipliers: src.weekly_multipliers,
    monthly_multipliers: src.monthly_multipliers,
    supported_resolutions: supportedResolutionsForSymbol(src.supported_resolutions),
    subsession_id: src.subsession_id,
    subsessions: src.subsessions,
    session_holidays: src.session_holidays,
    corrections: src.corrections,
    volume_precision: src.volume_precision ?? 0,
    data_status: delay_minutes > 0 ? "delayed" : "streaming",
    delay_minutes,
    currency_code: src.currency_code,
    logoid,
    logoUrl: logoid ? `https://s3-symbol-logo.tradingview.com/${logoid}--big.svg` : undefined,
  };
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
    const resSec = resolutionSec(resolution);
    const beforeTime = range?.to != null ? Math.floor(range.to) : null;
    const nowSec = Math.floor(Date.now() / 1000);
    /** Bars from now back to range.to — create_series only loads from the live edge. */
    const depthToTarget =
      beforeTime != null ? Math.max(0, Math.ceil((nowSec - beforeTime) / resSec)) : 0;
    const seriesCountBack =
      beforeTime != null
        ? Math.min(5000, Math.max(countBack, depthToTarget + countBack))
        : countBack;
    const maxMore =
      beforeTime != null ? Math.max(12, Math.ceil(depthToTarget / Math.max(countBack, 1)) + 4) : 0;

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

    function emptyResult(metaExtra = {}) {
      const meta = { ...metaExtra };
      if (meta.reason === "unsupported_resolution") {
        meta.invalidResolution = resolution;
      }
      finish(null, {
        bars: [],
        symbolInfo: symbolInfoFromResolved(tvSymbol, symbolMeta ?? {}),
        noData: true,
        meta,
      });
    }

    function completeFetch() {
      const all = sortedBars();
      let out = all;
      if (beforeTime != null) {
        // Prepend: bars strictly before anchor time (session gaps — no calendar from/to window).
        out = all.filter((b) => b.time <= beforeTime);
        if (out.length > countBack) out = out.slice(-countBack);
      } else if (range?.from != null) {
        out = all.filter((b) => b.time >= range.from);
      }
      const oldest = out[0]?.time;
      const newest = out[out.length - 1]?.time;
      finish(null, {
        bars: out,
        symbolInfo: symbolInfoFromResolved(tvSymbol, symbolMeta ?? {}),
        noData: out.length === 0,
        meta:
          out.length === 0 && beforeTime != null
            ? {
                depthToTarget,
                seriesCountBack,
                beforeTime,
                fetched: all.length,
                fetchedOldest: all[0]?.time,
                fetchedNewest: all[all.length - 1]?.time,
              }
            : out.length
              ? { oldest, newest, fetched: all.length }
              : undefined,
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
        seriesCountBack,
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
        if (oldest <= beforeTime) completeFetch();
        else finish(new Error(`TradingView history depth exhausted at ${oldest}, need ${beforeTime}`));
        return;
      }
      if (lastOldest != null && oldest >= lastOldest) {
        if (oldest <= beforeTime) completeFetch();
        else finish(new Error(`TradingView history stuck at ${oldest}, need ${beforeTime}`));
        return;
      }
      lastOldest = oldest;
      morePending = true;
      moreAttempts += 1;
      send("request_more_data", [chartSession, symbolNumber, seriesCountBack]);
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
          case "symbol_resolved": {
            symbolMeta = msg.p?.[2] ?? null;
            const info = symbolInfoFromResolved(tvSymbol, symbolMeta ?? {});
            symbolMeta = { ...symbolMeta, supported_resolutions: info.supported_resolutions };
            if (!isSymbolResolutionSupported(info, resolution)) {
              emptyResult({ reason: "unsupported_resolution" });
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
            morePending = false;
            if (beforeTime != null) maybeRequestMore();
            else if (bars.length) completeFetch();
            break;
          case "symbol_error":
            finish(new Error(msg.p?.[2] ?? "Unknown symbol"));
            break;
          case "series_error":
            emptyResult({ reason: "series_error" });
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
