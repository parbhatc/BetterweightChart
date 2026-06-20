import { dayHasReleaseNews, isReleaseNewsEvent, releaseDayKindFromEvents } from "../confluence/ppiNews.js";

/** Release calendar helpers for export/calendar modes. */
export class ReleaseCalendar {
  /**
   * Release days used when exporting trades (fallback when news JSON is missing).
   * Keep in sync with backtest scripts — only days that change setup window behavior.
   */
  static EXPORT_RELEASE_DAYS = {
    "2026-05-28": [{ title: "Prelim GDP q/q", currency: "USD" }],
    "2026-06-05": [{ title: "Non-Farm Employment Change", currency: "USD" }],
    "2026-06-10": [{ title: "CPI m/m" }],
    "2026-06-11": [{ title: "PPI m/m" }],
  };

  /**
   * @param {string} dayYmd `YYYY-MM-DD`
   * @param {{ title?: string; event?: string; name?: string }[]} [ffEvents]
   * @param {"export" | "calendar"} [mode]
   */
  static resolveReleaseEvents(dayYmd, ffEvents, mode = "export") {
    const events = ffEvents ?? [];
    const fromCalendar = events.filter(isReleaseNewsEvent);
    if (fromCalendar.length) return fromCalendar;
    if (mode === "export") {
      return ReleaseCalendar.EXPORT_RELEASE_DAYS[dayYmd] ?? [];
    }
    return ReleaseCalendar.EXPORT_RELEASE_DAYS[dayYmd] ?? [];
  }

  /**
   * @param {string} dayYmd
   * @param {{ title?: string; event?: string; name?: string }[]} [ffEvents]
   * @param {"export" | "calendar"} [mode]
   */
  static releaseFlagsForDay(dayYmd, ffEvents, mode = "export") {
    const events = ReleaseCalendar.resolveReleaseEvents(dayYmd, ffEvents, mode);
    return {
      events,
      hasRelease: events.length > 0 || dayHasReleaseNews(events),
      releaseDayKind: releaseDayKindFromEvents(events),
    };
  }
}

export const EXPORT_RELEASE_DAYS = ReleaseCalendar.EXPORT_RELEASE_DAYS;
export const resolveReleaseEvents = (...a) => ReleaseCalendar.resolveReleaseEvents(...a);
export const releaseFlagsForDay = (...a) => ReleaseCalendar.releaseFlagsForDay(...a);
