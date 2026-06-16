import { TickMarkType, PriceScaleMode } from "lightweight-charts";
import {
  formatAxisDateTick,
  formatAxisMonthTick,
  formatAxisTimeTick,
  formatChartTimeLabel,
} from "../time/labelFormat.js";
import { toDate } from "../format.js";

/** @param {string | undefined} mode */
export function isScaleVisible(mode) {
  return mode !== "alwaysOff";
}

/** @param {string | undefined} placement */
export function resolvePriceScalePlacement(placement) {
  switch (placement) {
    case "left":
      return { left: true, right: false };
    case "right":
      return { left: false, right: true };
    default:
      return { left: false, right: true };
  }
}

/**
 * @param {object} scales
 * @param {{ timeZone?: string, chartTimeToUtc?: (chartSec: number) => number }} [opts]
 */
export function buildTimeScaleFormatters(scales, opts = {}) {
  const axisZone = "UTC";
  const labelZone = opts.timeZone ?? axisZone;
  const toUtc = opts.chartTimeToUtc;

  const timeFormatter = (t) => {
    const unix = typeof t === "number" && toUtc ? toUtc(t) : t;
    return formatChartTimeLabel(unix, scales, labelZone, { includeTime: true });
  };

  const tickMarkFormatter = (time, tickMarkType) => {
    const d = toDate(time);

    switch (tickMarkType) {
      case TickMarkType.Year:
        return new Intl.DateTimeFormat("en-US", { timeZone: axisZone, year: "numeric" }).format(d);
      case TickMarkType.Month:
        return formatAxisMonthTick(time, scales, axisZone);
      case TickMarkType.DayOfMonth:
        return formatAxisDateTick(time, scales, axisZone);
      case TickMarkType.Time:
        return formatAxisTimeTick(d, axisZone, scales);
      case TickMarkType.TimeWithSeconds:
        return formatAxisTimeTick(d, axisZone, scales, true);
      default:
        return formatAxisDateTick(time, scales, axisZone);
    }
  };

  return { timeFormatter, tickMarkFormatter };
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {HTMLElement} chartEl
 * @param {number} clientX
 * @param {number} clientY
 * @returns {"left" | "right" | null}
 */
export function hitPriceScale(chart, chartEl, clientX, clientY) {
  const rect = chartEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const rw = chart.priceScale("right").width();
  const lw = chart.priceScale("left").width();
  if (rw > 0 && x >= rect.width - rw - 1) return "right";
  if (lw > 0 && x <= lw + 1) return "left";
  return null;
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {HTMLElement} chartEl
 * @param {number} clientX
 * @param {number} clientY
 */
export function hitTimeScale(chart, chartEl, clientX, clientY) {
  if (hitPriceScale(chart, chartEl, clientX, clientY)) return false;
  const rect = chartEl.getBoundingClientRect();
  const y = clientY - rect.top;
  const th = chart.timeScale().height();
  if (th <= 0) return false;
  return y >= rect.height - th - 1;
}

/** @param {object} scales */
export function resolvePriceScaleModeKey(scales) {
  if (scales.priceScaleMode) return scales.priceScaleMode;
  return scales.logarithmic ? "logarithmic" : "regular";
}

/** @param {object} scales */
export function priceScaleModeFromSettings(scales) {
  switch (resolvePriceScaleModeKey(scales)) {
    case "logarithmic":
      return PriceScaleMode.Logarithmic;
    case "percent":
      return PriceScaleMode.Percentage;
    case "indexed100":
      return PriceScaleMode.IndexedTo100;
    default:
      return PriceScaleMode.Normal;
  }
}
