import { decodeMessage, encodeHeartbeat, encodeMessage } from "./message/utils.js";

const WIDGET_WS =
  "wss://widgetdata.tradingview.com/socket.io/websocket?from=embed-widget%2Ftradingview-datafeed%2F";

function widgetWsUrl() {
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const page = "charting-library.tradingview-widget.com%2F";
  return `${WIDGET_WS}&date=${encodeURIComponent(date)}&page-uri=${page}&ancestor-origin=${page.slice(0, -3)}`;
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** @param {number[]} v [time, open, high, low, close, volume?] */
function barFromTvValues(v) {
  const time = Math.floor(v[0]);
  return {
    time,
    open: v[1],
    high: v[2],
    low: v[3],
    close: v[4],
    volume: v[5] != null ? v[5] : undefined,
  };
}

/**
 * Browser websocket for remote chart data (widgetdata endpoint).
 */
export class TradingViewSocket {
  constructor() {
    /** @type {WebSocket | null} */
    this.ws = null;
    this.chartSession = null;
    this.seriesId = "sds_1";
    this.seriesKey = "s1";
    this.symbolKey = "sds_sym_1";
    this.connectPromise = null;
    /** @type {Map<string, { resolve: Function, reject: Function, bars: object[] }>} */
    this.pendingHistory = new Map();
    /** @type {Map<string, (bar: object) => void>} */
    this.streamHandlers = new Map();
    this.activeStreamKey = null;
    this.activeTvSymbol = null;
    this.activeResolution = null;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(widgetWsUrl());
      this.ws = ws;

      const onFail = (err) => {
        this.connectPromise = null;
        reject(err);
      };

      ws.addEventListener("open", () => {
        this.chartSession = randomId("cs");
        ws.send(encodeMessage({ m: "set_auth_token", p: ["unauthorized_user_token"] }));
        ws.send(encodeMessage({ m: "set_locale", p: ["en", "US"] }));
        ws.send(encodeMessage({ m: "chart_create_session", p: [this.chartSession, ""] }));
        resolve();
      });

      ws.addEventListener("message", (ev) => this.onRawMessage(String(ev.data)));
      ws.addEventListener("error", () => onFail(new Error("TradingView websocket error")));
      ws.addEventListener("close", () => {
        this.connectPromise = null;
        this.ws = null;
      });
    });

    return this.connectPromise;
  }

  /** @param {string} raw */
  onRawMessage(raw) {
    const frames = decodeMessage(raw);
    for (const frame of frames) {
      if (frame.heartbeat) {
        this.ws?.send(encodeHeartbeat(frame.timestamp));
        continue;
      }
      if (!frame.m) continue;
      this.dispatch(frame);
    }
  }

  /** @param {object} frame */
  dispatch(frame) {
    const { m, p } = frame;

    if (m === "symbol_error") {
      const key = this.pendingHistory.keys().next().value;
      const pending = key ? this.pendingHistory.get(key) : null;
      pending?.reject(new Error(String(p[2] ?? "Unknown symbol")));
      if (key) this.pendingHistory.delete(key);
      return;
    }

    if (m === "timescale_update" || m === "du") {
      const payload = p?.[1];
      if (!payload || typeof payload !== "object") return;

      for (const block of Object.values(payload)) {
        if (!block?.s?.length) continue;
        const bars = block.s.map((row) => barFromTvValues(row.v));

        for (const [key, pending] of this.pendingHistory) {
          pending.bars.push(...bars);
        }

        if (this.activeStreamKey && this.streamHandlers.has(this.activeStreamKey)) {
          const cb = this.streamHandlers.get(this.activeStreamKey);
          bars.forEach((bar) => cb?.(bar));
        }
      }
      return;
    }

    if (m === "series_completed") {
      for (const [key, pending] of [...this.pendingHistory]) {
        const sorted = [...pending.bars].sort((a, b) => a.time - b.time);
        const deduped = [];
        for (const bar of sorted) {
          if (!deduped.length || deduped[deduped.length - 1].time !== bar.time) deduped.push(bar);
          else deduped[deduped.length - 1] = bar;
        }
        pending.resolve(deduped);
        this.pendingHistory.delete(key);
      }
    }
  }

  /**
   * @param {string} tvSymbol
   * @param {string} resolution
   * @param {number} countBack
   */
  async fetchBars(tvSymbol, resolution, countBack = 300) {
    await this.connect();
    const requestKey = `${tvSymbol}:${resolution}:${countBack}`;

    if (this.activeTvSymbol !== tvSymbol || this.activeResolution !== resolution) {
      const symJson = `={"adjustment":"splits","symbol":"${tvSymbol}"}`;
      this.ws?.send(
        encodeMessage({
          m: "resolve_symbol",
          p: [this.chartSession, this.symbolKey, symJson],
        }),
      );
      this.ws?.send(
        encodeMessage({
          m: "create_series",
          p: [
            this.chartSession,
            this.seriesId,
            this.seriesKey,
            this.symbolKey,
            resolution,
            countBack,
            "",
          ],
        }),
      );
      this.activeTvSymbol = tvSymbol;
      this.activeResolution = resolution;
    } else {
      this.ws?.send(
        encodeMessage({
          m: "modify_series",
          p: [
            this.chartSession,
            this.seriesId,
            this.seriesKey,
            this.symbolKey,
            resolution,
            "",
          ],
        }),
      );
      this.ws?.send(
        encodeMessage({
          m: "request_more_data",
          p: [this.chartSession, this.seriesId, countBack],
        }),
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHistory.delete(requestKey);
        reject(new Error("TradingView history timeout"));
      }, 20000);

      this.pendingHistory.set(requestKey, {
        bars: [],
        resolve: (bars) => {
          clearTimeout(timer);
          resolve(bars);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /**
   * @param {string} streamKey
   * @param {string} tvSymbol
   * @param {string} resolution
   * @param {(bar: object) => void} onBar
   */
  async subscribe(streamKey, tvSymbol, resolution, onBar) {
    this.streamHandlers.set(streamKey, onBar);
    this.activeStreamKey = streamKey;
    await this.fetchBars(tvSymbol, resolution, 2);
  }

  /** @param {string} streamKey */
  unsubscribe(streamKey) {
    this.streamHandlers.delete(streamKey);
    if (this.activeStreamKey === streamKey) this.activeStreamKey = null;
  }

  close() {
    this.ws?.close();
    this.ws = null;
    this.connectPromise = null;
    this.pendingHistory.clear();
    this.streamHandlers.clear();
  }
}
