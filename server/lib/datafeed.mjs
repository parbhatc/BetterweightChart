import {
  RESOLUTIONS,
  chartConfig,
  generateFakeBars,
  listSymbols,
  searchSymbols,
} from "./fakeBars.mjs";

export function datafeedConfig() {
  const cfg = chartConfig();
  return {
    supported_resolutions: RESOLUTIONS.map((r) => r.id),
    supports_search: true,
    supports_group_request: false,
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
    exchanges: [
      { value: "", name: "All", desc: "" },
      { value: "CME", name: "CME", desc: "CME" },
      { value: "CRYPTO", name: "Crypto", desc: "Crypto" },
      { value: "NASDAQ", name: "NASDAQ", desc: "NASDAQ" },
      { value: "FOREX", name: "Forex", desc: "Forex" },
    ],
    symbols_types: [
      { name: "All types", value: "" },
      { name: "Futures", value: "futures" },
      { name: "Stock", value: "stock" },
      { name: "Crypto", value: "crypto" },
      { name: "Forex", value: "forex" },
      { name: "ETF", value: "etf" },
    ],
    default_symbol: cfg.defaultSymbol,
    default_resolution: cfg.defaultResolution,
    resolutions: RESOLUTIONS,
    themes: cfg.themes,
    symbols: cfg.symbols,
  };
}

/**
 * @param {string} symbol
 */
export function resolveSymbol(symbol) {
  const sym = String(symbol || "").toUpperCase();
  const cfg = chartConfig();
  const meta = cfg.symbols[sym];
  if (!meta) return null;

  const tick = meta.tick ?? 0.01;
  const pricescale = Math.round(1 / tick);

  return {
    name: sym,
    ticker: sym,
    description: meta.name,
    type: meta.type,
    exchange: meta.exchange,
    listed_exchange: meta.exchange,
    session: "24x7",
    timezone: "Etc/UTC",
    minmov: 1,
    pricescale,
    tick,
    has_intraday: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: RESOLUTIONS.map((r) => r.id),
    volume_precision: 0,
    data_status: meta.type === "crypto" ? "streaming" : "delayed",
  };
}

/**
 * @param {object} params
 * @param {string} params.symbol
 * @param {string} [params.resolution]
 * @param {string|number} [params.from]
 * @param {string|number} [params.to]
 * @param {string|number} [params.countback]
 */
export function historyBars(params) {
  const symbol = String(params.symbol || "NQ").toUpperCase();
  const resolution = String(params.resolution || "1");
  const to = params.to != null ? Number(params.to) : undefined;
  const from = params.from != null ? Number(params.from) : undefined;
  let countback = params.countback != null ? Number(params.countback) : 500;

  if (from != null && to != null && !params.countback) {
    const resSec = RESOLUTIONS.find((r) => r.id === resolution)?.sec ?? 60;
    countback = Math.min(Math.max(Math.ceil((to - from) / resSec), 10), 5000);
  }

  const payload = generateFakeBars(symbol, {
    resolution,
    to,
    countback,
    seed: 42,
  });

  if (!payload.bars.length) {
    return { s: "no_data" };
  }

  return {
    s: "ok",
    t: payload.bars.map((b) => b.time),
    o: payload.bars.map((b) => b.open),
    h: payload.bars.map((b) => b.high),
    l: payload.bars.map((b) => b.low),
    c: payload.bars.map((b) => b.close),
    v: payload.bars.map((_, i) => 1000 + ((i * 37) % 9000)),
    bars: payload.bars,
    meta: {
      symbol: payload.symbol,
      resolution: payload.resolution,
      from: payload.from,
      to: payload.to,
      countback: payload.countback,
    },
  };
}

export function searchDatafeed(query, limit = 25) {
  return searchSymbols(query, limit).map((s) => ({
    symbol: s.symbol,
    full_name: `${s.exchange}:${s.symbol}`,
    description: s.name,
    exchange: s.exchange,
    ticker: s.symbol,
    type: s.type,
  }));
}

export function allSymbols() {
  return listSymbols();
}
