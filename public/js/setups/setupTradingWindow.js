import { SessionOpen } from "../storage/sessionOpen.js";
import {
  releaseStartAfterSec,
  tradingWindowEnabled,
  tradingWindowEndHm,
  tradingWindowStartHm,
  tradingWindowTimes,
} from "./setupGlobal.js";
import { releaseNewsTimeHm } from "../confluence/ppiNews.js";

const STORAGE_KEY = "ifvg-setup-trading-window-v1";

/** @typedef {{ enabled: boolean }} SetupTradingWindowSettings */
/** @typedef {{ startUnix: number; endUnix: number; startLabel: string; endLabel: string }} TradingWindowSlotBounds */
/** @typedef {{ windows: TradingWindowSlotBounds[]; startUnix: number; endUnix: number; startLabel: string; endLabel: string; releaseHm?: string } | null} SetupTradingWindowBounds */

export class SetupTradingWindow {
  static get SETUP_WINDOW_DEFAULT_START_HM() {
    return tradingWindowStartHm();
  }

  static get SETUP_WINDOW_END_HM() {
    return tradingWindowEndHm();
  }

  /** @returns {SetupTradingWindowSettings} */
  static defaultSettings() {
    return { enabled: tradingWindowEnabled() };
  }

  /** @returns {SetupTradingWindowSettings} */
  static loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return SetupTradingWindow.defaultSettings();
      const s = JSON.parse(raw);
      return {
        enabled: s.enabled !== false,
      };
    } catch {
      return SetupTradingWindow.defaultSettings();
    }
  }

  /** @param {SetupTradingWindowSettings} settings */
  static saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      //
    }
  }

  /** @param {string} hm `HH:mm` */
  static formatHm12(hm) {
    const [hh, mm] = hm.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hm;
    const d = new Date(2000, 0, 1, hh, mm);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }

  /**
   * @param {string | undefined} dayYmd
   * @param {boolean} hasReleaseNews — PPI, CPI, NFP, or GDP calendar day
   * @param {SetupTradingWindowSettings | undefined} settings
   * @param {{ title?: string; event?: string; name?: string; hmEt?: string; time?: string; timeLabel?: string; currency?: string }[] | null | undefined} [calendarEvents]
   * @returns {SetupTradingWindowBounds}
   */
  static getBounds(dayYmd, hasReleaseNews, settings, calendarEvents) {
    if (!tradingWindowEnabled() || settings?.enabled === false || !dayYmd) return null;

    const slots = tradingWindowTimes();
    /** @type {TradingWindowSlotBounds[]} */
    const windows = [];

    for (let i = 0; i < slots.length; i++) {
      let startHm = slots[i].start;
      let releaseHm;

      if (i === 0 && hasReleaseNews) {
        releaseHm = releaseNewsTimeHm(calendarEvents ?? []);
        const releaseUnix = SessionOpen.hmToUnix(dayYmd, releaseHm);
        const offsetSec = releaseStartAfterSec();
        if (releaseUnix != null && offsetSec != null) {
          startHm = SessionOpen.hmFromUnix(releaseUnix + offsetSec);
        }
      }

      const startUnix = SessionOpen.hmToUnix(dayYmd, startHm);
      const endUnix = SessionOpen.hmToUnix(dayYmd, slots[i].end);
      if (startUnix == null || endUnix == null) continue;
      windows.push({
        startUnix,
        endUnix,
        startLabel: SetupTradingWindow.formatHm12(startHm),
        endLabel: SetupTradingWindow.formatHm12(slots[i].end),
        ...(releaseHm ? { releaseHm } : {}),
      });
    }

    if (!windows.length) return null;

    const first = windows[0];
    const last = windows[windows.length - 1];
    return {
      windows,
      startUnix: first.startUnix,
      endUnix: last.endUnix,
      startLabel: first.startLabel,
      endLabel: last.endLabel,
      releaseHm: first.releaseHm,
    };
  }

  /**
   * @param {{
   *   getDayYmd?: () => string;
   *   getHasPpiNews?: () => boolean;
   *   getCalendarEvents?: () => { title?: string; event?: string; name?: string; hmEt?: string; time?: string; timeLabel?: string; currency?: string }[] | null | undefined;
   *   getSetupTradingWindow?: () => SetupTradingWindowSettings;
   * }} opts
   */
  static resolveBounds(opts) {
    return SetupTradingWindow.getBounds(
      opts.getDayYmd?.(),
      opts.getHasPpiNews?.() === true,
      opts.getSetupTradingWindow?.() ?? SetupTradingWindow.defaultSettings(),
      opts.getCalendarEvents?.() ?? [],
    );
  }

  /**
   * @param {number | null | undefined} unix
   * @param {SetupTradingWindowBounds} bounds
   */
  static isWithin(unix, bounds) {
    if (!bounds || unix == null || !Number.isFinite(unix)) return true;
    const windows = bounds.windows ?? [bounds];
    return windows.some((w) => unix >= w.startUnix && unix <= w.endUnix);
  }

  /**
   * @param {number | null | undefined} anchorUnix
   * @param {SetupTradingWindowBounds} bounds
   * @returns {"before" | "after" | "in" | null}
   */
  static phase(anchorUnix, bounds) {
    if (!bounds || anchorUnix == null) return null;
    const windows = bounds.windows ?? [bounds];
    if (SetupTradingWindow.isWithin(anchorUnix, bounds)) return "in";
    if (anchorUnix < windows[0].startUnix) return "before";
    return "after";
  }

  /**
   * @param {number | null | undefined} anchorUnix
   * @param {SetupTradingWindowBounds} bounds
   */
  static capAnchor(anchorUnix, bounds) {
    if (!bounds || anchorUnix == null) return anchorUnix;
    const windows = bounds.windows ?? [bounds];
    for (const w of windows) {
      if (anchorUnix >= w.startUnix && anchorUnix <= w.endUnix) {
        return Math.min(anchorUnix, w.endUnix);
      }
    }
    let lastEnded = null;
    for (const w of windows) {
      if (anchorUnix > w.endUnix) lastEnded = w.endUnix;
    }
    return lastEnded ?? anchorUnix;
  }

  /**
   * @param {number} regimeStart
   * @param {SetupTradingWindowBounds} bounds
   */
  static floorRegimeStart(regimeStart, bounds) {
    if (!bounds || !Number.isFinite(regimeStart)) return regimeStart;
    const windows = bounds.windows ?? [bounds];
    for (const w of windows) {
      if (regimeStart <= w.endUnix) return Math.max(regimeStart, w.startUnix);
    }
    return regimeStart;
  }

  /**
   * @param {import("./levelsCalc.js").HtfSweepEvent[]} sweeps
   * @param {SetupTradingWindowBounds} bounds
   * @param {number | null | undefined} anchorUnix
   */
  static filterSweeps(sweeps, bounds, anchorUnix) {
    if (!bounds || anchorUnix == null) {
      return sweeps.filter((s) => s.time <= anchorUnix);
    }
    const windows = bounds.windows ?? [bounds];
    const cap = SetupTradingWindow.capAnchor(anchorUnix, bounds);
    return sweeps.filter((s) =>
      windows.some((w) => s.time >= w.startUnix && s.time <= Math.min(cap, w.endUnix)),
    );
  }

  /**
   * @param {Array<{ time: number }>} items
   * @param {SetupTradingWindowBounds} bounds
   */
  static filterConfluences(items, bounds) {
    if (!bounds || !items?.length) return items ?? [];
    return items.filter((item) => SetupTradingWindow.isWithin(item.time, bounds));
  }

  /** True when entries / completions are allowed (inside NY AM window, or anytime when window is off). */
  static isEntryAllowed(anchorUnix, bounds) {
    if (!bounds) return true;
    return SetupTradingWindow.phase(anchorUnix, bounds) === "in";
  }

  /** @param {SetupTradingWindowBounds} bounds */
  static entryPreviewHint(bounds) {
    if (!bounds) return "";
    const windows = bounds.windows ?? [bounds];
    const labels = windows.map((w) => `${w.startLabel}–${w.endLabel}`).join(", ");
    return ` · Entry ${labels} ET`;
  }
}

export const SETUP_WINDOW_DEFAULT_START_HM = tradingWindowStartHm();
export const SETUP_WINDOW_END_HM = tradingWindowEndHm();

/**
 * Anchor through which completed setups are collected for export/backtest.
 * When the global trading window is off, scan through session flat (4:00 PM ET).
 * @param {string} ymd
 * @param {string} [flatHm]
 * @returns {number | null}
 */
export function setupScanAnchorUnix(ymd, flatHm = "16:00") {
  if (!tradingWindowEnabled()) return SessionOpen.hmToUnix(ymd, flatHm);
  return SessionOpen.hmToUnix(ymd, SetupTradingWindow.SETUP_WINDOW_END_HM);
}
export const defaultSetupTradingWindowSettings = () => SetupTradingWindow.defaultSettings();
export const loadSetupTradingWindowSettings = () => SetupTradingWindow.loadSettings();
export const saveSetupTradingWindowSettings = (s) => SetupTradingWindow.saveSettings(s);
export const getSetupTradingWindowBounds = (...a) => SetupTradingWindow.getBounds(...a);
export const resolveSetupTradingWindowBounds = (opts) => SetupTradingWindow.resolveBounds(opts);
export const isWithinSetupTradingWindow = (...a) => SetupTradingWindow.isWithin(...a);
export const setupTradingWindowPhase = (...a) => SetupTradingWindow.phase(...a);
export const capAnchorForSetupWindow = (...a) => SetupTradingWindow.capAnchor(...a);
export const floorRegimeStartForSetupWindow = (...a) => SetupTradingWindow.floorRegimeStart(...a);
export const filterSweepsForSetupWindow = (...a) => SetupTradingWindow.filterSweeps(...a);
export const filterConfluencesForSetupWindow = (...a) => SetupTradingWindow.filterConfluences(...a);
export const isSetupEntryAllowed = (...a) => SetupTradingWindow.isEntryAllowed(...a);
export const setupEntryPreviewHint = (...a) => SetupTradingWindow.entryPreviewHint(...a);
