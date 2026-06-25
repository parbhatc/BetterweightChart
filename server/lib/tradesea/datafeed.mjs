import { chartConfig } from "../fakeBars.mjs";
import { tradeseaConfig, tradeseaConfigured } from "./config.mjs";
import { fetchTradeseaInstruments, fetchTradeseaUdf, getTradeseaRuntimeConfig } from "./client.mjs";
import {
  TRADESEA_RESOLUTIONS,
  TRADESEA_RESOLUTION_IDS,
  tradeseaResolutionSec,
} from "./resolutions.mjs";
import {
  buildInstrumentIndex,
  findInstrument,
  instrumentToLibrarySymbolInfo,
  instrumentToSearchResult,
  librarySymbolStreamTicker,
  normalizeStreamTicker,
  parseTradeseaJsonArray,
  udfSymbolToLibrarySymbolInfo,
} from "./symbols.mjs";

/** @type {Map<string, object>} */
const symbolCache = new Map();
/** @type {Promise<void> | null} */
let instrumentsPromise = null;
/** @type {Map<string, object>} */
let instrumentIndex = new Map();

function runtimeCfg() {
  return tradeseaConfig();
}

function ensureInstrumentsLoaded() {
  if (!instrumentsPromise) {
    instrumentsPromise = fetchTradeseaInstruments("/v1/all/symbols")
      .then((data) => {
        const rows = parseTradeseaJsonArray(data);
        instrumentIndex = buildInstrumentIndex(rows);
      })
      .catch((err) => {
        console.warn("[tradesea] instruments load failed:", err.message || err);
        instrumentIndex = new Map();
      });
  }
  return instrumentsPromise;
}

export function tradeseaDatafeedConfig() {
  const { themes } = chartConfig();
  const runtime = getTradeseaRuntimeConfig();
  return {
    supported_resolutions: TRADESEA_RESOLUTION_IDS,
    resolutions: TRADESEA_RESOLUTIONS,
    default_symbol: "MNQ",
    default_resolution: "1",
    exchanges: [{ value: "CME", name: "CME", desc: "Chicago Mercantile Exchange" }],
    symbols_types: [{ name: "futures", value: "futures" }],
    supports_search: true,
    supports_group_request: false,
    supports_quotes: false,
    data_status: runtime.delayed ? "delayed_streaming" : "streaming",
    tradesea: runtime,
    themes,
  };
}

/** @param {string} query @param {number} [limit] */
export async function tradeseaSearch(query, limit = 50) {
  await ensureInstrumentsLoaded();
  const q = String(query || "").trim().toUpperCase();
  if (!instrumentIndex.size) {
    const params = new URLSearchParams({ query: q || "NQ", limit: String(limit) });
    try {
      const data = await fetchTradeseaInstruments("/v1/search", params);
      return parseTradeseaJsonArray(data)
        .slice(0, limit)
        .map((row) => instrumentToSearchResult(row, runtimeCfg().delayed));
    } catch {
      return [];
    }
  }

  const rows = [];
  for (const row of instrumentIndex.values()) {
    const display = String(row.symbol || "").toUpperCase();
    const ticker = String(row.ticker || "").toUpperCase();
    const desc = String(row.description || "").toUpperCase();
    if (!q || display.includes(q) || ticker.includes(q) || desc.includes(q)) {
      rows.push(row);
    }
    if (rows.length >= limit) break;
  }
  return rows.map((row) => instrumentToSearchResult(row, runtimeCfg().delayed));
}

/** @param {string} symbol */
export async function tradeseaResolve(symbol) {
  const sym = String(symbol || "").trim();
  if (symbolCache.has(sym)) return symbolCache.get(sym);

  await ensureInstrumentsLoaded();
  const delayed = runtimeCfg().delayed;
  const fromCatalog = findInstrument(instrumentIndex, sym);
  if (fromCatalog) {
    const info = instrumentToLibrarySymbolInfo(fromCatalog, delayed);
    symbolCache.set(sym, info);
    return info;
  }

  const stream = normalizeStreamTicker(sym, delayed);
  const params = new URLSearchParams({
    symbol: stream,
    currencyCode: "USD",
  });
  try {
    const data = await fetchTradeseaUdf("symbols", params);
    if (data && data.s !== "error") {
      const info = udfSymbolToLibrarySymbolInfo(data, delayed);
      symbolCache.set(sym, info);
      return info;
    }
  } catch {
    /* fall through */
  }

  const info = {
    name: sym.toUpperCase(),
    symbol: sym.toUpperCase(),
    ticker: sym.toUpperCase(),
    broker_symbol: stream,
    description: sym.toUpperCase(),
    type: "futures",
    exchange: delayed ? "CME (Delayed)" : "CME",
    timezone: "America/Chicago",
    session: "24x7",
    minmov: 1,
    pricescale: 100,
    supported_resolutions: TRADESEA_RESOLUTION_IDS,
    has_intraday: true,
    has_seconds: true,
    has_ticks: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    data_status: delayed ? "delayed_streaming" : "streaming",
  };
  symbolCache.set(sym, info);
  return info;
}

/** @param {number} time */
function barTimeToSec(time) {
  if (!Number.isFinite(time)) return Math.floor(Date.now() / 1000);
  return time > 1e12 ? Math.floor(time / 1000) : Math.floor(time);
}

/**
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {string} opts.resolution
 * @param {number} [opts.countback]
 * @param {number} [opts.from]
 * @param {number} [opts.to]
 */
export async function tradeseaHistory(opts) {
  if (!tradeseaConfigured(runtimeCfg())) {
    return {
      s: "error",
      errmsg:
        "Tradesea not configured on server — set AUREN_JWT + TRADESEA_ACCOUNT_ID or TRADESEA_ACCESS_TOKEN env vars.",
    };
  }

  const resolution = String(opts.resolution || "1");
  const barSec = Math.max(1, tradeseaResolutionSec(resolution));
  const now = Math.floor(Date.now() / 1000);
  const to = opts.to != null ? Number(opts.to) : now;
  const countBack = opts.countback != null ? Math.max(1, Number(opts.countback)) : 500;
  const from = opts.from != null ? Number(opts.from) : to - countBack * barSec;

  const info = await tradeseaResolve(opts.symbol);
  const delayed = runtimeCfg().delayed;
  const streamSymbol = librarySymbolStreamTicker(info, delayed);

  const alignedFrom = Math.floor(from / barSec) * barSec;
  const alignedTo = Math.ceil(to / barSec) * barSec;
  const params = new URLSearchParams({
    symbol: streamSymbol,
    resolution,
    from: String(alignedFrom),
    to: String(alignedTo),
    countback: String(countBack),
    currencyCode: "USD",
  });

  const data = await fetchTradeseaUdf("history", params);
  if (data.s === "no_data" || !data.t?.length) {
    return { s: "no_data", meta: { noData: true, symbolInfo: info } };
  }
  if (data.s === "error") {
    return {
      s: "error",
      errmsg: data.errmsg || data.message || "History failed",
      meta: { symbolInfo: info },
    };
  }

  const t = data.t.map(barTimeToSec);
  return {
    s: "ok",
    t,
    o: data.o,
    h: data.h,
    l: data.l,
    c: data.c,
    v: data.v,
    meta: { symbolInfo: info, noData: t.length < countBack * 0.15 },
  };
}
