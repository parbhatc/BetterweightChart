import { TickMarkType, PriceScaleMode } from "lightweight-charts";
import { toDate } from "./format.js";

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
 * @param {string} timeZone
 */
export function buildTimeScaleFormatters(scales, timeZone) {
  const hour12 = scales.timeHoursFormat !== "24-hours";
  const showDow = Boolean(scales.dayOfWeekOnLabels);
  const dateFormat = scales.dateFormat ?? "d_mmm_yy";

  const timeFormatter = (t) => {
    const d = toDate(t);
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12,
    }).format(d);
  };

  const tickMarkFormatter = (time, tickMarkType) => {
    const d = toDate(time);
    const fmt = (opts) => new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(d);

    switch (tickMarkType) {
      case TickMarkType.Year:
        return fmt({ year: "numeric" });
      case TickMarkType.Month:
        return fmt({ month: "short" });
      case TickMarkType.DayOfMonth: {
        const prefix = showDow ? `${fmt({ weekday: "short" })} ` : "";
        switch (dateFormat) {
          case "dd_mm_yy":
            return `${prefix}${fmt({ day: "numeric", month: "short", year: "2-digit" })}`;
          case "mm_dd":
            return `${prefix}${fmt({ month: "short", day: "numeric" })}`;
          case "yy_mm_dd":
            return `${prefix}${fmt({ year: "2-digit", month: "short", day: "numeric" })}`;
          case "d_mmm_yy":
          default:
            return `${prefix}${fmt({ day: "numeric", month: "short", year: "2-digit" })}`;
        }
      }
      case TickMarkType.Time:
        return new Intl.DateTimeFormat("en-US", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
          hour12,
        }).format(d);
      default:
        return "";
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
