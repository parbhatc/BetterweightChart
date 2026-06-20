/** NQ / MNQ index tick size (0.25 index points). */
export const DEFAULT_TICK_SIZE = 0.25;

/**
 * @typedef {{ enabled: boolean; minTicks: number; maxTicks: number; tickSize?: number }} GapSizeFilter
 * @typedef {{ enabled: boolean; maxFormationCandles: number }} IfvgQualifyFilter
 * @typedef {{ enabled: boolean }} CompanionFvgFilter
 */

/** @param {number} top @param {number} bottom @param {number} [tickSize] */
export function gapSizeTicks(top, bottom, tickSize = DEFAULT_TICK_SIZE) {
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || tickSize <= 0) return 0;
  return Math.round(Math.abs(top - bottom) / tickSize);
}

/** @param {GapSizeFilter | null | undefined} filter @param {number} top @param {number} bottom */
export function gapPassesSizeFilter(filter, top, bottom) {
  if (!filter?.enabled) return true;
  const ticks = gapSizeTicks(top, bottom, filter.tickSize ?? DEFAULT_TICK_SIZE);
  return ticks >= filter.minTicks && ticks <= filter.maxTicks;
}

/** @param {unknown} raw @param {{ enabled: boolean; minTicks: number; maxTicks: number }} defaults */
export function normalizeGapSizeFilter(raw, defaults) {
  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const minTicks = Number(r.minTicks);
  const maxTicks = Number(r.maxTicks);
  return {
    enabled: r.enabled !== false && defaults.enabled !== false,
    minTicks: Number.isFinite(minTicks) && minTicks >= 0 ? minTicks : defaults.minTicks,
    maxTicks: Number.isFinite(maxTicks) && maxTicks > 0 ? maxTicks : defaults.maxTicks,
    tickSize: DEFAULT_TICK_SIZE,
  };
}

/** @param {unknown} raw @param {{ enabled: boolean; maxFormationCandles: number }} defaults */
export function normalizeIfvgQualifyFilter(raw, defaults) {
  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const maxFormationCandles = Number(r.maxFormationCandles);
  return {
    enabled: r.enabled !== false && defaults.enabled !== false,
    maxFormationCandles:
      Number.isFinite(maxFormationCandles) && maxFormationCandles > 0
        ? maxFormationCandles
        : defaults.maxFormationCandles,
  };
}

/**
 * Merge per-setup override onto global (null/undefined fields inherit global).
 * @template T
 * @param {Partial<T> | null | undefined} global
 * @param {Partial<T> | null | undefined} setup
 * @param {(g: Partial<T>, s: Partial<T>) => T} mergeFn
 */
export function mergeSetupFilter(global, setup, mergeFn) {
  if (!setup || typeof setup !== "object") return mergeFn(global ?? {}, {});
  return mergeFn(global ?? {}, setup);
}

/** @param {GapSizeFilter} g @param {Partial<GapSizeFilter>} s */
export function mergeGapSizeFilter(g, s) {
  return {
    enabled: s.enabled != null ? s.enabled !== false : g.enabled,
    minTicks: s.minTicks != null && Number.isFinite(Number(s.minTicks)) ? Number(s.minTicks) : g.minTicks,
    maxTicks: s.maxTicks != null && Number.isFinite(Number(s.maxTicks)) ? Number(s.maxTicks) : g.maxTicks,
    tickSize: g.tickSize ?? DEFAULT_TICK_SIZE,
  };
}

/** @param {IfvgQualifyFilter} g @param {Partial<IfvgQualifyFilter>} s */
export function mergeIfvgQualifyFilter(g, s) {
  return {
    enabled: s.enabled != null ? s.enabled !== false : g.enabled,
    maxFormationCandles:
      s.maxFormationCandles != null && Number.isFinite(Number(s.maxFormationCandles))
        ? Number(s.maxFormationCandles)
        : g.maxFormationCandles,
  };
}

/** 1m bars from FVG middle candle to inversion bar (inclusive). */
export function formationCandlesBetween(middleTime, inversionTime) {
  if (!Number.isFinite(middleTime) || !Number.isFinite(inversionTime)) return Infinity;
  return Math.max(0, Math.round((inversionTime - middleTime) / 60));
}

/** @param {unknown} raw @param {{ enabled: boolean }} defaults */
export function normalizeCompanionFvgFilter(raw, defaults) {
  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  if (r.enabled === true) return { enabled: true };
  if (r.enabled === false) return { enabled: false };
  return { enabled: defaults.enabled === true };
}

/** @param {CompanionFvgFilter} g @param {Partial<CompanionFvgFilter>} s */
export function mergeCompanionFvgFilter(g, s) {
  return {
    enabled: s.enabled != null ? s.enabled === true : g.enabled,
  };
}
