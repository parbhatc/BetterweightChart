/**
 * Opt-in chart debug logging for perf issues (lag, setData, pan, etc.)
 *
 * Enable:
 *   ?debug=1  or  ?debug=perf,pan,zoom,viewport,data
 *   localStorage.setItem("bwc-debug", "1")
 *   window.__BWC_DEBUG__.enable()
 *
 * @example
 * window.__BWC_DEBUG__.stats()   // counters + slow ops
 * window.__BWC_DEBUG__.clear()
 * window.__BWC_DEBUG__.setFormingLogs(false)  // persisted as bwc-debug-forming in localStorage
 */

import { destroyDebugHud, ensureDebugHud } from "./hud.js";
import {
  getLiveControlStatus,
  pauseFormingUpdates,
  pauseLiveBars,
  pauseNewBarUpdates,
  resumeFormingUpdates,
  resumeLiveBars,
  resumeNewBarUpdates,
  setFormingCoalesce,
} from "./liveControl.js";

const LS_KEY = "bwc-debug";
const LS_FORMING_KEY = "bwc-debug-forming";

/** @type {Set<string>} */
let tags = new Set();
let enabled = false;
let slowMs = 8;
let verbose = false;
/** Live tick / forming-bar patch logs (very noisy when `data` debug is on). */
let formingLogs = true;

function readStoredFormingLogs() {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(LS_FORMING_KEY);
    if (stored === "0" || stored === "false") formingLogs = false;
    else if (stored === "1" || stored === "true") formingLogs = true;
  } catch {
    //
  }
}

function writeStoredFormingLogs(on) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_FORMING_KEY, on ? "1" : "0");
  } catch {
    //
  }
}

readStoredFormingLogs();

/** @type {Record<string, number>} */
const counters = {};
/** @type {{ at: number, cat: string, label: string, ms: number, detail?: unknown }[]} */
const slowLog = [];
const SLOW_LOG_MAX = 80;

function parseTags(raw) {
  if (!raw || raw === "1" || raw === "true") return new Set(["*"]);
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
}

function tagAllowed(category) {
  if (!enabled) return false;
  if (tags.has("*")) return true;
  return tags.has(category.toLowerCase());
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.force]
 * @param {string} [opts.tags]
 * @param {number} [opts.slowMs]
 */
export function configureChartDebug(opts = {}) {
  if (opts.slowMs != null) slowMs = Math.max(0, Number(opts.slowMs));
  if (opts.tags != null) tags = parseTags(opts.tags);
  readStoredFormingLogs();

  if (opts.force != null) {
    enabled = Boolean(opts.force);
    return enabled;
  }

  if (typeof window !== "undefined") {
    if (window.__BWC_DEBUG_FORCE__ === true) {
      enabled = true;
      return true;
    }
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        enabled = true;
        tags = parseTags(stored);
        return true;
      }
    } catch {
      //
    }
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("debug");
    if (q != null && q !== "0" && q !== "false") {
      enabled = true;
      tags = parseTags(q);
      try {
        localStorage.setItem(LS_KEY, q === "1" ? "1" : q);
      } catch {
        //
      }
      return true;
    }
  }

  enabled = false;
  return false;
}

export function isChartDebugEnabled() {
  return enabled;
}

export function setChartDebugVerbose(on = true) {
  verbose = on;
}

/** Toggle `[BWC:data] update forming` logs (on by default when data debug is enabled). Persists in localStorage. */
export function setChartDebugFormingLogs(on = true) {
  formingLogs = Boolean(on);
  writeStoredFormingLogs(formingLogs);
}

export function chartDebugFormingEnabled() {
  return formingLogs;
}

/**
 * Forming-bar live tick logs — gated by {@link setChartDebugFormingLogs}.
 * @param {string} message
 * @param {unknown} [detail]
 */
export function chartDebugForming(message, detail) {
  if (!formingLogs || !tagAllowed("data")) return;
  chartDebug("data", message, detail);
}

/**
 * @param {string} category perf | pan | zoom | viewport | data | tick | crosshair | session | whitespace | boot | drawings | context | layout | fvg | levels | smt | replay
 * @param {string} message
 * @param {unknown} [detail]
 */
export function chartDebug(category, message, detail) {
  if (!tagAllowed(category)) return;
  const prefix = `%c[BWC:${category}]`;
  const style = "color:#7b9cff;font-weight:600";
  if (detail !== undefined) console.log(prefix, style, message, detail);
  else console.log(prefix, style, message);
}

/**
 * @param {string} category
 * @param {string} [label]
 */
/** @type {Map<string, number>} */
const throttleAt = new Map();

/**
 * Log at most once per `intervalMs` per key (avoids mousemove spam).
 * @param {string} category
 * @param {string} key
 * @param {string} message
 * @param {unknown} [detail]
 * @param {number} [intervalMs]
 */
export function chartDebugThrottle(category, key, message, detail, intervalMs = 400) {
  if (!tagAllowed(category)) return;
  const now = performance.now();
  const throttleKey = `${category}:${key}`;
  const last = throttleAt.get(throttleKey) ?? 0;
  if (now - last < intervalMs) return;
  throttleAt.set(throttleKey, now);
  chartDebug(category, message, detail);
}

export function chartDebugCount(category, label = "tick") {
  if (!enabled) return;
  const key = `${category}:${label}`;
  counters[key] = (counters[key] ?? 0) + 1;
  if (verbose && tagAllowed(category)) {
    chartDebug(category, `count ${key} = ${counters[key]}`);
  }
}

/**
 * @param {string} category
 * @param {string} label
 * @param {() => T} fn
 * @returns {T}
 * @template T
 */
export function chartDebugTime(category, label, fn) {
  if (!enabled) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const ms = performance.now() - t0;
    if (ms >= slowMs) recordSlow(category, label, ms);
    if (verbose && tagAllowed(category)) chartDebug(category, `${label} ${ms.toFixed(2)}ms`);
  }
}

/**
 * @param {string} category
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function chartDebugTimeAsync(category, label, fn) {
  if (!enabled) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - t0;
    if (ms >= slowMs) recordSlow(category, label, ms);
    if (verbose && tagAllowed(category)) chartDebug(category, `${label} ${ms.toFixed(2)}ms`);
  }
}

function recordSlow(category, label, ms, detail) {
  chartDebugCount("perf", "slow");
  const entry = { at: Date.now(), cat: category, label, ms, detail };
  slowLog.push(entry);
  if (slowLog.length > SLOW_LOG_MAX) slowLog.shift();
  if (tagAllowed("perf") || tagAllowed(category)) {
    console.warn(`[BWC:slow] ${category} ${label} ${ms.toFixed(1)}ms`, detail ?? "");
  }
}

/** FPS sample while panning / zooming the viewport. */
export function createPanFpsMonitor(opts = {}) {
  const onSample = typeof opts.onSample === "function" ? opts.onSample : null;
  let rafId = 0;
  let frames = 0;
  let windowStart = 0;
  let lastHudAt = 0;
  /** @type {number[]} */
  const samples = [];
  /** @type {Set<string>} */
  const activeModes = new Set();

  function fpsNow(now) {
    const elapsed = now - windowStart;
    if (elapsed <= 0 || frames <= 0) return 0;
    return Math.round((frames / elapsed) * 1000);
  }

  function emitHud(now) {
    if (!onSample) return;
    const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : fpsNow(now);
    onSample({
      fps: fpsNow(now),
      avgFps: avg,
      panning: activeModes.has("pan"),
      zooming: activeModes.has("zoom"),
      modes: [...activeModes],
    });
  }

  function tick() {
    frames += 1;
    const now = performance.now();
    if (onSample && now - lastHudAt >= 100) {
      lastHudAt = now;
      emitHud(now);
    }
    if (now - windowStart >= 1000) {
      samples.push(frames);
      if (samples.length > 12) samples.shift();
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      const cat = activeModes.has("pan") && activeModes.has("zoom") ? "viewport" : activeModes.has("zoom") ? "zoom" : "pan";
      chartDebug(cat, `fps ${frames}`, { avg, modes: [...activeModes] });
      if (activeModes.has("pan") && activeModes.has("zoom") && frames < 90) {
        chartDebugThrottle("viewport", "lowFps", "low fps during pan+zoom", { fps: frames, avg, modes: [...activeModes] }, 800);
      } else if (activeModes.has("pan") && frames < 90) {
        chartDebugThrottle("viewport", "lowPanFps", "low fps during pan", { fps: frames, avg, modes: [...activeModes] }, 800);
      }
      frames = 0;
      windowStart = now;
      lastHudAt = 0;
    }
    rafId = requestAnimationFrame(tick);
  }

  function ensureRaf() {
    if (!enabled || rafId) return;
    frames = 0;
    windowStart = performance.now();
    lastHudAt = 0;
    samples.length = 0;
    rafId = requestAnimationFrame(tick);
    emitHud(performance.now());
  }

  function stopRafIfIdle() {
    if (activeModes.size > 0 || !rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /**
   * @param {string} [mode] pan | zoom
   */
  function start(mode = "pan") {
    const wasEmpty = activeModes.size === 0;
    activeModes.add(mode);
    if (!enabled) return;
    ensureRaf();
    if (wasEmpty) {
      onSample?.({ fps: 0, avgFps: 0, panning: activeModes.has("pan"), zooming: activeModes.has("zoom"), modes: [...activeModes] });
    }
    chartDebug(mode === "zoom" ? "zoom" : "pan", `${mode} start`, { modes: [...activeModes] });
    if (activeModes.has("pan") && activeModes.has("zoom")) {
      chartDebug("viewport", "pan+zoom overlap", { modes: [...activeModes] });
    }
  }

  /**
   * @param {string} [mode] pan | zoom
   */
  function stop(mode = "pan") {
    if (!activeModes.has(mode)) return;
    activeModes.delete(mode);
    const now = performance.now();
    const finalFps = fpsNow(now);
    const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : finalFps;
    chartDebug(mode === "zoom" ? "zoom" : "pan", `${mode} end`, {
      lastFps: finalFps,
      avgFps: avg,
      samples: [...samples],
      modes: [...activeModes],
    });
    if (activeModes.size === 0) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (onSample) {
        onSample({ fps: finalFps, avgFps: avg, panning: false, zooming: false, modes: [] });
      }
    } else {
      emitHud(now);
    }
    stopRafIfIdle();
  }

  return {
    start,
    stop,
    activeModes: () => [...activeModes],
  };
}

export function getChartDebugStats() {
  return {
    enabled,
    tags: [...tags],
    slowMs,
    formingLogs,
    counters: { ...counters },
    slowOps: [...slowLog],
  };
}

export function clearChartDebugStats() {
  for (const k of Object.keys(counters)) delete counters[k];
  slowLog.length = 0;
  chartDebug("boot", "debug stats cleared");
}

export function enableChartDebug(tagList = "1") {
  try {
    localStorage.setItem(LS_KEY, tagList);
  } catch {
    //
  }
  configureChartDebug({ force: true, tags: tagList });
  ensureDebugHud();
  chartDebug("boot", "debug enabled", { tags: [...tags], slowMs });
}

export function disableChartDebug() {
  enabled = false;
  destroyDebugHud();
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    //
  }
  console.info("[BWC] debug disabled (reload to fully detach)");
}

export { destroyDebugHud, ensureDebugHud, mountDebugHud } from "./hud.js";
export {
  getLiveControlStatus,
  installLiveControlGlobal,
  isFormingUpdatesPaused,
  isLiveBarsPaused,
  isNewBarsPaused,
  pauseFormingUpdates,
  pauseLiveBars,
  pauseNewBarUpdates,
  registerLivePauseHook,
  resumeAllLiveControls,
  resumeFormingUpdates,
  resumeLiveBars,
  resumeNewBarUpdates,
  setFormingCoalesce,
  shouldCoalesceFormingUpdates,
} from "./liveControl.js";
export function installChartDebugGlobal() {
  if (typeof window === "undefined") return;
  if (window.__BWC_DEBUG__) return;
  window.__BWC_DEBUG__ = {
    enable: enableChartDebug,
    disable: disableChartDebug,
    stats: getChartDebugStats,
    clear: clearChartDebugStats,
    setVerbose: setChartDebugVerbose,
    setFormingLogs: setChartDebugFormingLogs,
    setSlowMs: (ms) => {
      slowMs = Math.max(0, Number(ms));
    },
    pauseLive: pauseLiveBars,
    resumeLive: resumeLiveBars,
    pauseForming: pauseFormingUpdates,
    resumeForming: resumeFormingUpdates,
    pauseNewBars: pauseNewBarUpdates,
    resumeNewBars: resumeNewBarUpdates,
    setFormingCoalesce,
    liveStatus: getLiveControlStatus,
    log: chartDebug,
    isEnabled: isChartDebugEnabled,
  };
}
