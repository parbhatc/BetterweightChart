import { resolutionSec } from "../chart/resolutions.js";
import { normalizeResolutionId, resolutionShortLabel } from "../chart/resolutionFormat.js";

/** @typedef {{ value: number, label: string, hint: string }} ReplaySpeedOption */

/** @type {ReadonlyArray<ReplaySpeedOption>} */
export const REPLAY_SPEED_OPTIONS = [
  { value: 10, label: "10x", hint: "10 upd per 1 sec" },
  { value: 7, label: "7x", hint: "7 upd per 1 sec" },
  { value: 5, label: "5x", hint: "5 upd per 1 sec" },
  { value: 3, label: "3x", hint: "3 upd per 1 sec" },
  { value: 1, label: "1x", hint: "1 upd per 1 sec" },
  { value: 0.5, label: "0.5x", hint: "1 upd per 2 sec" },
  { value: 0.3, label: "0.3x", hint: "1 upd per 3 sec" },
  { value: 0.2, label: "0.2x", hint: "1 upd per 5 sec" },
  { value: 0.1, label: "0.1x", hint: "1 upd per 10 sec" },
];

/** @typedef {{ id: string, label: string, sec: number }} ReplayStepOption */

/** @type {ReadonlyArray<ReplayStepOption>} */
export const REPLAY_STEP_BASE_OPTIONS = [
  { id: "tick", label: "1 tick", sec: 0 },
  { id: "1S", label: "1 second", sec: 1 },
];

/** @type {ReadonlyArray<ReplayStepOption>} */
export const REPLAY_STEP_RESOLUTION_OPTIONS = [
  { id: "1", label: "1 minute", sec: 60 },
  { id: "3", label: "3 minutes", sec: 180 },
  { id: "5", label: "5 minutes", sec: 300 },
  { id: "15", label: "15 minutes", sec: 900 },
  { id: "30", label: "30 minutes", sec: 1800 },
  { id: "45", label: "45 minutes", sec: 2700 },
  { id: "60", label: "1 hour", sec: 3600 },
  { id: "120", label: "2 hours", sec: 7200 },
  { id: "180", label: "3 hours", sec: 10800 },
  { id: "240", label: "4 hours", sec: 14400 },
  { id: "D", label: "1 day", sec: 86400 },
  { id: "W", label: "1 week", sec: 604800 },
  { id: "M", label: "1 month", sec: 2592000 },
];

const LEGACY_STEP_INTERVAL = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "1D": "D",
  "1W": "W",
  "1M": "M",
};

/** @param {string | undefined} id */
export function normalizeStepInterval(id) {
  if (!id) return "1";
  const legacy = LEGACY_STEP_INTERVAL[id];
  if (legacy) return legacy;
  if (id === "tick") return "tick";
  const norm = normalizeResolutionId(id);
  if (norm === "1S" || norm === "1s") return "1S";
  return norm;
}

/**
 * @param {ReadonlyArray<{ id: string, label?: string, sec?: number }> | string[] | undefined} availableResolutions
 * @returns {Set<string> | null}
 */
function allowedResolutionIds(availableResolutions) {
  if (!Array.isArray(availableResolutions) || !availableResolutions.length) return null;
  return new Set(
    availableResolutions.map((entry) =>
      normalizeResolutionId(typeof entry === "string" ? entry : entry.id),
    ),
  );
}

/** @param {Set<string>} allowed */
function tickResolutionAllowed(allowed) {
  return [...allowed].some((id) => id === "tick" || /^\d+T$/i.test(id));
}

/**
 * @param {string} chartResolutionId
 * @param {ReadonlyArray<{ id: string, label?: string, sec?: number }> | string[] | undefined} [availableResolutions]
 */
export function replayStepOptionsForChart(chartResolutionId, availableResolutions) {
  const chartSec = resolutionSec(chartResolutionId);
  const chartNorm = normalizeResolutionId(chartResolutionId);
  const allowed = allowedResolutionIds(availableResolutions);

  /** @type {ReplayStepOption[]} */
  let options;

  if (allowed) {
    /** @type {Map<string, ReplayStepOption>} */
    const byId = new Map(
      [...REPLAY_STEP_BASE_OPTIONS, ...REPLAY_STEP_RESOLUTION_OPTIONS]
        .filter((opt) => {
          if (opt.id === "tick") return tickResolutionAllowed(allowed);
          return allowed.has(normalizeResolutionId(opt.id));
        })
        .map((opt) => [opt.id, opt]),
    );

    for (const entry of availableResolutions) {
      const id = normalizeResolutionId(typeof entry === "string" ? entry : entry.id);
      if (byId.has(id)) continue;
      const sec =
        typeof entry === "object" && entry.sec != null ? entry.sec : resolutionSec(id);
      byId.set(id, { id, label: replayStepMenuLabel(id), sec });
    }

    options = [...byId.values()].filter((opt) => opt.id === "tick" || opt.sec <= chartSec);
  } else {
    const base = REPLAY_STEP_BASE_OPTIONS.filter((opt) => opt.sec <= chartSec || opt.id === "tick");
    const resolutionOpts = REPLAY_STEP_RESOLUTION_OPTIONS.filter((opt) => opt.sec <= chartSec);
    options = [...base, ...resolutionOpts];
  }

  if (chartSec > 0 && !options.some((opt) => opt.id === chartNorm)) {
    if (!allowed || allowed.has(chartNorm)) {
      options.push({ id: chartNorm, label: replayStepMenuLabel(chartNorm), sec: chartSec });
    }
  }

  const seen = new Set();
  return options
    .sort((a, b) => a.sec - b.sec)
    .filter((opt) => {
      if (seen.has(opt.id)) return false;
      seen.add(opt.id);
      return true;
    });
}

/**
 * @param {string} stepIntervalId
 * @param {string} chartResolutionId
 * @param {boolean} autoSelectInterval
 */
export function replayBarsPerStep(stepIntervalId, chartResolutionId, autoSelectInterval) {
  if (autoSelectInterval) return 1;
  const id = normalizeStepInterval(stepIntervalId);
  if (id === "tick") return 1;
  const chartSec = Math.max(1, resolutionSec(chartResolutionId));
  const stepSec =
    id === "1S" ? 1 : Math.max(1, resolutionSec(id));
  return Math.max(1, Math.round(stepSec / chartSec));
}

/** @param {number} speed */
export function replaySpeedLabel(speed) {
  const opt = REPLAY_SPEED_OPTIONS.find((o) => o.value === speed);
  if (opt) return opt.label;
  if (Number.isInteger(speed)) return `${speed}x`;
  return `${speed}x`;
}

/**
 * @param {string} stepIntervalId
 * @param {string} chartResolutionId
 * @param {boolean} autoSelectInterval
 */
export function replayStepIntervalButtonLabel(stepIntervalId, chartResolutionId, autoSelectInterval) {
  const id = autoSelectInterval ? normalizeResolutionId(chartResolutionId) : normalizeStepInterval(stepIntervalId);
  if (id === "tick") return "1t";
  return resolutionShortLabel(id);
}

/** @param {string} id */
export function replayStepMenuLabel(id) {
  const norm = normalizeStepInterval(id);
  const fixed = [...REPLAY_STEP_BASE_OPTIONS, ...REPLAY_STEP_RESOLUTION_OPTIONS].find(
    (o) => o.id === norm,
  );
  return fixed?.label ?? resolutionShortLabel(norm);
}

/** @param {number} speed */
export function replayPlayIntervalMs(speed) {
  return Math.max(120, Math.round(1000 / Math.max(0.05, speed)));
}
