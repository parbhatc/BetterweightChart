import { resolutionSec } from "../chart/resolutions.js";

/**
 * Aggregate lower-TF bars into one HTF candle open at htfOpenUtc through toUtc (inclusive).
 * @param {object[]} ltBars
 * @param {number} htfOpenUtc
 * @param {number} toUtc
 */
export function aggregateReplayFormingBar(ltBars, htfOpenUtc, toUtc) {
  if (!ltBars?.length || htfOpenUtc == null || toUtc == null) return null;

  const sub = ltBars.filter((b) => b.time >= htfOpenUtc && b.time <= toUtc);
  if (!sub.length) return null;

  let high = -Infinity;
  let low = Infinity;
  let volume = 0;
  for (const b of sub) {
    high = Math.max(high, b.high);
    low = Math.min(low, b.low);
    volume += b.volume ?? 0;
  }

  return {
    time: htfOpenUtc,
    open: sub[0].open,
    high,
    low,
    close: sub.at(-1).close,
    volume,
  };
}

/**
 * True when cursorUtc is still inside the HTF period opened at htfOpenUtc.
 * @param {number} cursorUtc
 * @param {number} htfOpenUtc actual HTF bar open from loaded series
 * @param {number} htfSec
 * @param {number} [ltSec] unused; kept for call-site compatibility
 */
export function replayHtfBarIsFormingAt(cursorUtc, htfOpenUtc, htfSec, ltSec) {
  void ltSec;
  if (cursorUtc == null || htfOpenUtc == null || !Number.isFinite(cursorUtc)) return false;
  if (cursorUtc < htfOpenUtc) return false;
  return cursorUtc < htfOpenUtc + htfSec;
}

/**
 * When switching from HTF to LT, map replay cursor to the last 1m open in the HTF bar
 * (TradingView: 15m at 8:45 → 1m latest bar 8:59).
 * @param {number} htfOpenUtc
 * @param {number} htfSec
 * @param {number} ltSec
 * @param {number | null | undefined} liveEndUtc
 */
export function replayLtCursorFromHtfBar(htfOpenUtc, htfSec, ltSec, liveEndUtc) {
  const lastLtOpen = htfOpenUtc + htfSec - Math.max(1, ltSec);
  let mapped = lastLtOpen;
  if (liveEndUtc != null && Number.isFinite(liveEndUtc)) {
    mapped = Math.min(liveEndUtc, mapped);
  }
  return Math.max(htfOpenUtc, mapped);
}

/**
 * Patch the HTF snapshot bar at cursor with OHLC aggregated from stashed LT bars.
 * Uses the loaded HTF bar's open time (exchange-aligned), not a synthetic alignBarTime.
 * @param {object} pane
 * @param {number} cursorUtc
 * @param {{ bars: object[] }} snap
 * @param {object[]} ltBars
 * @param {string} ltResolutionId
 * @param {(bars: object[], utc: number) => number | null} barIndexForTime
 */
export function patchReplayHtfFormingBar(pane, cursorUtc, snap, ltBars, ltResolutionId, barIndexForTime) {
  if (!snap?.bars?.length || !ltBars?.length || !ltResolutionId || !pane?.resolution) {
    return { ok: false, reason: "missingInput" };
  }

  const htfSec = resolutionSec(pane.resolution);
  const ltSec = resolutionSec(ltResolutionId);
  if (htfSec <= ltSec) return { ok: false, reason: "notHigherTf" };

  const idx = barIndexForTime(snap.bars, cursorUtc);
  if (idx == null) return { ok: false, reason: "noHtfIdx" };

  const htfOpen = snap.bars[idx].time;
  if (!replayHtfBarIsFormingAt(cursorUtc, htfOpen, htfSec, ltSec)) {
    return { ok: false, reason: "notForming", htfOpen };
  }

  const agg = aggregateReplayFormingBar(ltBars, htfOpen, cursorUtc);
  if (!agg) return { ok: false, reason: "noAgg", htfOpen, ltBars: ltBars.length };

  snap.bars[idx] = { ...snap.bars[idx], ...agg, time: htfOpen };
  return { ok: true, idx, htfOpen, close: agg.close, ltClose: ltBars.at(-1)?.close };
}
