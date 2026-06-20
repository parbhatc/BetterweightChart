/** @typedef {{ id: string, label: string, days?: number, hint?: string, dividerBefore?: boolean, icon?: boolean }} BacktestRangePreset */
/** @typedef {{ id: string, from?: number, to?: number, fromDate?: string, toDate?: string }} BacktestRange */

/** @type {BacktestRangePreset[]} */
export const BACKTEST_RANGE_PRESETS = [
  { id: "chart", label: "Range from chart", hint: "Default" },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "365d", label: "Last 365 days", days: 365 },
  { id: "entire", label: "Entire history" },
  { id: "custom", label: "Custom date range", dividerBefore: true, icon: true },
];

export const DEFAULT_BACKTEST_RANGE_ID = "90d";

/** Range presets ordered by how much history they need (most first). */
const RANGE_HISTORY_RANK = ["entire", "365d", "90d", "30d", "7d", "chart", "custom"];

/** @param {BacktestRange | string | null | undefined} range */
function resolveRange(range) {
  if (typeof range === "string") return { id: normalizeBacktestRangeId(range) };
  if (range && typeof range === "object") return { id: normalizeBacktestRangeId(range.id), ...range };
  return { id: DEFAULT_BACKTEST_RANGE_ID };
}

/** @param {BacktestRange | string} a @param {BacktestRange | string} b */
export function mergeBacktestRangeId(a, b) {
  const ra = rangeHistoryWeight(resolveRange(a));
  const rb = rangeHistoryWeight(resolveRange(b));
  return ra >= rb ? resolveRange(a) : resolveRange(b);
}

/** @param {BacktestRange} range */
function rangeHistoryWeight(range) {
  const id = normalizeBacktestRangeId(range.id);
  if (id === "custom" && range.from != null && range.to != null) {
    const days = (range.to - range.from) / 86400;
    if (days >= 350) return 1000;
    if (days >= 85) return 900;
    if (days >= 28) return 800;
    if (days >= 6) return 700;
    return 650;
  }
  const idx = RANGE_HISTORY_RANK.indexOf(id);
  return idx >= 0 ? (RANGE_HISTORY_RANK.length - idx) * 100 : 0;
}

/**
 * Left-edge Unix time (seconds) required for a backtest range.
 * @param {BacktestRange | string} range
 * @param {object[]} utcBars
 * @param {import("lightweight-charts").IChartApi | null | undefined} [chart]
 */
export function backtestRangeFromTime(range, utcBars, chart) {
  const r = resolveRange(range);
  const id = r.id;
  if (!utcBars?.length) return null;
  const lastTime = utcBars[utcBars.length - 1].time;

  if (id === "custom" && r.from != null) return r.from;

  if (id === "entire") return utcBars[0].time;

  if (id === "chart") {
    const visible = chartVisibleTimeRange(chart);
    return visible ? visible.from : utcBars[0].time;
  }

  const preset = BACKTEST_RANGE_PRESETS.find((p) => p.id === id);
  if (preset?.days) return lastTime - preset.days * 86400;

  return lastTime - 90 * 86400;
}

/** @param {BacktestRange | string} range @param {object[]} utcBars */
export function backtestRangeToTime(range, utcBars) {
  const r = resolveRange(range);
  const id = r.id;
  if (!utcBars?.length) return null;
  const lastTime = utcBars[utcBars.length - 1].time;
  if (id === "custom" && r.to != null) return r.to;
  if (id === "chart") return lastTime;
  return lastTime;
}

/**
 * @param {object[]} bars
 * @param {BacktestRange | string} range
 * @param {import("lightweight-charts").IChartApi | null | undefined} [chart]
 * @param {number} [barSec]
 */
export function paneCoversBacktestRange(bars, range, chart, barSec = 60) {
  if (!bars?.length) return false;
  return backtestRangeSatisfied(bars, range, chart, barSec);
}

/**
 * Minimum session bars expected for a backtest window (futures RTH ~6.5h).
 * @param {BacktestRange | string} range
 * @param {number} [barSec]
 */
export function estimateBarsForBacktestRange(range, barSec = 60) {
  const r = resolveRange(range);
  const id = r.id;
  const sec = Math.max(1, Number(barSec) || 60);
  const sessionBarsPerDay = Math.max(1, Math.floor((6.5 * 3600) / sec));

  if (id === "custom" && r.from != null && r.to != null) {
    return Math.max(sessionBarsPerDay, Math.ceil((r.to - r.from) / sec) * 0.5);
  }
  if (id === "entire") return Infinity;
  if (id === "chart") return sessionBarsPerDay * 2;

  const preset = BACKTEST_RANGE_PRESETS.find((p) => p.id === id);
  const days = preset?.days ?? 90;
  return Math.ceil(days * sessionBarsPerDay * 0.85);
}

/**
 * True when bars span the range start AND enough in-range session bars exist.
 * @param {object[]} bars
 * @param {BacktestRange | string} range
 * @param {import("lightweight-charts").IChartApi | null | undefined} [chart]
 * @param {number} [barSec]
 */
export function backtestRangeSatisfied(bars, range, chart, barSec = 60) {
  if (!bars?.length) return false;
  const r = resolveRange(range);
  const id = r.id;
  if (id === "entire") return false;

  const fromTime = backtestRangeFromTime(r, bars, chart);
  if (fromTime == null) return true;

  const slack = Math.max(60, barSec);
  if (bars[0].time > fromTime + slack) return false;

  const inRange = bars.filter((b) => b.time >= fromTime);
  const needed = estimateBarsForBacktestRange(r, barSec);
  if (!Number.isFinite(needed)) return true;
  return inRange.length >= needed;
}

/**
 * @param {BacktestRange | string} range
 * @param {number} barSec
 */
export function estimateBacktestPrepends(range, barSec) {
  const r = resolveRange(range);
  const id = r.id;
  if (id === "entire" || id === "chart") return 150;
  if (id === "custom" && r.from != null && r.to != null) {
    const sec = Math.max(1, Number(barSec) || 60);
    const barsNeeded = Math.ceil(Math.max(0, r.to - r.from) / sec);
    return Math.min(150, Math.ceil(barsNeeded / 2000) + 2);
  }
  const preset = BACKTEST_RANGE_PRESETS.find((p) => p.id === id);
  const days = preset?.days ?? 90;
  const sec = Math.max(1, Number(barSec) || 60);
  const barsNeeded = Math.ceil((days * 86400) / sec);
  return Math.min(150, Math.ceil(barsNeeded / 2000) + 2);
}

/** @param {string} [id] */
export function normalizeBacktestRangeId(id) {
  if (BACKTEST_RANGE_PRESETS.some((p) => p.id === id)) return id;
  return DEFAULT_BACKTEST_RANGE_ID;
}

/** @param {string} id */
export function backtestRangePresetLabel(id) {
  return BACKTEST_RANGE_PRESETS.find((p) => p.id === id)?.label ?? "Last 90 days";
}

/**
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {number} fromTime
 * @param {number} toTime
 */
function sliceByTime(utcBars, chartBars, fromTime, toTime) {
  if (!utcBars.length) return { utcBars: [], chartBars: [] };
  let start = 0;
  let end = utcBars.length - 1;
  for (let i = 0; i < utcBars.length; i++) {
    if (utcBars[i].time >= fromTime) {
      start = i;
      break;
    }
  }
  for (let i = utcBars.length - 1; i >= 0; i--) {
    if (utcBars[i].time <= toTime) {
      end = i;
      break;
    }
  }
  if (start > end) return { utcBars: [], chartBars: [] };
  const chartSeries = chartBars?.length === utcBars.length ? chartBars : utcBars;
  return {
    utcBars: utcBars.slice(start, end + 1),
    chartBars: chartSeries.slice(start, end + 1),
  };
}

/**
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {number} days
 */
function sliceLastDays(utcBars, chartBars, days) {
  if (!utcBars.length) return { utcBars: [], chartBars: [] };
  const lastTime = utcBars[utcBars.length - 1].time;
  const fromTime = lastTime - days * 86400;
  return sliceByTime(utcBars, chartBars, fromTime, lastTime);
}

/**
 * @param {import("lightweight-charts").IChartApi | null | undefined} chart
 * @returns {{ from: number, to: number } | null}
 */
export function chartVisibleTimeRange(chart) {
  if (!chart) return null;
  try {
    const range = chart.timeScale().getVisibleRange?.();
    if (!range || range.from == null || range.to == null) return null;
    const from = typeof range.from === "number" ? range.from : Number(range.from);
    const to = typeof range.to === "number" ? range.to : Number(range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return { from: Math.min(from, to), to: Math.max(from, to) };
  } catch {
    return null;
  }
}

/**
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {BacktestRange | string} range
 * @param {import("lightweight-charts").IChartApi | null | undefined} [chart]
 */
export function filterBacktestBars(utcBars, chartBars, range, chart) {
  const r = resolveRange(range);
  const id = r.id;
  const chartSeries = chartBars?.length === utcBars.length ? chartBars : utcBars;

  if (id === "entire") {
    return { utcBars: [...utcBars], chartBars: [...chartSeries] };
  }

  if (id === "custom" && r.from != null && r.to != null) {
    return sliceByTime(utcBars, chartSeries, r.from, r.to);
  }

  if (id === "chart") {
    const visible = chartVisibleTimeRange(chart);
    if (visible) return sliceByTime(utcBars, chartSeries, visible.from, visible.to);
    return { utcBars: [...utcBars], chartBars: [...chartSeries] };
  }

  const preset = BACKTEST_RANGE_PRESETS.find((p) => p.id === id);
  if (preset?.days) return sliceLastDays(utcBars, chartSeries, preset.days);

  return sliceLastDays(utcBars, chartSeries, 90);
}

/**
 * @param {BacktestRange | string} range
 * @param {object[]} bars
 * @param {string} [resolution]
 */
/** @param {number} unix @param {string} [timezone] */
function calendarParts(unix, timezone = "America/New_York") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date(unix * 1000)).split("-").map(Number);
  return { y, m, d };
}

/** @param {{ y: number, m: number, d: number }} parts @param {number} deltaDays */
function shiftCalendarDays(parts, deltaDays) {
  const dt = new Date(parts.y, parts.m - 1, parts.d);
  dt.setDate(dt.getDate() + deltaDays);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** @param {{ y: number, m: number, d: number }} parts */
function formatCalendarLong(parts) {
  return new Date(parts.y, parts.m - 1, parts.d).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * TradingView-style inclusive calendar period (e.g. March 22, 2026 – June 20, 2026).
 * @param {BacktestRange | string} range
 * @param {object[]} bars
 * @param {string} [timezone]
 */
export function backtestPeriodLabel(range, bars, timezone = "America/New_York") {
  const r = resolveRange(range);
  const fmtLong = (t) =>
    new Date(t * 1000).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const fmtIso = (iso) =>
    parseIsoLocal(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  if (r.id === "custom" && r.fromDate && r.toDate) return `${fmtIso(r.fromDate)} – ${fmtIso(r.toDate)}`;
  if (r.id === "custom" && r.from != null && r.to != null) return `${fmtLong(r.from)} – ${fmtLong(r.to)}`;

  const preset = BACKTEST_RANGE_PRESETS.find((p) => p.id === r.id);
  if (preset?.days && bars?.length) {
    const endParts = calendarParts(bars[bars.length - 1].time, timezone);
    const startParts = shiftCalendarDays(endParts, -(preset.days - 1));
    return `${formatCalendarLong(startParts)} – ${formatCalendarLong(endParts)}`;
  }

  if (bars?.length) {
    const from = backtestRangeFromTime(range, bars, null);
    const to = backtestRangeToTime(range, bars);
    if (from != null && to != null) {
      const startParts = calendarParts(from, timezone);
      const endParts = calendarParts(to, timezone);
      return `${formatCalendarLong(startParts)} – ${formatCalendarLong(endParts)}`;
    }
  }

  return backtestRangePresetLabel(r.id);
}

export function backtestRangeLabel(range, bars, resolution = "1") {
  const r = resolveRange(range);
  const id = r.id;
  if (id === "custom" && r.fromDate && r.toDate) {
    const fmt = (iso) =>
      parseIsoLocal(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(r.fromDate)} – ${fmt(r.toDate)}`;
  }
  if (id === "custom" && r.from != null && r.to != null) {
    const fmt = (t) =>
      new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(r.from)} – ${fmt(r.to)}`;
  }
  if (id !== "chart" && id !== "custom") {
    const preset = BACKTEST_RANGE_PRESETS.find((p) => p.id === id);
    if (preset) return preset.label;
  }

  if (!bars?.length) return backtestRangePresetLabel(id);
  const first = bars[0].time;
  const last = bars[bars.length - 1].time;
  const spanSec = Math.max(0, last - first);
  const days = spanSec / 86400;

  if (id === "chart") {
    if (days < 1.5 && resolution === "1") return "Range from chart";
    const fmt = (t) =>
      new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(first)} – ${fmt(last)}`;
  }

  if (days >= 85 && days <= 95) return "Last 90 days";
  if (days >= 28 && days <= 32) return "Last 30 days";
  if (days >= 6 && days <= 8) return "Last 7 days";
  if (days < 1.5 && resolution === "1") return "Last session";

  const fmt = (t) =>
    new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(first)} – ${fmt(last)}`;
}

/** @param {string} iso YYYY-MM-DD */
function parseIsoLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
