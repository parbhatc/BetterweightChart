import { datafeedSupportsQuotes } from "../../datafeed/quotes.js";

/**
 * @param {import("../boot/chart/state.js").BootContext} ctx
 */
export async function attachQuoteManager(ctx) {
  const datafeed = ctx.datafeed;
  if (!datafeedSupportsQuotes(datafeed)) {
    ctx.quotesEnabled = false;
    return;
  }

  try {
    const cfg = await datafeed.onReady();
    const supported =
      Boolean(cfg?.supports_quotes) || Boolean(datafeed.supportsQuotes);
    if (!supported) {
      ctx.quotesEnabled = false;
      return;
    }
  } catch {
    ctx.quotesEnabled = false;
    return;
  }

  ctx.quotesEnabled = true;
  /** @type {Map<string, import("../../datafeed/quotes.js").MarketQuote>} */
  ctx.quotesBySymbol = new Map();

  /** @type {Map<string, { uid: string, refCount: number }>} */
  const subs = new Map();

  function refreshPanesForSymbol(symbol) {
    for (const pane of ctx.getAllChartPanes()) {
      if (pane.symbol !== symbol) continue;
      pane.quote = ctx.quotesBySymbol.get(symbol) ?? null;
      pane.bidAskLines?.requestRefresh?.();
      pane.priceLineLabel?.requestRefresh?.();
    }
  }

  /**
   * @param {object} pane
   * @param {import("../../datafeed/types.js").SymbolInfo} [symbolInfo]
   */
  function subscribePaneQuotes(pane, symbolInfo) {
    const sym = pane?.symbol;
    const info = symbolInfo ?? pane?.symbolInfo;
    if (!sym || !info) return;

    const existing = subs.get(sym);
    if (existing) {
      existing.refCount += 1;
      return;
    }

    const uid = `quote_${sym}_${Date.now()}`;
    datafeed.subscribeQuotes(
      [info],
      (quotes) => {
        const raw = quotes?.[0];
        const v = raw?.v ?? raw;
        const bid = Number(v?.bid);
        const ask = Number(v?.ask);
        if (!Number.isFinite(bid) || !Number.isFinite(ask)) return;
        const q = {
          symbol: raw?.n ?? sym,
          bid,
          ask,
          last: Number.isFinite(Number(v?.lp)) ? Number(v.lp) : undefined,
        };
        ctx.quotesBySymbol.set(sym, q);
        refreshPanesForSymbol(sym);
      },
      uid,
    );
    subs.set(sym, { uid, refCount: 1 });
  }

  /**
   * @param {string} symbol
   */
  function unsubscribePaneQuotes(symbol) {
    const sub = subs.get(symbol);
    if (!sub) return;
    sub.refCount -= 1;
    if (sub.refCount > 0) return;
    datafeed.unsubscribeQuotes?.(sub.uid);
    subs.delete(symbol);
    ctx.quotesBySymbol.delete(symbol);
  }

  ctx.subscribeQuotesForPane = (pane, symbolInfo) => subscribePaneQuotes(pane, symbolInfo);
  ctx.unsubscribeQuotesForPane = (paneOrSymbol) => {
    const symbol =
      typeof paneOrSymbol === "string"
        ? paneOrSymbol
        : paneOrSymbol?.symbol;
    if (symbol) unsubscribePaneQuotes(symbol);
  };
  ctx.getQuoteForSymbol = (symbol) => ctx.quotesBySymbol.get(symbol) ?? null;

  for (const pane of ctx.getAllChartPanes()) {
    if (pane.symbolInfo) subscribePaneQuotes(pane, pane.symbolInfo);
  }
}
