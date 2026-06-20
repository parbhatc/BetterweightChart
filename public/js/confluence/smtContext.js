import { sliceBarsThroughAnchor } from "../levels/levelsCalc.js";
import { smtCompanionSymbol } from "../liquidity-x/liquidityXEngine.js";

/** @typedef {{ kind: "bull"|"bear"; time: number; startTime: number; endTime: number; label: string; color: string }} SmtEvent */

/** @param {{ high: number; low: number }[]} bars @param {number} i @param {number} left @param {number} right */
function pivotHighAt(bars, i, left, right) {
  if (i < left || i + right >= bars.length) return null;
  const h = bars[i].high;
  for (let j = i - left; j <= i + right; j++) {
    if (j !== i && bars[j].high >= h) return null;
  }
  return h;
}

/** @param {{ high: number; low: number }[]} bars @param {number} i @param {number} left @param {number} right */
function pivotLowAt(bars, i, left, right) {
  if (i < left || i + right >= bars.length) return null;
  const l = bars[i].low;
  for (let j = i - left; j <= i + right; j++) {
    if (j !== i && bars[j].low <= l) return null;
  }
  return l;
}

export class SmtContext {
  /**
   * SMT divergence legs (matches liquidityXEngine runSmtEngine).
   * @param {{ time: number; high: number; low: number }[]} primary1m
   * @param {{ time: number; high: number; low: number }[]} comp1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} [pivotLeft]
   * @param {number} [pivotRight]
   * @param {string} [compLabel]
   */
  static buildSmtEvents(
    primary1m,
    comp1m,
    anchorUnix,
    pivotLeft = 3,
    pivotRight = 3,
    compLabel = "ES",
  ) {
    if (!primary1m?.length || !comp1m?.length || anchorUnix == null) return [];

    const primary = sliceBarsThroughAnchor(primary1m, anchorUnix);
    const comp = sliceBarsThroughAnchor(comp1m, anchorUnix);
    if (primary.length < pivotLeft + pivotRight + 5) return [];

    const compMap = new Map(comp.map((b) => [b.time, b]));
    /** @type {({ high: number; low: number } | null)[]} */
    const compAligned = primary.map((b) => compMap.get(b.time) ?? null);

    /** @type {SmtEvent[]} */
    const events = [];
    /** @type {{ price: number; symPrice: number; time: number } | null} */
    let lastPh = null;
    /** @type {{ price: number; symPrice: number; time: number } | null} */
    let lastPl = null;

    for (let i = pivotLeft; i < primary.length - pivotRight; i++) {
      const bar = primary[i];
      if (bar.time > anchorUnix) break;
      const cb = compAligned[i];
      if (!cb) continue;

      const ph = pivotHighAt(primary, i, pivotLeft, pivotRight);
      const pl = pivotLowAt(primary, i, pivotLeft, pivotRight);

      const compSlice = compAligned
        .slice(Math.max(0, i - pivotLeft), i + pivotRight + 1)
        .map((b) => (b ? { high: b.high, low: b.low } : { high: NaN, low: NaN }));

      if (ph != null) {
        const symPh = pivotHighAt(compSlice, pivotLeft, pivotLeft, pivotRight);
        if (lastPh && symPh != null && lastPh.symPrice != null) {
          if ((ph - lastPh.price) * (symPh - lastPh.symPrice) < 0) {
            events.push({
              kind: "bear",
              time: bar.time,
              startTime: lastPh.time,
              endTime: bar.time,
              label: `SMT − ${compLabel}`,
              color: "#2157f3",
            });
          }
        }
        lastPh = { price: ph, symPrice: symPh ?? cb.high, time: bar.time };
      }

      if (pl != null) {
        const symPl = pivotLowAt(compSlice, pivotLeft, pivotLeft, pivotRight);
        if (lastPl && symPl != null && lastPl.symPrice != null) {
          if ((pl - lastPl.price) * (symPl - lastPl.symPrice) < 0) {
            events.push({
              kind: "bull",
              time: bar.time,
              startTime: lastPl.time,
              endTime: bar.time,
              label: `SMT + ${compLabel}`,
              color: "#ff1100",
            });
          }
        }
        lastPl = { price: pl, symPrice: symPl ?? cb.low, time: bar.time };
      }
    }

    return events;
  }

  /** @param {string} symbol */
  static companionLabelFor(symbol) {
    return smtCompanionSymbol(symbol);
  }
}

export const buildSmtEvents = (...a) => SmtContext.buildSmtEvents(...a);
export const companionLabelFor = (...a) => SmtContext.companionLabelFor(...a);
