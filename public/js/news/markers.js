import { etParts, hmToMinutes } from "../core/etTime.js";

/** @param {unknown} raw */
export function newsImpactKind(raw) {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("high")) return "high";
  if (value.includes("medium") || value.includes("moderate")) return "medium";
  return "low";
}

/** @param {object} event @param {object} settings */
function eventPassesMarkerFilters(event, settings) {
  const impacts = settings.displayImpacts ?? [];
  const currencies = settings.displayCurrencies ?? [];
  if (impacts.length && !impacts.includes(newsImpactKind(event.impact ?? event.importance))) return false;
  if (!currencies.length) return true;
  const currency = String(event.currency ?? event.country ?? "").trim().toUpperCase();
  return Boolean(currency && currencies.includes(currency));
}

/** @param {{ time: number }[]} bars */
function indexBarsByEtDay(bars) {
  const byDay = new Map();
  for (const bar of bars ?? []) {
    if (!bar || !Number.isFinite(bar.time)) continue;
    const parts = etParts(bar.time);
    let rows = byDay.get(parts.ymd);
    if (!rows) {
      rows = [];
      byDay.set(parts.ymd, rows);
    }
    rows.push({ time: bar.time, minute: parts.mod });
  }
  // Bar feeds are normally chronological, but sorting each small day bucket
  // keeps the binary search correct for custom/static feeds that are not.
  for (const rows of byDay.values()) rows.sort((a, b) => a.minute - b.minute || a.time - b.time);
  return byDay;
}

/** Snap an event to the closest loaded bar on its ET calendar day. */
function nearestBarTime(rows, targetMinute) {
  if (!rows?.length || !Number.isFinite(targetMinute)) return null;
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].minute < targetMinute) lo = mid + 1;
    else hi = mid;
  }
  if (lo <= 0) return rows[0].time;
  if (lo >= rows.length) return rows.at(-1).time;
  const before = rows[lo - 1];
  const after = rows[lo];
  return targetMinute - before.minute <= after.minute - targetMinute ? before.time : after.time;
}

/**
 * Convert cached calendar responses to reusable time-scale marker records.
 * Events sharing a release time are intentionally grouped into one marker.
 *
 * @param {object} opts
 * @param {{ time: number }[]} opts.bars UTC pane bars
 * @param {{ time?: { toChart?: (utc: number) => number } } | null} opts.timeAdapter
 * @param {Record<string, { events?: object[] }>} opts.newsByDay
 * @param {object} opts.settings
 */
export function buildNewsTimeScaleMarkers({ bars, timeAdapter, newsByDay, settings }) {
  if (settings?.enabled === false) return [];
  const barsByDay = indexBarsByEtDay(bars);
  const groups = new Map();

  for (const [day, payload] of Object.entries(newsByDay ?? {})) {
    const dayBars = barsByDay.get(day);
    if (!dayBars?.length) continue;
    for (const event of payload?.events ?? []) {
      if (!eventPassesMarkerFilters(event, settings ?? {})) continue;
      const hm = String(event.hmEt ?? "").trim();
      const minute = hmToMinutes(hm);
      if (minute == null || !Number.isFinite(minute)) continue;
      const utcTime = nearestBarTime(dayBars, minute);
      if (utcTime == null) continue;
      const chartTime = timeAdapter?.time?.toChart?.(utcTime) ?? utcTime;
      const key = `${day}|${hm}|${chartTime}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          id: `news:${day}:${hm}`,
          time: chartTime,
          utcTime,
          label: "⚡",
          color: "#a855f7",
          title: `News at ${event.timeLabel ?? hm}`,
          timeLabel: event.timeLabel ?? hm,
          events: [],
        };
        groups.set(key, group);
      }
      group.events.push(event);
    }
  }

  return [...groups.values()].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}
