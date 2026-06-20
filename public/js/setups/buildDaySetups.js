import { DateTime } from "luxon";
import { runLiquidityEngine } from "../levels/levelsCalc.js";
import { defaultPivotLevelsSettings } from "../levels/pivotLevelsSettings.js";
import { SetupHistory } from "./registry/setupHistory.js";
import "./registry/index.js";
import { SessionOpen } from "../storage/sessionOpen.js";
import {
  defaultSetupTradingWindowSettings,
  SETUP_WINDOW_END_HM,
} from "./setupTradingWindow.js";
import { defaultLiquidityXSettings } from "../liquidity-x/liquidityXSettings.js";
import { mergeLiquidityPivotFromSetups } from "./setupPivot.js";
import { releaseFlagsForDay } from "../session/releaseCalendar.js";

globalThis.luxon = globalThis.luxon ?? { DateTime };

/**
 * @param {{
 *   symbol?: string;
 *   dayYmd: string;
 *   sessionBars1m: { time: number; open?: number; high: number; low: number; close: number }[];
 *   compSessionBars1m?: { time: number; high: number; low: number; close?: number }[];
 *   calendarEvents?: { title?: string; event?: string; name?: string }[];
 *   calendarMode?: "export" | "calendar";
 *   pivotSettings?: ReturnType<typeof defaultPivotLevelsSettings>;
 *   lxSettings?: ReturnType<typeof defaultLiquidityXSettings>;
 *   twSettings?: ReturnType<typeof defaultSetupTradingWindowSettings>;
 *   endHm?: string;
 *   resetCache?: boolean;
 * }} opts
 */

export class BuildDaySetups {
  static async buildDaySetups(opts) {
    if (opts.resetCache !== false) {
      SetupHistory.resetAll();
    }

    const symbol = String(opts.symbol || "NQ").toUpperCase();
    const dayYmd = opts.dayYmd;
    const sessionBars1m = opts.sessionBars1m ?? [];
    const compSessionBars1m = opts.compSessionBars1m ?? [];
    const pivot = opts.pivotSettings ?? defaultPivotLevelsSettings();
    const lx = opts.lxSettings ?? defaultLiquidityXSettings();
    const tw = opts.twSettings ?? defaultSetupTradingWindowSettings();
    const endHm = opts.endHm ?? SETUP_WINDOW_END_HM;
    const mode = opts.calendarMode ?? "export";

    const { events, hasRelease, releaseDayKind } = releaseFlagsForDay(
      dayYmd,
      opts.calendarEvents,
      mode,
    );
    const endUnix = SessionOpen.hmToUnix(dayYmd, endHm);

    const emptyPayload = () => {
      const { setups, counts } = SetupHistory.toPayload(new Map());
      return {
        meta: {
          symbol,
          dayYmd,
          endUnix,
          hasRelease,
          releaseDayKind,
          calendarMode: mode,
          ...counts,
          count1: counts.count1 ?? 0,
          count2: counts.count2 ?? 0,
          builtAt: Date.now(),
        },
        setups,
        setups1: setups.setups1 ?? [],
        setups2: setups.setups2 ?? [],
      };
    };

    if (!sessionBars1m.length || endUnix == null) {
      return emptyPayload();
    }

    const pivotMerged = mergeLiquidityPivotFromSetups(pivot);
    const { htfSweepEvents } = runLiquidityEngine(sessionBars1m, endUnix, {
      ...pivotMerged,
      releaseKind: releaseDayKind,
      calendarEvents: events,
    });

    const ctx = {
      getSweepEvents: () => htfSweepEvents,
      getRaw1m: () => sessionBars1m,
      getAnchorUnix: () => endUnix,
      getDayYmd: () => dayYmd,
      getCompBars1m: () => compSessionBars1m,
      getSymbol: () => symbol,
      getLxSettings: () => lx,
      getHasPpiNews: () => hasRelease,
      getReleaseDayKind: () => releaseDayKind,
      getCalendarEvents: () => events,
      getSetupTradingWindow: () => tw,
    };

    const bySetup = SetupHistory.buildAll(ctx, endUnix, dayYmd);
    const { setups, counts } = SetupHistory.toPayload(bySetup);

    return {
      meta: {
        symbol,
        dayYmd,
        endUnix,
        scanAnchor: endUnix,
        hasRelease,
        releaseDayKind,
        calendarMode: mode,
        releaseEvents: events.map((e) => e.title ?? e.event ?? e.name).filter(Boolean),
        ...counts,
        count1: counts.count1 ?? 0,
        count2: counts.count2 ?? 0,
        builtAt: Date.now(),
      },
      setups,
      setups1: setups.setups1 ?? [],
      setups2: setups.setups2 ?? [],
    };
  }

  /** @param {{ time: number }[]} all @param {string} ymd */
  static sessionBarsForEtDay(all, ymd) {
    const dayStart = DateTime.fromISO(ymd, { zone: "America/New_York" });
    if (!dayStart.isValid) return [];
    const t0 = Math.floor(dayStart.minus({ days: 1 }).startOf("day").toSeconds());
    const t1 = Math.floor(dayStart.plus({ days: 1 }).toSeconds());
    return all.filter((b) => b.time >= t0 && b.time < t1);
  }

}

export const buildDaySetups = (...a) => BuildDaySetups.buildDaySetups(...a);
export const sessionBarsForEtDay = (...a) => BuildDaySetups.sessionBarsForEtDay(...a);
