import { createStaticDatafeed } from "./custom.js";
import { BAR_SEC } from "../chart/constants.js";

/**
 * Simplest datafeed — pass bars, push live updates, optional tick listener.
 *
 * @example
 * const feed = createSimpleDatafeed({ symbol: "BTC", bars: myBars });
 * const widget = await bootChart({ datafeed: feed, symbol: "BTC" });
 *
 * feed.push({ time: 1710000060, open: 100, high: 101, low: 99, close: 100.5 });
 * widget.update({ time: 1710000060, open: 100, high: 101.5, low: 99, close: 101 });
 *
 * @param {object} [opts]
 * @param {string} [opts.symbol]
 * @param {string} [opts.name]
 * @param {import("./types.js").Bar[]} [opts.bars]
 * @param {string} [opts.resolution] Default interval id (e.g. "1", "5", "D")
 * @param {{ id: string, label?: string, sec?: number }[]} [opts.resolutions]
 * @param {number} [opts.tick]
 * @param {string} [opts.timezone]
 */
export function createSimpleDatafeed(opts = {}) {
  const symbol = String(opts.symbol ?? "CUSTOM").toUpperCase();
  const resolution = opts.resolution ?? "1";
  const resolutions =
    opts.resolutions ??
    [
      {
        id: resolution,
        label: resolution,
        sec: BAR_SEC[resolution] ?? 60,
      },
    ];

  const feed = createStaticDatafeed({
    symbol,
    name: opts.name,
    bars: opts.bars,
    resolutions,
    tick: opts.tick,
    timezone: opts.timezone,
    exchange: opts.exchange,
    type: opts.type,
  });

  /** @type {Map<string, () => void>} */
  const tickUnsubs = new Map();

  return {
    ...feed,

    /** Replace all bars for a symbol. */
    set(rows, sym = symbol) {
      feed.setBars(sym, rows);
    },

    /** Current bars for a symbol. */
    get(sym = symbol) {
      return feed.getBarsFor(sym);
    },

    /** Push a live bar (updates forming candle or appends new). */
    push(bar, sym = symbol) {
      return feed.pushBar(bar, sym);
    },

    /**
     * Listen to bars pushed via push() / pushBar() (for debugging or side effects).
     * @param {(bar: import("./types.js").Bar) => void} fn
     * @returns {() => void} unsubscribe
     */
    onTick(fn) {
      const uid = `simple-${Math.random().toString(36).slice(2, 9)}`;
      feed.subscribeBars({ ticker: symbol, name: symbol }, resolution, fn, uid);
      const off = () => feed.unsubscribeBars(uid);
      tickUnsubs.set(uid, off);
      return off;
    },
  };
}
