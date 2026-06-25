import { TRADESEA_RESOLUTION_IDS } from "./resolutions.mjs";
import { normalizeTradeseaStreamSymbol } from "./streamSymbol.mjs";

const INTRADAY_MULTIPLIERS = ["1", "2", "3", "5", "10", "15", "30", "60", "120"];
const SECONDS_MULTIPLIERS = ["1", "5", "10", "15", "30", "45"];

/** @param {string} symbol */
export function chartSymbolToProductRoot(symbol) {
  let s = String(symbol || "").trim();
  if (!s) return "";
  if (s.includes(":")) s = s.split(":").pop().trim();
  s = s.replace(/[0-9!]+$/g, "").trim();
  return s.toUpperCase();
}

/** @param {{ minTick?: number, pipSize?: number, precision?: number }} row */
function tradeseaPricescale(row) {
  const precision = Number.isFinite(row.precision) ? Number(row.precision) : 2;
  const minTick = row.minTick ?? row.pipSize ?? 10 ** -precision;
  const pricescale = 10 ** precision;
  const minmov = Math.max(1, Math.round(minTick * pricescale));
  return { minmov, pricescale };
}

/** @param {object} row */
export function instrumentDisplaySymbol(row) {
  const product = String(row.symbol || "").trim();
  if (product && !product.includes(":")) return product.toUpperCase();
  const root = chartSymbolToProductRoot(row.ticker || row.symbol || "");
  return root || String(row.ticker || row.symbol || "").trim();
}

/** @param {string} chartSymbol @param {boolean} [delayed] */
export function normalizeStreamTicker(chartSymbol, delayed = true) {
  return normalizeTradeseaStreamSymbol(chartSymbol, delayed);
}

/** @param {object} row @param {boolean} [delayed] */
export function instrumentStreamTicker(row, delayed = true) {
  const ticker = String(row.ticker || "").trim();
  const sym = String(row.symbol || "").trim();
  return normalizeTradeseaStreamSymbol(ticker || sym, delayed);
}

/** @param {object[]} rows */
export function buildInstrumentIndex(rows) {
  /** @type {Map<string, object>} */
  const index = new Map();
  for (const row of rows) {
    const ticker = String(row.ticker || "").trim();
    const sym = String(row.symbol || "").trim().toUpperCase();
    const display = instrumentDisplaySymbol(row);
    if (ticker) {
      index.set(ticker.toUpperCase(), row);
      index.set(ticker, row);
    }
    if (sym) {
      index.set(sym, row);
      if (ticker.includes(":")) index.set(ticker.split(":").pop().toUpperCase(), row);
    }
    if (display) {
      index.set(display, row);
      index.set(display.toUpperCase(), row);
    }
  }
  return index;
}

/** @param {Map<string, object>} index @param {string} symbolName */
export function findInstrument(index, symbolName) {
  const raw = String(symbolName || "").trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  const direct = index.get(raw) || index.get(upper);
  if (direct) return direct;
  if (raw.includes(":")) {
    const tail = raw.split(":").pop().toUpperCase();
    return index.get(tail) || index.get(raw.toUpperCase());
  }
  const root = chartSymbolToProductRoot(raw);
  return index.get(root) || index.get(root.toUpperCase());
}

/** @param {object} row @param {boolean} [delayed] */
export function instrumentToLibrarySymbolInfo(row, delayed = true) {
  const streamTicker = instrumentStreamTicker(row, delayed);
  const display = instrumentDisplaySymbol(row);
  const { minmov, pricescale } = tradeseaPricescale(row);
  const exchangeLabel = delayed && row.exchange ? `${row.exchange} (Delayed)` : row.exchange;

  return {
    name: display,
    symbol: display,
    ticker: display,
    broker_symbol: streamTicker,
    description: row.description || display,
    type: "futures",
    exchange: exchangeLabel,
    listed_exchange: row.exchange,
    full_name: display,
    session: "24x7",
    timezone: "America/Chicago",
    minmov,
    pricescale,
    has_intraday: true,
    has_seconds: true,
    has_ticks: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: TRADESEA_RESOLUTION_IDS,
    intraday_multipliers: INTRADAY_MULTIPLIERS,
    seconds_multipliers: SECONDS_MULTIPLIERS,
    volume_precision: 0,
    data_status: delayed ? "delayed_streaming" : "streaming",
  };
}

/** @param {object} row @param {boolean} [delayed] */
export function instrumentToSearchResult(row, delayed = true) {
  const streamTicker = instrumentStreamTicker(row, delayed);
  const display = instrumentDisplaySymbol(row);
  const label = row.description || display;
  return {
    symbol: display,
    full_name: display,
    name: label,
    description: label,
    exchange: row.exchange || "CME",
    type: "futures",
    ticker: display,
    streamTicker,
  };
}

/** @param {object} info @param {boolean} [delayed] */
export function librarySymbolStreamTicker(info, delayed = true) {
  const broker = String(info.broker_symbol || info.streamTicker || "").trim();
  const display =
    librarySymbolDisplayName(info) ||
    String(info.ticker || info.name || info.symbol || "").trim();
  return normalizeTradeseaStreamSymbol(broker || display, delayed);
}

/** @param {object} info */
export function librarySymbolDisplayName(info) {
  const name = String(info.name || info.symbol || "").trim();
  if (name && !name.includes(":") && !/-Delayed:/i.test(name)) return name;
  const fromTicker = chartSymbolToProductRoot(String(info.ticker || ""));
  if (fromTicker) return fromTicker;
  return name || chartSymbolToProductRoot(String(info.broker_symbol || "")) || "";
}

/** @param {unknown} data */
export function parseTradeseaJsonArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.d)) return obj.d;
    if (Array.isArray(obj.symbols)) return obj.symbols;
  }
  return [];
}

/** @param {object} row @param {boolean} [delayed] */
export function udfSymbolToLibrarySymbolInfo(row, delayed = true) {
  const rawStream = String(row.ticker || row.name || row.symbol || "").trim();
  const streamTicker = normalizeTradeseaStreamSymbol(rawStream, delayed);
  const display =
    chartSymbolToProductRoot(streamTicker) ||
    String(row.symbol || row.name || "").trim() ||
    streamTicker;
  const exchange =
    row.exchange ||
    (streamTicker.includes(":")
      ? streamTicker.split(":")[0].replace(/-Delayed$/i, "")
      : "CME");
  const exchangeLabel = delayed ? `${exchange} (Delayed)` : exchange;
  const { minmov, pricescale } = tradeseaPricescale({
    minTick: Number(row.minmov) / Number(row.pricescale || 1) || undefined,
    precision: row.pricescale ? Math.log10(Number(row.pricescale)) : 2,
  });

  return {
    name: display,
    symbol: display,
    ticker: display,
    broker_symbol: streamTicker,
    description: row.description || display,
    type: "futures",
    exchange: exchangeLabel,
    listed_exchange: exchange,
    full_name: display,
    session: row.session || "24x7",
    timezone: row.timezone || "America/Chicago",
    minmov,
    pricescale,
    has_intraday: true,
    has_seconds: true,
    has_ticks: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: TRADESEA_RESOLUTION_IDS,
    intraday_multipliers: INTRADAY_MULTIPLIERS,
    seconds_multipliers: SECONDS_MULTIPLIERS,
    data_status: delayed ? "delayed_streaming" : "streaming",
  };
}
