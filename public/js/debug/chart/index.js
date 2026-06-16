/**
 * Opt-in chart debug logging for perf issues (lag, setData, pan, etc.)
 *
 * Enable:
 *   ?debug=1  or  ?debug=perf,tick,data
 *   localStorage.setItem("bwc-debug", "1")
 *   window.__BWC_DEBUG__.enable()
 *
 * @example
 * window.__BWC_DEBUG__.stats()   // counters + slow ops
 * window.__BWC_DEBUG__.clear()
 */

import { destroyDebugHud, ensureDebugHud } from "./hud.js";

const LS_KEY = "bwc-debug";

/** @type {Set<string>} */
let tags = new Set();
let enabled = false;
let slowMs = 8;
let verbose = false;

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

/**
 * @param {string} category perf | pan | data | tick | crosshair | session | whitespace | boot | drawings | context | layout
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

/** FPS sample while panning. */
export function createPanFpsMonitor(opts = {}) {
  const onSample = typeof opts.onSample === "function" ? opts.onSample : null;
  let rafId = 0;
  let frames = 0;
  let windowStart = 0;
  let lastHudAt = 0;
  /** @type {number[]} */
  const samples = [];

  function panFpsNow(now) {
    const elapsed = now - windowStart;
    if (elapsed <= 0 || frames <= 0) return 0;
    return Math.round((frames / elapsed) * 1000);
  }

  function emitHud(now, panning) {
    if (!onSample) return;
    const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : panFpsNow(now);
    onSample({ fps: panFpsNow(now), avgFps: avg, panning });
  }

  function tick() {
    frames += 1;
    const now = performance.now();
    if (onSample && now - lastHudAt >= 100) {
      lastHudAt = now;
      emitHud(now, true);
    }
    if (now - windowStart >= 1000) {
      samples.push(frames);
      if (samples.length > 12) samples.shift();
      chartDebug("pan", `fps ${frames}`, { avg: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) });
      frames = 0;
      windowStart = now;
      lastHudAt = 0;
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (!enabled || rafId) return;
      frames = 0;
      windowStart = performance.now();
      lastHudAt = 0;
      samples.length = 0;
      rafId = requestAnimationFrame(tick);
      onSample?.({ fps: 0, avgFps: 0, panning: true });
      chartDebug("pan", "pan start");
    },
    stop() {
      if (!rafId) return;
      cancelAnimationFrame(rafId);
      rafId = 0;
      const now = performance.now();
      const finalFps = panFpsNow(now);
      const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : finalFps;
      chartDebug("pan", "pan end", { lastFps: finalFps, avgFps: avg, samples: [...samples] });
      if (onSample) onSample({ fps: finalFps, avgFps: avg, panning: false });
    },
  };
}

export function getChartDebugStats() {
  return {
    enabled,
    tags: [...tags],
    slowMs,
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
export function installChartDebugGlobal() {
  if (typeof window === "undefined") return;
  if (window.__BWC_DEBUG__) return;
  window.__BWC_DEBUG__ = {
    enable: enableChartDebug,
    disable: disableChartDebug,
    stats: getChartDebugStats,
    clear: clearChartDebugStats,
    setVerbose: setChartDebugVerbose,
    setSlowMs: (ms) => {
      slowMs = Math.max(0, Number(ms));
    },
    log: chartDebug,
    isEnabled: isChartDebugEnabled,
  };
}
