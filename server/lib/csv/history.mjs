import { resolutionSec } from "../resolutions.mjs";
import { aggregateBars, tailBars } from "./aggregate.mjs";
import { CSV_ROOT, createCsvBarStore, csvSymbolFromTv } from "./csvBarStore.mjs";

const store = createCsvBarStore(CSV_ROOT);

/**
 * @param {object} opts
 * @param {string} opts.symbol TradingView or short symbol
 * @param {string} opts.resolution
 * @param {number} [opts.countback]
 * @param {number} [opts.from]
 * @param {number} [opts.to]
 */
export function csvHistoryBars(opts) {
  const csvSym = csvSymbolFromTv(opts.symbol);
  if (!csvSym) return null;

  const resSec = resolutionSec(opts.resolution);
  if (!resSec) return null;

  const countBack = Math.max(1, Number(opts.countback) || 500);
  let toSec = opts.to != null ? Math.floor(Number(opts.to)) : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(toSec)) toSec = Math.floor(Date.now() / 1000);

  let fromSec = opts.from != null ? Math.floor(Number(opts.from)) : null;
  if (fromSec != null && !Number.isFinite(fromSec)) fromSec = null;
  if (fromSec == null) {
    fromSec = toSec - countBack * resSec * 2;
  }

  let bars1m = store.loadBarsInRange(csvSym, fromSec, toSec + resSec);
  if (!bars1m.length) return null;

  bars1m = bars1m.filter((b) => b.time <= toSec);
  let bars = resSec <= 60 ? bars1m : aggregateBars(bars1m, resSec);
  bars = tailBars(bars, countBack);

  if (!bars.length) return null;

  return {
    bars,
    meta: { source: "csv", csvSymbol: csvSym, csvRoot: CSV_ROOT },
  };
}

export function csvDatafeedSymbols() {
  return store.listSymbols();
}

export { CSV_ROOT, csvSymbolFromTv, createCsvBarStore };
