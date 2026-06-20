import { SessionOpen } from "../storage/sessionOpen.js";
import { tradingWindowStartHm, releaseHtfGateEnabled } from "../setups/setupGlobal.js";

export class PpiNews {
  /** `8:30am` → `08:30` ET */
  static parseFfTimeEt(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s || /all day|tentative|^day \d|^\d+$/.test(s)) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
    if (!m) return null;
    let h = Number(m[1]);
    const min = m[2];
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}`;
  }

  /** @param {{ title?: string; event?: string; name?: string }} ev */
  static eventTitle(ev) {
    return String(ev?.title ?? ev?.event ?? ev?.name ?? "")
      .trim()
      .toLowerCase();
  }

  /** @param {{ title?: string; event?: string; name?: string }} ev */
  static isPpiNewsEvent(ev) {
    const title = PpiNews.eventTitle(ev);
    return title === "core ppi m/m" || title === "ppi m/m";
  }

  /** @param {{ title?: string; event?: string; name?: string }} ev */
  static isCpiNewsEvent(ev) {
    const title = PpiNews.eventTitle(ev);
    return title === "core cpi m/m" || title === "cpi m/m";
  }

  /** @param {{ title?: string; event?: string; name?: string }} ev */
  static isNfpNewsEvent(ev) {
    return PpiNews.eventTitle(ev) === "non-farm employment change";
  }

  /** @param {{ title?: string; event?: string; name?: string; currency?: string; country?: string }} ev */
  static isGdpNewsEvent(ev) {
    if (PpiNews.eventTitle(ev) !== "prelim gdp q/q") return false;
    const curr = String(ev.currency ?? ev.country ?? "").toUpperCase();
    return !curr || curr === "USD";
  }

  /** @param {{ title?: string; event?: string; name?: string; currency?: string; country?: string }} ev */
  static isReleaseNewsEvent(ev) {
    return (
      PpiNews.isPpiNewsEvent(ev) ||
      PpiNews.isCpiNewsEvent(ev) ||
      PpiNews.isNfpNewsEvent(ev) ||
      PpiNews.isGdpNewsEvent(ev)
    );
  }

  /** @param {{ title?: string; event?: string; name?: string }[] | null | undefined} events */
  static dayHasPpiNews(events) {
    return Boolean(events?.some(PpiNews.isPpiNewsEvent));
  }

  /** @param {{ title?: string; event?: string; name?: string }[] | null | undefined} events */
  static dayHasCpiNews(events) {
    return Boolean(events?.some(PpiNews.isCpiNewsEvent));
  }

  /** @param {{ title?: string; event?: string; name?: string }[] | null | undefined} events */
  static dayHasNfpNews(events) {
    return Boolean(events?.some(PpiNews.isNfpNewsEvent));
  }

  /** @param {{ title?: string; event?: string; name?: string }[] | null | undefined} events */
  static dayHasGdpNews(events) {
    return Boolean(events?.some(PpiNews.isGdpNewsEvent));
  }

  /** @param {{ title?: string; event?: string; name?: string }[] | null | undefined} events */
  static dayHasReleaseNews(events) {
    return (
      PpiNews.dayHasPpiNews(events) ||
      PpiNews.dayHasCpiNews(events) ||
      PpiNews.dayHasNfpNews(events) ||
      PpiNews.dayHasGdpNews(events)
    );
  }

  /**
   * @param {{ title?: string; event?: string; name?: string }[] | null | undefined} events
   * @returns {"ppi" | "cpi" | "nfp" | "gdp" | null}
   */
  static releaseDayKindFromEvents(events) {
    if (PpiNews.dayHasPpiNews(events)) return "ppi";
    if (PpiNews.dayHasCpiNews(events)) return "cpi";
    if (PpiNews.dayHasNfpNews(events)) return "nfp";
    if (PpiNews.dayHasGdpNews(events)) return "gdp";
    return null;
  }

  /**
   * Primary USD release for the session day (PPI/CPI/NFP/GDP).
   * @param {{ title?: string; event?: string; name?: string; hmEt?: string; time?: string; timeLabel?: string; currency?: string; country?: string }[] | null | undefined} events
   */
  static primaryReleaseNewsEvent(events) {
    if (!events?.length) return null;
    for (const ev of events) {
      const curr = String(ev.currency ?? ev.country ?? "").toUpperCase();
      if (curr && curr !== "USD") continue;
      if (PpiNews.isReleaseNewsEvent(ev)) return ev;
    }
    for (const ev of events) {
      if (PpiNews.isReleaseNewsEvent(ev)) return ev;
    }
    return null;
  }

  /**
   * ET `HH:mm` of the 1m candle that births release H/L (from calendar or fallback).
   * @param {{ title?: string; event?: string; name?: string; hmEt?: string; time?: string; timeLabel?: string; currency?: string; country?: string }[] | null | undefined} events
   * @param {string} [fallback]
   */
  static releaseNewsTimeHm(events, fallback = "08:30") {
    const ev = PpiNews.primaryReleaseNewsEvent(events);
    if (!ev) return fallback;
    const hm = ev.hmEt ?? PpiNews.parseFfTimeEt(ev.timeLabel ?? ev.time);
    return hm || fallback;
  }

  static releaseDaySetupHint(kind) {
    const start = tradingWindowStartHm().replace(/^0/, "");
    if (kind === "cpi") return `CPI day (before ${start} AM) — waiting for CPI High/Low HTF sweep`;
    if (kind === "ppi") return `PPI day (before ${start} AM) — waiting for PPI High/Low HTF sweep`;
    if (kind === "nfp") return `NFP day (before ${start} AM) — waiting for NFP High/Low HTF sweep`;
    if (kind === "gdp") return `GDP day (before ${start} AM) — waiting for GDP High/Low HTF sweep`;
    return `Release day (before ${start} AM) — waiting for release High/Low HTF sweep`;
  }

  /**
   * On release days, only bars before 9:30 AM ET require a release High/Low HTF sweep.
   * @param {number | null | undefined} anchorUnix
   * @param {string | undefined} dayYmd
   */
  static releaseHtfGateActiveAt(anchorUnix, dayYmd) {
    if (anchorUnix == null) return true;
    if (!dayYmd) return true;
    const cutoff = SessionOpen.hmToUnix(dayYmd, tradingWindowStartHm());
    if (cutoff == null) return true;
    return anchorUnix < cutoff;
  }

  /** @param {string | undefined} label */
  static isReleaseHtfSweepLabel(label) {
    return /\b(PPI|CPI|NFP|GDP)\b/i.test(String(label ?? ""));
  }

  /** @param {Array<{ label?: string }> | null | undefined} sweeps */
  static regimeIncludesReleaseHtfSweep(sweeps) {
    return (sweeps ?? []).some((s) => PpiNews.isReleaseHtfSweepLabel(s.label));
  }

  /**
   * Setup #1 — before 9:30 AM on PPI/CPI days, active HTF regime must include release High/Low.
   * @param {boolean} hasReleaseNews
   * @param {Array<{ label?: string }> | null | undefined} htfSweeps
   * @param {number | null | undefined} anchorUnix
   * @param {string | undefined} dayYmd
   */
  static releaseDayHtfRequirementMet(hasReleaseNews, htfSweeps, anchorUnix, dayYmd) {
    if (!releaseHtfGateEnabled()) return true;
    if (!hasReleaseNews) return true;
    if (!PpiNews.releaseHtfGateActiveAt(anchorUnix, dayYmd)) return true;
    return PpiNews.regimeIncludesReleaseHtfSweep(htfSweeps);
  }

  /**
   * Setup #2 — before 9:30 AM on PPI/CPI days, a release High/Low HTF sweep must have printed.
   * @param {Array<{ label?: string; time: number }> | null | undefined} sweepEvents
   * @param {number | null | undefined} anchorUnix
   * @param {string | undefined} dayYmd
   */
  static releaseHtfSweepBeforeAnchor(sweepEvents, anchorUnix, dayYmd) {
    if (!releaseHtfGateEnabled()) return true;
    if (anchorUnix == null) return false;
    if (!PpiNews.releaseHtfGateActiveAt(anchorUnix, dayYmd)) return true;
    return (sweepEvents ?? []).some(
      (s) => s.time <= anchorUnix && PpiNews.isReleaseHtfSweepLabel(s.label),
    );
  }
}

export const isPpiNewsEvent = (...a) => PpiNews.isPpiNewsEvent(...a);
export const isCpiNewsEvent = (...a) => PpiNews.isCpiNewsEvent(...a);
export const isNfpNewsEvent = (...a) => PpiNews.isNfpNewsEvent(...a);
export const isGdpNewsEvent = (...a) => PpiNews.isGdpNewsEvent(...a);
export const isReleaseNewsEvent = (...a) => PpiNews.isReleaseNewsEvent(...a);
export const dayHasPpiNews = (...a) => PpiNews.dayHasPpiNews(...a);
export const dayHasCpiNews = (...a) => PpiNews.dayHasCpiNews(...a);
export const dayHasNfpNews = (...a) => PpiNews.dayHasNfpNews(...a);
export const dayHasGdpNews = (...a) => PpiNews.dayHasGdpNews(...a);
export const dayHasReleaseNews = (...a) => PpiNews.dayHasReleaseNews(...a);
export const releaseDayKindFromEvents = (...a) => PpiNews.releaseDayKindFromEvents(...a);
export const releaseNewsTimeHm = (...a) => PpiNews.releaseNewsTimeHm(...a);
export const parseFfTimeEt = (...a) => PpiNews.parseFfTimeEt(...a);
export const PPI_DAY_SETUP_HINT = PpiNews.releaseDaySetupHint("ppi");
export const CPI_DAY_SETUP_HINT = PpiNews.releaseDaySetupHint("cpi");
export const NFP_DAY_SETUP_HINT = PpiNews.releaseDaySetupHint("nfp");
export const GDP_DAY_SETUP_HINT = PpiNews.releaseDaySetupHint("gdp");
export const releaseDaySetupHint = (...a) => PpiNews.releaseDaySetupHint(...a);
export const releaseHtfGateActiveAt = (...a) => PpiNews.releaseHtfGateActiveAt(...a);
/** @deprecated Use releaseHtfGateActiveAt */
export const ppiHtfGateActiveAt = (...a) => PpiNews.releaseHtfGateActiveAt(...a);
export const isReleaseHtfSweepLabel = (...a) => PpiNews.isReleaseHtfSweepLabel(...a);
/** @deprecated Use isReleaseHtfSweepLabel */
export const isPpiHtfSweepLabel = (...a) => PpiNews.isReleaseHtfSweepLabel(...a);
export const regimeIncludesReleaseHtfSweep = (...a) => PpiNews.regimeIncludesReleaseHtfSweep(...a);
/** @deprecated Use regimeIncludesReleaseHtfSweep */
export const regimeIncludesPpiHtfSweep = (...a) => PpiNews.regimeIncludesReleaseHtfSweep(...a);
export const releaseDayHtfRequirementMet = (...a) => PpiNews.releaseDayHtfRequirementMet(...a);
/** @deprecated Use releaseDayHtfRequirementMet */
export const ppiDayHtfRequirementMet = (...a) => PpiNews.releaseDayHtfRequirementMet(...a);
export const releaseHtfSweepBeforeAnchor = (...a) => PpiNews.releaseHtfSweepBeforeAnchor(...a);
/** @deprecated Use releaseHtfSweepBeforeAnchor */
export const ppiHtfSweepBeforeAnchor = (...a) => PpiNews.releaseHtfSweepBeforeAnchor(...a);
