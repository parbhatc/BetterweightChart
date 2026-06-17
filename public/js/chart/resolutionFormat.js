/** @typedef {{ id: string, label: string, sec: number }} ResolutionDef */

const MONTH_SEC = 2592000;

/**
 * @param {string} id
 * @returns {string}
 */
export function normalizeResolutionId(id) {
  const s = String(id ?? "").trim();
  if (!s) return s;
  if (s === "1D") return "D";
  if (s === "1W") return "W";
  if (s === "1M") return "M";
  return s;
}

/**
 * @param {string} id
 * @returns {number | null}
 */
export function resolutionSec(id) {
  const s = normalizeResolutionId(id);
  if (!s) return null;

  if (s === "D") return 86400;
  if (s === "W") return 604800;
  if (s === "M") return MONTH_SEC;

  const tick = /^(\d+)T$/i.exec(s);
  if (tick) return 1;

  const sec = /^(\d+)S$/i.exec(s);
  if (sec) return Number(sec[1]);

  const days = /^(\d+)D$/i.exec(s);
  if (days) return Number(days[1]) * 86400;

  const weeks = /^(\d+)W$/i.exec(s);
  if (weeks) return Number(weeks[1]) * 604800;

  const months = /^(\d+)M$/i.exec(s);
  if (months) return Number(months[1]) * MONTH_SEC;

  if (/^\d+$/.test(s)) return Number(s) * 60;

  return null;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isValidResolutionId(id) {
  return resolutionSec(id) != null;
}

/**
 * @param {number} value
 * @param {"T"|"S"|"m"|"h"|"D"|"W"|"M"} unit
 * @returns {string | null}
 */
export function buildResolutionId(value, unit) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return null;

  if (unit === "T") return `${n}T`;
  if (unit === "S") return `${n}S`;
  if (unit === "m") return String(n);
  if (unit === "h") return String(n * 60);
  if (unit === "D") return n === 1 ? "D" : `${n}D`;
  if (unit === "W") return n === 1 ? "W" : `${n}W`;
  if (unit === "M") return n === 1 ? "M" : `${n}M`;
  return null;
}

/** @typedef {"m"|"h"|"D"|"W"|"M"} CustomIntervalUnit */

/** Per-unit max for the custom interval dialog (TradingView-style). */
export const CUSTOM_INTERVAL_LIMITS = {
  m: 10000,
  h: 240,
  D: 365,
  W: 52,
  M: 12,
};

/**
 * @param {number} value
 * @param {CustomIntervalUnit} unit
 * @param {string[]} [existingIds]
 * @returns {{ ok: true, id: string } | { ok: false, message: string | null }}
 */
export function validateCustomInterval(value, unit, existingIds = []) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, message: null };
  }

  const max = CUSTOM_INTERVAL_LIMITS[unit];
  if (max == null || n > max) {
    return { ok: false, message: "Interval value is too big, please try again" };
  }

  const id = buildResolutionId(n, unit);
  if (!id || !isValidResolutionId(id)) {
    return { ok: false, message: "Interval value is too big, please try again" };
  }

  const norm = normalizeResolutionId(id);
  const exists = existingIds.some((existing) => normalizeResolutionId(existing) === norm);
  if (exists) {
    return { ok: false, message: "Interval already exists, please use a different value" };
  }

  return { ok: true, id: norm };
}

/**
 * @param {string} id
 * @returns {string}
 */
export function resolutionShortLabel(id) {
  const s = normalizeResolutionId(id);
  if (s === "D") return "1D";
  if (s === "W") return "1W";
  if (s === "M") return "1M";

  const tick = /^(\d+)T$/i.exec(s);
  if (tick) return `${tick[1]}t`;

  const sec = /^(\d+)S$/i.exec(s);
  if (sec) return `${sec[1]}s`;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n % 60 === 0 && n >= 60) return `${n / 60}h`;
    return `${n}m`;
  }

  return s;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function resolutionDisplayTitle(id) {
  const s = normalizeResolutionId(id);
  if (s === "D") return "1 day";
  if (s === "W") return "1 week";
  if (s === "M") return "1 month";

  const tick = /^(\d+)T$/i.exec(s);
  if (tick) return `${tick[1]} tick${tick[1] === "1" ? "" : "s"}`;

  const sec = /^(\d+)S$/i.exec(s);
  if (sec) return `${sec[1]} second${sec[1] === "1" ? "" : "s"}`;

  const days = /^(\d+)D$/i.exec(s);
  if (days) return `${days[1]} day${days[1] === "1" ? "" : "s"}`;

  const weeks = /^(\d+)W$/i.exec(s);
  if (weeks) return `${weeks[1]} week${weeks[1] === "1" ? "" : "s"}`;

  const months = /^(\d+)M$/i.exec(s);
  if (months) return `${months[1]} month${months[1] === "1" ? "" : "s"}`;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n % 60 === 0 && n >= 60) {
      const h = n / 60;
      return `${h} hour${h === 1 ? "" : "s"}`;
    }
    return `${n} minute${n === 1 ? "" : "s"}`;
  }

  return s;
}

/** @param {string} id */
export function resolutionGroupId(id) {
  const s = normalizeResolutionId(id);
  if (/^\d+T$/i.test(s)) return "ticks";
  if (/^\d+S$/i.test(s)) return "seconds";
  if (s === "D" || s === "W" || s === "M" || /^\d+D$/i.test(s) || /^\d+W$/i.test(s) || /^\d+M$/i.test(s)) return "days";
  const sec = resolutionSec(s);
  if (sec != null && sec >= 3600 && sec < 86400) return "hours";
  return "minutes";
}

/**
 * @param {string} id
 * @returns {ResolutionDef}
 */
export function resolutionDef(id) {
  const norm = normalizeResolutionId(id);
  const sec = resolutionSec(norm) ?? 60;
  return {
    id: norm,
    label: resolutionShortLabel(norm),
    sec,
  };
}

/**
 * @param {ResolutionDef[]} list
 * @returns {ResolutionDef[]}
 */
export function sortResolutions(list) {
  const order = { ticks: 0, seconds: 1, minutes: 2, hours: 3, days: 4 };
  return [...list].sort((a, b) => {
    const ga = order[resolutionGroupId(a.id)] ?? 9;
    const gb = order[resolutionGroupId(b.id)] ?? 9;
    if (ga !== gb) return ga - gb;
    return a.sec - b.sec;
  });
}

/**
 * @param {ResolutionDef[]} base
 * @param {ResolutionDef[]} extra
 * @returns {ResolutionDef[]}
 */
export function mergeResolutionLists(base, extra) {
  const map = new Map();
  for (const r of base) map.set(r.id, r);
  for (const r of extra) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  return sortResolutions([...map.values()]);
}
