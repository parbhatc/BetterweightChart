import { createFastTimezoneProvider } from "lightweight-charts";
import { chartOffsetSec, nextOffsetChangeAfter } from "./chartTime.js";

/** @type {Map<string, import("lightweight-charts").ITimezoneProvider>} */
const providerCache = new Map();

/**
 * Precompute sorted DST transitions for an IANA zone (Intl used once here, not in render loops).
 * @param {string} timeZone
 * @param {number} [fromSec]
 * @param {number} [toSec]
 * @returns {import("lightweight-charts").TimezoneTransition[]}
 */
export function buildTimezoneTransitions(timeZone, fromSec = 0, toSec = 2147483647) {
  if (timeZone === "Etc/UTC") {
    return [{ utcTimestamp: fromSec, offset: 0 }];
  }

  /** @type {import("lightweight-charts").TimezoneTransition[]} */
  const transitions = [];
  let t = fromSec;
  let offset = chartOffsetSec(t, timeZone);
  transitions.push({ utcTimestamp: t, offset });

  while (t < toSec) {
    const next = nextOffsetChangeAfter(t, timeZone, offset);
    if (!Number.isFinite(next) || next >= toSec) break;
    offset = chartOffsetSec(next, timeZone);
    transitions.push({ utcTimestamp: next, offset });
    t = next;
  }

  return transitions;
}

/**
 * Cached {@link FastTimezoneProvider} for chart options.
 * @param {string} timeZone
 */
export function createTimezoneProvider(timeZone) {
  const cached = providerCache.get(timeZone);
  if (cached) return cached;

  const provider = createFastTimezoneProvider(timeZone, buildTimezoneTransitions(timeZone));
  providerCache.set(timeZone, provider);
  return provider;
}

/** @param {string} [timeZone] */
export function invalidateTimezoneProviderCache(timeZone) {
  if (timeZone) providerCache.delete(timeZone);
  else providerCache.clear();
}

/**
 * Shift a UTC unix timestamp for display formatting (pseudo-UTC wall clock).
 * @param {number} utcSec
 * @param {import("lightweight-charts").ITimezoneProvider | undefined} provider
 */
export function displayTimestampFromUtc(utcSec, provider) {
  if (!provider || !Number.isFinite(utcSec)) return utcSec;
  return utcSec + provider.getOffset(utcSec);
}

/**
 * @param {number | { year: number, month: number, day: number }} t
 * @param {import("lightweight-charts").ITimezoneProvider | undefined} provider
 */
export function toDisplayTime(t, provider) {
  if (typeof t === "number" && Number.isFinite(t) && provider) {
    return displayTimestampFromUtc(t, provider);
  }
  return t;
}
