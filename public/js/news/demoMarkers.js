import { etParts } from "../core/etTime.js";

/** @param {number} hour @param {number} minute */
function timeLabel(hour, minute) {
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")}${suffix}`;
}

/**
 * Build one deterministic demo release on the last chart day. Keeping this
 * separate from the calendar cache prevents test data from leaking into real
 * news requests.
 *
 * @param {{ time: number }[]} bars UTC chart bars
 * @returns {{ day: string, event: object } | null}
 */
export function buildDemoNewsMarker(bars) {
  const validBars = (bars ?? []).filter((bar) => Number.isFinite(bar?.time));
  if (!validBars.length) return null;

  const lastDay = etParts(validBars.at(-1).time).ymd;
  const dayBars = validBars.filter((bar) => etParts(bar.time).ymd === lastDay);
  if (!dayBars.length) return null;

  // Keep the example close to the latest candle while leaving enough room for
  // its popup and count badge to remain visible beside the price scale.
  const target = dayBars[Math.max(0, dayBars.length - 20)];
  const parts = etParts(target.time);
  return {
    day: parts.ymd,
    event: {
      id: `codex-demo-news-${target.time}`,
      title: "Example High-Impact News Release",
      hmEt: parts.hm,
      timeLabel: timeLabel(parts.h, parts.min),
      impact: "High",
      currency: "USD",
      actual: "3.2%",
      forecast: "3.0%",
      previous: "2.8%",
      demo: true,
    },
  };
}
