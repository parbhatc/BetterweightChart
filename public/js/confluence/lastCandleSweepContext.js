import { TF_MAP } from "../core/constants.js";
import { SessionOpen } from "../storage/sessionOpen.js";
import { aggregateBarsThroughAnchor } from "../session/sessionBarCache.js";
import { tradingWindowStartHm } from "../setups/setupGlobal.js";

/** @typedef {{ time: number; open: number; high: number; low: number; close: number }} OhlcBar */
/** @typedef {{
 *   bias: "Bullish" | "Bearish";
 *   lastBar: OhlcBar;
 *   sweepBar: OhlcBar;
 *   tf: string;
 *   kind: "low" | "high";
 *   time: number;
 *   label: string;
 *   price: number;
 * }} LastCandleSweepEvent */
/** @typedef {{
 *   refBar: OhlcBar | null;
 *   candidateBar: OhlcBar | null;
 *   sweep: LastCandleSweepEvent | null;
 *   entry: { time: number; price: number; side: string } | null;
 * }} RollingCrtState */

/** @param {string} tfKey */
function tfSec(tfKey) {
  return TF_MAP[tfKey] ?? TF_MAP["15m"] ?? 900;
}

/** @param {number} barTime @param {number} intervalSec */
export function bucketCompleteUnix(barTime, intervalSec) {
  return barTime + intervalSec - 60;
}

/** @param {number} barTime @param {number} atUnix @param {number} intervalSec */
function isBucketComplete(barTime, atUnix, intervalSec) {
  return barTime + intervalSec <= atUnix + 60;
}

/** @param {string} dayYmd @param {string} [startHm] */
export function lastCandleUnixForDay(dayYmd, startHm) {
  const hm = startHm ?? tradingWindowStartHm();
  return SessionOpen.hmToUnix(dayYmd, hm);
}

/** @param {OhlcBar} lastBar @param {OhlcBar} sweepBar */
export function qualifiesBullLowSweep(lastBar, sweepBar) {
  return sweepBar.low < lastBar.low && sweepBar.close > lastBar.close && sweepBar.high < lastBar.high;
}

/** @param {OhlcBar} lastBar @param {OhlcBar} sweepBar */
export function qualifiesBearHighSweep(lastBar, sweepBar) {
  return sweepBar.high > lastBar.high && sweepBar.close < lastBar.close && sweepBar.low > lastBar.low;
}

/** @param {number} unix */
function hmLabel(unix) {
  return SessionOpen.hmFromUnix(unix).replace(/^0/, "");
}

/**
 * @param {OhlcBar} lastBar
 * @param {OhlcBar} sweepBar
 * @param {string} tfKey
 * @param {"Bullish" | "Bearish"} bias
 * @param {"low" | "high"} kind
 */
function sweepEventFromPair(lastBar, sweepBar, tfKey, bias, kind) {
  return {
    bias,
    lastBar,
    sweepBar,
    tf: tfKey,
    kind,
    time: bucketCompleteUnix(sweepBar.time, tfSec(tfKey)),
    label: kind === "low" ? `${tfKey} Low` : `${tfKey} High`,
    price: kind === "low" ? lastBar.low : lastBar.high,
  };
}

/**
 * Rolling CRT: reference candle advances when the next HTF candle does not sweep,
 * or to the sweep candle after a completed entry. Session-open candle is only the first reference.
 *
 * @param {OhlcBar[]} bars1m
 * @param {number | null | undefined} anchorUnix
 * @param {string} dayYmd
 * @param {string} [tfKey]
 * @param {string} [chartTf]
 * @param {number} [afterEntryUnix] Entries at or before this time consume prior cycles.
 * @param {string} [startHm]
 * @returns {RollingCrtState}
 */
export function resolveRollingCrtState(
  bars1m,
  anchorUnix,
  dayYmd,
  tfKey = "15m",
  chartTf = "1m",
  afterEntryUnix = -Infinity,
  startHm,
) {
  const startUnix = lastCandleUnixForDay(dayYmd, startHm);
  const interval = tfSec(tfKey);
  if (startUnix == null || anchorUnix == null || !bars1m?.length) {
    return { refBar: null, candidateBar: null, sweep: null, entry: null };
  }

  const startComplete = bucketCompleteUnix(startUnix, interval);
  if (anchorUnix < startComplete) {
    return { refBar: null, candidateBar: null, sweep: null, entry: null };
  }

  const htfBars = aggregateBarsThroughAnchor(bars1m, anchorUnix, tfKey);
  let refBar = htfBars.find((b) => b.time === startUnix) ?? null;
  if (!refBar) return { refBar: null, candidateBar: null, sweep: null, entry: null };

  /** @type {LastCandleSweepEvent | null} */
  let activeSweep = null;
  /** @type {RollingCrtState["entry"]} */
  let activeEntry = null;
  /** @type {OhlcBar | null} */
  let pendingCandidate = null;

  for (const candidate of htfBars) {
    if (candidate.time <= refBar.time) continue;

    if (!isBucketComplete(candidate.time, anchorUnix, interval)) {
      pendingCandidate = candidate;
      break;
    }

    const bull = qualifiesBullLowSweep(refBar, candidate);
    const bear = qualifiesBearHighSweep(refBar, candidate);

    if (bull || bear) {
      const sweep = bull
        ? sweepEventFromPair(refBar, candidate, tfKey, "Bullish", "low")
        : sweepEventFromPair(refBar, candidate, tfKey, "Bearish", "high");
      const entry = findCloseAboveSweepEntry(bars1m, anchorUnix, sweep, chartTf);

      if (entry && entry.time <= afterEntryUnix) {
        refBar = candidate;
        activeSweep = null;
        activeEntry = null;
        continue;
      }

      activeSweep = sweep;
      activeEntry = entry;
      pendingCandidate = null;
      break;
    }

    refBar = candidate;
  }

  return {
    refBar,
    candidateBar: activeSweep?.sweepBar ?? pendingCandidate,
    sweep: activeSweep,
    entry: activeEntry,
  };
}

/**
 * Current rolling CRT reference candle (not always session open).
 *
 * @param {OhlcBar[]} bars1m
 * @param {number | null | undefined} anchorUnix
 * @param {string} dayYmd
 * @param {string} [tfKey]
 * @param {string} [startHm]
 * @param {number} [afterEntryUnix]
 * @returns {OhlcBar | null}
 */
export function findLastCandleBar(
  bars1m,
  anchorUnix,
  dayYmd,
  tfKey = "15m",
  startHm,
  afterEntryUnix = -Infinity,
) {
  return resolveRollingCrtState(bars1m, anchorUnix, dayYmd, tfKey, "1m", afterEntryUnix, startHm).refBar;
}

/**
 * Active sweep against the rolling CRT reference, if any.
 *
 * @param {OhlcBar[]} bars1m
 * @param {number | null | undefined} anchorUnix
 * @param {string} dayYmd
 * @param {string} [tfKey]
 * @param {string} [startHm]
 * @param {number} [afterEntryUnix]
 * @returns {LastCandleSweepEvent | null}
 */
export function findLastCandleSweep(
  bars1m,
  anchorUnix,
  dayYmd,
  tfKey = "15m",
  startHm,
  afterEntryUnix = -Infinity,
) {
  return resolveRollingCrtState(bars1m, anchorUnix, dayYmd, tfKey, "1m", afterEntryUnix, startHm).sweep;
}

/**
 * Entry when chart-TF candle closes fully above (bull) or below (bear) the sweep candle extreme.
 *
 * @param {OhlcBar[]} bars1m
 * @param {number | null | undefined} anchorUnix
 * @param {LastCandleSweepEvent | null | undefined} sweep
 * @param {string} [chartTf]
 */
export function findCloseAboveSweepEntry(bars1m, anchorUnix, sweep, chartTf = "1m") {
  if (!sweep?.sweepBar || anchorUnix == null) return null;

  const sweepComplete = bucketCompleteUnix(sweep.sweepBar.time, tfSec(sweep.tf));
  const interval = TF_MAP[chartTf] ?? 60;
  const agg = aggregateBarsThroughAnchor(bars1m, anchorUnix, chartTf);

  for (const bar of agg) {
    if (bar.time <= sweepComplete) continue;
    if (!isBucketComplete(bar.time, anchorUnix, interval)) continue;

    if (sweep.bias === "Bullish" && bar.close > sweep.sweepBar.high) {
      return { time: bar.time, price: bar.close, side: "long" };
    }
    if (sweep.bias === "Bearish" && bar.close < sweep.sweepBar.low) {
      return { time: bar.time, price: bar.close, side: "short" };
    }
  }
  return null;
}

/**
 * @param {OhlcBar[]} bars1m
 * @param {number | null | undefined} anchorUnix
 * @param {string} dayYmd
 * @param {string} [tfKey]
 * @param {string} [chartTf]
 * @param {number} [afterEntryUnix]
 */
export function buildLastCandleSweepCtx(
  bars1m,
  anchorUnix,
  dayYmd,
  tfKey = "15m",
  chartTf = "1m",
  afterEntryUnix = -Infinity,
) {
  const { refBar, candidateBar, sweep, entry } = resolveRollingCrtState(
    bars1m,
    anchorUnix,
    dayYmd,
    tfKey,
    chartTf,
    afterEntryUnix,
  );

  if (!refBar) {
    return {
      bias: "—",
      biasHint: "",
      lastCandleSweep: null,
      lastCandleSweepDone: false,
      closeAboveSweepDone: false,
      closeAboveSweepTime: null,
      entry: null,
      lastBar: null,
      sweepBar: null,
      sweepTf: tfKey,
    };
  }

  if (!sweep) {
    const refLabel = hmLabel(refBar.time);
    const waitLabel = candidateBar ? hmLabel(candidateBar.time) : "next";
    return {
      bias: "—",
      biasHint: `CRT ${refLabel} — waiting for ${waitLabel} ${tfKey} sweep`,
      lastCandleSweep: null,
      lastCandleSweepDone: false,
      closeAboveSweepDone: false,
      closeAboveSweepTime: null,
      entry: null,
      lastBar: refBar,
      sweepBar: null,
      sweepTf: tfKey,
    };
  }

  const lastLabel = hmLabel(sweep.lastBar.time);
  const sweepLabel = hmLabel(sweep.sweepBar.time);

  let biasHint;
  if (!entry) {
    biasHint =
      sweep.bias === "Bullish"
        ? `Bullish — ${sweepLabel} swept ${lastLabel} low · close above ${sweep.sweepBar.high.toFixed(2)}`
        : `Bearish — ${sweepLabel} swept ${lastLabel} high · close below ${sweep.sweepBar.low.toFixed(2)}`;
  } else {
    biasHint = `${sweep.bias} entry @ ${entry.price.toFixed(2)}`;
  }

  return {
    bias: sweep.bias,
    biasHint,
    lastCandleSweep: sweep,
    lastCandleSweepDone: true,
    closeAboveSweepDone: Boolean(entry),
    closeAboveSweepTime: entry?.time ?? null,
    entry,
    lastBar: sweep.lastBar,
    sweepBar: sweep.sweepBar,
    sweepTf: tfKey,
  };
}
