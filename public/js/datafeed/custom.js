/** @typedef {import("./types.js").Bar} Bar */
/** @typedef {import("./types.js").Datafeed} Datafeed */
/** @typedef {import("./types.js").DatafeedConfig} DatafeedConfig */
/** @typedef {import("./types.js").GetBarsResult} GetBarsResult */
/** @typedef {import("./types.js").PeriodParams} PeriodParams */
/** @typedef {import("./types.js").SymbolInfo} SymbolInfo */

const DEFAULT_RESOLUTIONS = [
  { id: "1", label: "1m", sec: 60 },
  { id: "5", label: "5m", sec: 300 },
  { id: "15", label: "15m", sec: 900 },
  { id: "60", label: "1h", sec: 3600 },
  { id: "D", label: "1D", sec: 86400 },
];

/**
 * Normalize bar time to Unix seconds (accepts ms timestamps).
 * @param {Partial<Bar> & { time: number }} bar
 * @returns {Bar}
 */
export function normalizeBar(bar) {
  const time = bar.time > 1e12 ? Math.floor(bar.time / 1000) : bar.time;
  return {
    time,
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: bar.volume != null ? Number(bar.volume) : undefined,
  };
}

/**
 * @param {Bar[]} bars
 * @returns {Bar[]}
 */
export function normalizeBars(bars) {
  return bars.map(normalizeBar).sort((a, b) => a.time - b.time);
}

/**
 * @param {GetBarsResult | Bar[]} result
 * @returns {GetBarsResult}
 */
function normalizeGetBarsResult(result) {
  if (Array.isArray(result)) return { bars: normalizeBars(result) };
  return {
    bars: normalizeBars(result.bars ?? []),
    noData: result.noData,
    meta: result.meta,
  };
}

/**
 * @param {DatafeedConfig} cfg
 * @returns {DatafeedConfig}
 */
function normalizeConfig(cfg) {
  const resolutions = cfg.resolutions?.length ? cfg.resolutions : DEFAULT_RESOLUTIONS;
  return {
    ...cfg,
    resolutions,
    supported_resolutions: cfg.supported_resolutions ?? resolutions.map((r) => r.id),
    default_resolution: cfg.default_resolution ?? resolutions[0]?.id ?? "1",
  };
}

/**
 * Build a datafeed from your own handlers (same shape as TradingView UDF).
 *
 * @param {object} handlers
 * @param {() => DatafeedConfig | Promise<DatafeedConfig>} handlers.onReady
 * @param {(symbolName: string) => SymbolInfo | Promise<SymbolInfo>} handlers.resolveSymbol
 * @param {(symbolInfo: SymbolInfo, resolution: string, periodParams?: PeriodParams) => GetBarsResult | Bar[] | Promise<GetBarsResult | Bar[]>} handlers.getBars
 * @param {(userInput: string, exchange?: string, symbolType?: string, limit?: number) => object[] | Promise<object[]>} [handlers.searchSymbols]
 * @param {(...args: unknown[]) => void} [handlers.subscribeBars]
 * @param {(...args: unknown[]) => void} [handlers.unsubscribeBars]
 * @returns {Datafeed & {
 *   setBars?: (symbol: string, bars: Bar[]) => void,
 *   getBarsFor?: (symbol: string) => Bar[],
 *   pushBar?: (bar: Bar, symbol?: string) => Bar | null,
 *   updateBar?: (bar: Bar, symbol?: string) => Bar | null,
 * }}
 */
export function createCustomDatafeed(handlers) {
  const {
    onReady,
    resolveSymbol,
    getBars,
    searchSymbols,
    subscribeBars = () => {},
    unsubscribeBars = () => {},
  } = handlers;

  if (!onReady || !resolveSymbol || !getBars) {
    throw new Error("createCustomDatafeed requires onReady, resolveSymbol, and getBars");
  }

  /** @type {Promise<DatafeedConfig> | null} */
  let readyPromise = null;

  return {
    onReady() {
      if (!readyPromise) readyPromise = Promise.resolve(onReady()).then(normalizeConfig);
      return readyPromise;
    },

    searchSymbols(userInput, exchange = "", symbolType = "", limit = 25) {
      if (!searchSymbols) return Promise.resolve([]);
      return Promise.resolve(searchSymbols(userInput, exchange, symbolType, limit));
    },

    resolveSymbol(symbolName) {
      return Promise.resolve(resolveSymbol(symbolName));
    },

    async getBars(symbolInfo, resolution, periodParams = {}) {
      const result = await getBars(symbolInfo, resolution, periodParams);
      return normalizeGetBarsResult(result);
    },

    subscribeBars,
    unsubscribeBars,
  };
}

/**
 * @param {Bar[]} bars
 * @param {PeriodParams} periodParams
 * @returns {Bar[]}
 */
function sliceBars(bars, periodParams = {}) {
  let out = bars;
  if (periodParams.to != null) out = out.filter((b) => b.time <= periodParams.to);
  if (periodParams.from != null) out = out.filter((b) => b.time >= periodParams.from);
  if (periodParams.countBack != null) out = out.slice(-Math.max(1, periodParams.countBack));
  return out;
}

/**
 * @param {string} sym
 * @param {object} meta
 * @param {{ id: string, label: string, sec?: number }[]} resolutions
 * @returns {SymbolInfo}
 */
function defaultSymbolInfo(sym, meta, resolutions) {
  const tick = meta.tick ?? 0.01;
  return {
    name: sym,
    ticker: sym,
    description: meta.name ?? sym,
    type: meta.type ?? "stock",
    exchange: meta.exchange ?? "CUSTOM",
    listed_exchange: meta.exchange ?? "CUSTOM",
    session: meta.session ?? "24x7",
    timezone: meta.timezone ?? "Etc/UTC",
    minmov: 1,
    pricescale: Math.round(1 / tick),
    tick,
    has_intraday: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: resolutions.map((r) => r.id),
    volume_precision: 0,
    data_status: "endofday",
  };
}

/**
 * In-memory datafeed from your own candle arrays — no server required.
 *
 * @param {object} opts
 * @param {string} [opts.symbol]
 * @param {string} [opts.name]
 * @param {string} [opts.exchange]
 * @param {string} [opts.type]
 * @param {number} [opts.tick]
 * @param {string} [opts.timezone]
 * @param {Bar[]} [opts.bars]
 * @param {Record<string, Bar[]>} [opts.symbols] Map of symbol → bars
 * @param {{ id: string, label: string, sec?: number }[]} [opts.resolutions]
 * @returns {Datafeed & { setBars: (symbol: string, bars: Bar[]) => void, getBarsFor: (symbol: string) => Bar[] }}
 */
export function createStaticDatafeed(opts = {}) {
  const symbol = String(opts.symbol ?? "CUSTOM").toUpperCase();
  const resolutions = opts.resolutions?.length ? opts.resolutions : DEFAULT_RESOLUTIONS;

  /** @type {Record<string, Bar[]>} */
  const barsBySymbol = {};

  if (opts.symbols) {
    for (const [key, rows] of Object.entries(opts.symbols)) {
      barsBySymbol[String(key).toUpperCase()] = normalizeBars(rows);
    }
  }
  if (opts.bars?.length) {
    barsBySymbol[symbol] = normalizeBars(opts.bars);
  }
  if (!Object.keys(barsBySymbol).length) {
    barsBySymbol[symbol] = [];
  }

  /** @type {Record<string, object>} */
  const metaBySymbol = {};
  for (const sym of Object.keys(barsBySymbol)) {
    metaBySymbol[sym] = {
      name: sym === symbol ? (opts.name ?? sym) : sym,
      exchange: opts.exchange ?? "CUSTOM",
      type: opts.type ?? "stock",
      tick: opts.tick ?? 0.01,
      timezone: opts.timezone ?? "Etc/UTC",
    };
  }

  /** @type {Map<string, { onTick: (bar: Bar) => void, symbol: string }>} */
  const streamSubs = new Map();

  const feed = createCustomDatafeed({
    onReady: () => ({
      supported_resolutions: resolutions.map((r) => r.id),
      resolutions,
      default_symbol: symbol,
      default_resolution: resolutions[0]?.id ?? "1",
      symbols: Object.fromEntries(
        Object.keys(barsBySymbol).map((sym) => [
          sym,
          { name: metaBySymbol[sym].name, exchange: metaBySymbol[sym].exchange, type: metaBySymbol[sym].type },
        ]),
      ),
    }),

    searchSymbols(userInput) {
      const q = String(userInput || "").trim().toUpperCase();
      return Object.keys(barsBySymbol)
        .filter((sym) => !q || sym.includes(q) || String(metaBySymbol[sym]?.name ?? "").toUpperCase().includes(q))
        .map((sym) => ({
          symbol: sym,
          name: metaBySymbol[sym]?.name ?? sym,
          exchange: metaBySymbol[sym]?.exchange ?? "CUSTOM",
          type: metaBySymbol[sym]?.type ?? "stock",
          ticker: sym,
          full_name: `${metaBySymbol[sym]?.exchange ?? "CUSTOM"}:${sym}`,
        }));
    },

    resolveSymbol(symbolName) {
      const sym = String(symbolName || symbol).toUpperCase();
      if (!barsBySymbol[sym]) {
        barsBySymbol[sym] = [];
        metaBySymbol[sym] = { name: sym, exchange: opts.exchange ?? "CUSTOM", type: opts.type ?? "stock", tick: opts.tick ?? 0.01 };
      }
      return defaultSymbolInfo(sym, metaBySymbol[sym], resolutions);
    },

    getBars(symbolInfo, _resolution, periodParams = {}) {
      const sym = String(symbolInfo.ticker || symbolInfo.name).toUpperCase();
      const rows = barsBySymbol[sym];
      if (!rows?.length) return { bars: [], noData: true };
      return { bars: sliceBars(rows, periodParams) };
    },

    subscribeBars(symbolInfo, _resolution, onTick, subscriberUID) {
      streamSubs.set(subscriberUID, { onTick, symbol: String(symbolInfo.ticker || symbolInfo.name).toUpperCase() });
    },

    unsubscribeBars(subscriberUID) {
      streamSubs.delete(subscriberUID);
    },
  });

  function emitBar(sym, bar) {
    const n = normalizeBar(bar);
    for (const sub of streamSubs.values()) {
      if (sub.symbol === sym) sub.onTick(n);
    }
  }

  /**
   * @param {string} sym
   * @param {Partial<Bar> & { time: number }} bar
   * @returns {Bar | null}
   */
  function upsertBar(sym, bar) {
    const key = String(sym).toUpperCase();
    if (!barsBySymbol[key]) {
      barsBySymbol[key] = [];
      metaBySymbol[key] = { name: key, exchange: opts.exchange ?? "CUSTOM", type: opts.type ?? "stock", tick: opts.tick ?? 0.01 };
    }
    const rows = barsBySymbol[key];
    const n = normalizeBar(bar);
    const last = rows[rows.length - 1];
    if (last?.time === n.time) {
      rows[rows.length - 1] = n;
    } else if (!last || n.time > last.time) {
      rows.push(n);
    } else {
      return null;
    }
    emitBar(key, n);
    return n;
  }

  feed.pushBar = (bar, sym = symbol) => upsertBar(sym, bar);
  feed.updateBar = (bar, sym = symbol) => upsertBar(sym, bar);

  feed.setBars = (sym, rows) => {
    const key = String(sym).toUpperCase();
    barsBySymbol[key] = normalizeBars(rows);
    if (!metaBySymbol[key]) {
      metaBySymbol[key] = { name: key, exchange: opts.exchange ?? "CUSTOM", type: opts.type ?? "stock", tick: opts.tick ?? 0.01 };
    }
  };

  feed.getBarsFor = (sym) => barsBySymbol[String(sym).toUpperCase()] ?? [];

  return feed;
}
