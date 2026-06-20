import { ET_ZONE, defaultSessionOpenParts } from "../core/constants.js";

export class SessionSlice {
  /** @param {{ time: number }[]} all @param {string} ymd */
  static barsForEtDay(all, ymd) {
    const DT = globalThis.luxon?.DateTime;
    if (!DT) return [];
    const start = DT.fromISO(ymd, { zone: ET_ZONE }).startOf("day");
    if (!start.isValid) return [];
    const end = start.plus({ days: 1 });
    const t0 = Math.floor(start.toSeconds());
    const t1 = Math.floor(end.toSeconds());
    return all.filter((b) => b.time >= t0 && b.time < t1);
  }

  /** @param {{ time: number }[]} all @param {string} ymd */
  static barsForEtSessionDay(all, ymd) {
    const DT = globalThis.luxon?.DateTime;
    if (!DT) return SessionSlice.barsForEtDay(all, ymd);
    const dayStart = DT.fromISO(ymd, { zone: ET_ZONE });
    if (!dayStart.isValid) return [];
    const sessionStart = dayStart.minus({ days: 1 }).startOf("day");
    const sessionEnd = dayStart.plus({ days: 1 });
    const t0 = Math.floor(sessionStart.toSeconds());
    const t1 = Math.floor(sessionEnd.toSeconds());
    return all.filter((b) => b.time >= t0 && b.time < t1);
  }

  static dayOpenTimeUnix(bars, ymd) {
    if (!bars.length) return null;
    const DT = globalThis.luxon?.DateTime;
    if (!DT) return bars[bars.length - 1].time;
    const { hour, minute } = defaultSessionOpenParts();
    const open = DT.fromISO(ymd, { zone: ET_ZONE }).set({
      hour,
      minute,
      second: 0,
      millisecond: 0,
    });
    if (!open.isValid) return bars[bars.length - 1].time;
    const target = Math.floor(open.toSeconds());
    const idx = bars.findIndex((b) => b.time >= target);
    if (idx === -1) return bars[bars.length - 1].time;
    return bars[idx].time;
  }

  static latestEtYmdFromBars(all) {
    if (!all.length) return "";
    const DT = globalThis.luxon?.DateTime;
    if (!DT) return "";
    const last = all[all.length - 1];
    return DT.fromSeconds(last.time, { zone: "utc" }).setZone(ET_ZONE).toISODate() ?? "";
  }

  static latestWithOpen(all) {
    if (!all.length) return { day: "", bars: [], openTime: null };
    const DT = globalThis.luxon?.DateTime;
    if (!DT) {
      const ymd = SessionSlice.latestEtYmdFromBars(all);
      const bars = SessionSlice.barsForEtSessionDay(all, ymd);
      return { day: ymd, bars, openTime: bars.length ? SessionSlice.dayOpenTimeUnix(bars, ymd) : null };
    }
    const last = all[all.length - 1];
    const lastDt = DT.fromSeconds(last.time, { zone: ET_ZONE });
    let ymd = lastDt.toISODate() ?? "";
    if (lastDt.hour >= 18) {
      const bars = SessionSlice.barsForEtSessionDay(all, ymd);
      if (bars.length) {
        return { day: ymd, bars, openTime: SessionSlice.dayOpenTimeUnix(bars, ymd) };
      }
    }
    for (let step = 0; step < 500; step++) {
      const bars = SessionSlice.barsForEtSessionDay(all, ymd);
      if (!bars.length) {
        const prev = DT.fromISO(ymd, { zone: ET_ZONE }).minus({ days: 1 });
        if (!prev.isValid) break;
        ymd = prev.toISODate() ?? "";
        continue;
      }
      const { hour, minute } = defaultSessionOpenParts();
      const open = DT.fromISO(ymd, { zone: ET_ZONE }).set({
        hour,
        minute,
        second: 0,
        millisecond: 0,
      });
      if (!open.isValid) break;
      const target = Math.floor(open.toSeconds());
      const idx = bars.findIndex((b) => b.time >= target);
      if (idx !== -1) {
        return { day: ymd, bars, openTime: bars[idx].time };
      }
      const prev = DT.fromISO(ymd, { zone: ET_ZONE }).minus({ days: 1 });
      if (!prev.isValid) break;
      ymd = prev.toISODate() ?? "";
    }
    const fallbackYmd = DT.fromSeconds(last.time, { zone: "utc" }).setZone(ET_ZONE).toISODate() ?? "";
    const bars = SessionSlice.barsForEtSessionDay(all, fallbackYmd);
    return {
      day: fallbackYmd,
      bars,
      openTime: bars.length ? SessionSlice.dayOpenTimeUnix(bars, fallbackYmd) : null,
    };
  }
}
