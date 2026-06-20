import { createNewsClient } from "../../news/client.js";

/** @type {Map<string, { day: string, events: object[], error?: string }>} */
const cache = new Map();

/** @param {string} source @param {string} dayYmd @param {string[]} [types] */
function cacheKey(source, dayYmd, types) {
  return `${source}|${dayYmd}|${(types ?? []).join(",")}`;
}

/**
 * @param {string} dayYmd
 * @param {{ source?: string, types?: string[], baseUrl?: string }} [opts]
 */
export async function fetchNewsCalendarDay(dayYmd, opts = {}) {
  const source = opts.source ?? "forexfactory";
  const types = opts.types ?? [];
  const key = cacheKey(source, dayYmd, types);
  if (cache.has(key)) return cache.get(key);

  const client = createNewsClient(opts.baseUrl ?? "/news");
  const payload = await client.fetchCalendar(dayYmd, { source, types });
  cache.set(key, payload);
  return payload;
}

/**
 * @param {string} dayYmd
 * @param {{ source?: string, types?: string[] }} [opts]
 */
export function getCachedNewsDay(dayYmd, opts = {}) {
  const key = cacheKey(opts.source ?? "forexfactory", dayYmd, opts.types ?? []);
  return cache.get(key) ?? null;
}

/** @param {string[]} days @param {{ source?: string, types?: string[] }} [opts] */
export function newsDaysReady(days, opts = {}) {
  return days.every((day) => getCachedNewsDay(day, opts) != null);
}

/** @param {string} dayYmd @param {{ source?: string, types?: string[] }} [opts] */
export function newsDayPending(dayYmd, opts = {}) {
  return getCachedNewsDay(dayYmd, opts) == null;
}

export function clearNewsCache() {
  cache.clear();
}
