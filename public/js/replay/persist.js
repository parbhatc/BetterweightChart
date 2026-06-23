import { normalizeStepInterval } from "./menus.js";

const STORAGE_KEY = "bwc-replay-session";

/**
 * @typedef {object} ReplayPersistedSession
 * @property {boolean} active
 * @property {number} selectedBarTime
 * @property {number} currentBarTime
 * @property {number} fullEndBarTime
 * @property {number} speed
 * @property {string} stepInterval
 * @property {boolean} [autoSelectInterval]
 * @property {string} symbol
 * @property {string} resolution
 */

/** @returns {ReplayPersistedSession | null} */
export function loadReplaySession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !data.active) return null;
    if (!Number.isFinite(data.selectedBarTime) || !Number.isFinite(data.currentBarTime)) return null;
    return {
      active: true,
      selectedBarTime: Number(data.selectedBarTime),
      currentBarTime: Number(data.currentBarTime),
      fullEndBarTime: Number.isFinite(data.fullEndBarTime)
        ? Number(data.fullEndBarTime)
        : Number(data.currentBarTime),
      speed: Number(data.speed) || 1,
      stepInterval: normalizeStepInterval(
        typeof data.stepInterval === "string" ? data.stepInterval : "1",
      ),
      autoSelectInterval: data.autoSelectInterval !== false,
      symbol: String(data.symbol ?? ""),
      resolution: String(data.resolution ?? ""),
    };
  } catch {
    return null;
  }
}

/** @param {ReplayPersistedSession | null | undefined} session */
export function saveReplaySession(session) {
  try {
    if (session == null) return;
    if (!session.active) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore quota */
  }
}

export function clearReplaySession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {import("./mode.js").ReplayState} state
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 */
export function buildReplaySessionPayload(state, ctx) {
  if (!state.active || state.selectedBarTime == null || state.currentBarTime == null) {
    return null;
  }

  const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
  if (!pane?.bars?.length) return null;

  const snap = pane._replaySnapshot;
  const fullEndBarTime =
    snap?.liveEndBarTime ??
    ctx.replayLiveEndUtc ??
    pane._replayMarketEndUtc ??
    state.currentBarTime;

  return {
    active: true,
    selectedBarTime: state.selectedBarTime,
    currentBarTime: state.currentBarTime,
    fullEndBarTime,
    speed: state.speed,
    stepInterval: normalizeStepInterval(state.stepInterval),
    autoSelectInterval: state.autoSelectInterval !== false,
    symbol: pane.symbol ?? ctx.symbol ?? "",
    resolution: pane.resolution ?? ctx.resolution ?? "",
  };
}

/** @param {object[]} bars @param {number} utcTime */
export function barIndexAtOrBeforeUtcTime(bars, utcTime) {
  if (!bars?.length || utcTime == null || !Number.isFinite(utcTime)) return null;
  if (bars[0].time > utcTime) return null;

  let lo = 0;
  let hi = bars.length - 1;
  let best = bars[0].time <= utcTime ? 0 : null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= utcTime) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** @param {object[]} bars @param {number} utcTime */
export function barIndexForUtcTime(bars, utcTime) {
  if (!bars?.length || utcTime == null || !Number.isFinite(utcTime)) return null;
  const exact = bars.findIndex((b) => b.time === utcTime);
  if (exact >= 0) return exact;

  let bestIdx = 0;
  let bestDist = Math.abs(bars[0].time - utcTime);
  for (let i = 1; i < bars.length; i += 1) {
    const dist = Math.abs(bars[i].time - utcTime);
    if (dist < bestDist) {
      bestIdx = i;
      bestDist = dist;
    }
  }
  return bestIdx;
}

/** @param {object[]} bars @param {number} toTime */
export function trimBarsToUtcTime(bars, toTime) {
  if (!bars?.length || toTime == null || !Number.isFinite(toTime)) return bars;
  return bars.filter((b) => b.time <= toTime);
}

/**
 * Replay cursor lookup — bar open at or last bar before the instant (all timeframes).
 * @param {object[]} bars
 * @param {number} utcTime
 */
export function replayBarIndexForUtcTime(bars, utcTime) {
  return barIndexAtOrBeforeUtcTime(bars, utcTime);
}

/**
 * @param {number} anchorFrom earliest replay instant that must be in the load window
 * @param {number} loadTo right edge of history (live end during replay)
 * @param {number} barSec
 * @param {number} [minCount]
 */
export function estimateReplayCountBack(anchorFrom, loadTo, barSec, minCount = 50) {
  const sec = Math.max(1, Number(barSec) || 60);
  const end = Number(loadTo);
  const start = Number(anchorFrom);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return minCount;
  const span = Math.max(0, end - start);
  return Math.max(minCount, Math.ceil(span / sec) + 80);
}

/** @param {object[]} bars @param {number} anchorFrom @param {number} [barSec] */
export function barsCoverReplayAnchor(bars, anchorFrom, barSec) {
  if (!bars?.length || anchorFrom == null || !Number.isFinite(anchorFrom)) return false;
  if (bars[0].time > anchorFrom) return false;
  const lastTime = bars.at(-1).time;
  if (lastTime >= anchorFrom) return true;
  const sec = Number(barSec);
  if (Number.isFinite(sec) && sec > 0) {
    return lastTime + sec > anchorFrom;
  }
  return barIndexAtOrBeforeUtcTime(bars, anchorFrom) != null;
}
