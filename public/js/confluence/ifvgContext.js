import { sliceBarsThroughAnchor } from "../levels/levelsCalc.js";
import { Format } from "../utils/format.js";
import {
  latestOppositeFvgTouchTime,
  latestQualifyingFvgTap,
  latestQualifyingFvgTapTime,
  latestSameSideFvgTouchBefore,
  closedThroughTapFvg,
} from "./fvgTapContext.js";
import {
  formationCandlesBetween,
  gapPassesSizeFilter,
} from "../setups/setupFilters.js";
import { ifvgGapSizeFilterForSetup, ifvgQualifyForSetup, ifvgCompanionFvgForSetup } from "../setups/setupGlobal.js";

/** @typedef {{ id: string; time: number; direction: "bull"|"bear"; top: number; bottom: number; middleTime: number; confirmTime: number; close: number; label: string; color: string }} IfvgEvent */

const IFVG_COLOR = "#ffff00";

/** @param {"bull"|"bear"} direction */


function fvgAt(agg, idx) {
  if (idx < 2) return null;
  const first = agg[idx - 2];
  const middle = agg[idx - 1];
  const last = agg[idx];
  if (last.low > first.high) {
    return {
      direction: /** @type {const} */ ("bull"),
      top: last.low,
      bottom: first.high,
      startTime: first.time,
      middleTime: middle.time,
      confirmTime: last.time,
    };
  }
  if (last.high < first.low) {
    return {
      direction: /** @type {const} */ ("bear"),
      top: first.low,
      bottom: last.high,
      startTime: first.time,
      middleTime: middle.time,
      confirmTime: last.time,
    };
  }
  return null;
}

/** @returns {Set<string>} `${middleTime}:${direction}` keys for companion 1m FVGs */
function companionFvgMiddleKeys(bars1m, anchorUnix) {
  const keys = new Set();
  if (!bars1m?.length || anchorUnix == null) return keys;
  const slice = sliceBarsThroughAnchor(bars1m, anchorUnix);
  for (let i = 2; i < slice.length; i++) {
    const born = fvgAt(slice, i);
    if (born) keys.add(`${born.middleTime}:${born.direction}`);
  }
  return keys;
}


function ifvgLabel(direction, inversionTime, middleTime) {
  const side = ifvgSourceSide(direction);
  const inv = Format.time12h(Format.toDate(inversionTime));
  const formed = Format.etMdYy(middleTime);
  return `IFVG @ ${inv} · inversed ${side} 1m gap from ${formed}`;
}


function ifvgQualifiesForRegime(
  ifvgTime,
  ifvgMiddleTime,
  ifvgFloorTime,
  internalSweeps,
  bars1m,
  anchorUnix,
  regimeStart,
  bias,
  rules,
) {
  if (!rules) return true;
  if (!Number.isFinite(ifvgFloorTime) || ifvgTime <= ifvgFloorTime) return false;

  if (rules.maxFormationCandles != null) {
    const candles = formationCandlesBetween(ifvgMiddleTime, ifvgTime);
    if (candles > rules.maxFormationCandles) return false;
  }

  if (rules.maxAfterSameSideTapSec != null) {
    const lastTap = latestSameSideFvgTouchBefore(
      bars1m,
      anchorUnix,
      regimeStart,
      bias,
      ifvgTime,
    );
    if (!Number.isFinite(lastTap) || lastTap === -Infinity) return false;
    if (ifvgTime - lastTap > rules.maxAfterSameSideTapSec) return false;
  }

  if (rules.requireInternalBetween) {
    return internalSweeps.some((s) => s.time >= ifvgFloorTime && s.time <= ifvgTime);
  }
  return true;
}

export class IfvgContext {
  static ifvgSourceSide(direction) {
    return direction === "bull" ? "Bullish" : "Bearish";
  }

  /**
   * @param {Pick<IfvgEvent, "time" | "direction" | "middleTime" | "top" | "bottom">} ifvg
   * @returns {string[]}
   */
  static ifvgTooltipLines(ifvg) {
    const side = ifvgSourceSide(ifvg.direction);
    const zone = `${ifvg.bottom.toFixed(2)}–${ifvg.top.toFixed(2)}`;
    const inverted = Format.time12h(Format.toDate(ifvg.time));
    const formed = Format.etMdYy(ifvg.middleTime);
    return [
      `${inverted} · Inverted here @ ${zone}`,
      `Source ${side} 1m gap · formed ${formed} @ ${zone}`,
    ];
  }

  /** @param {{ time: number; high: number; low: number }[]} agg @param {number} idx */

  /**
   * @param {"bull"|"bear"} direction
   * @param {number} inversionTime
   * @param {number} middleTime
   */

  /**
   * Track 1m FVG inversions in the current bias regime (bear 1m → IFVG for long, bull 1m → IFVG for short).
   * Only gaps confirmed on or after `regimeStart` are eligible — prior-day / pre-HTF-sweep FVGs are ignored.
   * @param {{ time: number; open: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} regimeStart — unix of the HTF sweep that opened this bias era
   * @param {string} bias
   * @param {number | string | null | undefined} [setupId]
   * @param {{ time: number; open?: number; high: number; low: number; close?: number }[]} [compBars1m]
   * @returns {IfvgEvent[]}
   */
  static buildIfvgEvents(bars1m, anchorUnix, regimeStart, bias, setupId, compBars1m) {
    if (!bars1m?.length || anchorUnix == null || !Number.isFinite(regimeStart)) return [];

    const trackDir = bias === "Bullish" ? "bear" : bias === "Bearish" ? "bull" : null;
    if (!trackDir) return [];

    const gapFilter = ifvgGapSizeFilterForSetup(setupId);
    const qualifySettings = ifvgQualifyForSetup(setupId);
    const requireCompanionFvg = ifvgCompanionFvgForSetup(setupId)?.enabled === true;
    const companionKeys = requireCompanionFvg ? companionFvgMiddleKeys(compBars1m, anchorUnix) : null;
    const maxFormationCandles =
      qualifySettings?.enabled && qualifySettings.maxFormationCandles > 0
        ? qualifySettings.maxFormationCandles
        : null;

    const slice = sliceBarsThroughAnchor(bars1m, anchorUnix);
    if (slice.length < 3) return [];

    /** @type {Map<string, { id: string; direction: "bull"|"bear"; top: number; bottom: number; middleTime: number; confirmTime: number; inverted: boolean }>} */
    const pool = new Map();
    /** @type {IfvgEvent[]} */
    const events = [];

    for (let i = 2; i < slice.length; i++) {
      const bar = slice[i];
      const born = fvgAt(slice, i);
      // Only gaps confirmed after the current HTF regime began — ignore prior-day / pre-sweep FVGs.
      if (born?.direction === trackDir && born.confirmTime >= regimeStart) {
        if (!gapPassesSizeFilter(gapFilter, born.top, born.bottom)) continue;
        if (
          companionKeys &&
          !companionKeys.has(`${born.middleTime}:${born.direction}`)
        ) {
          continue;
        }
        pool.set(`${born.startTime}:${born.confirmTime}`, {
          id: `${born.startTime}:${born.confirmTime}`,
          direction: born.direction,
          top: born.top,
          bottom: born.bottom,
          middleTime: born.middleTime,
          confirmTime: born.confirmTime,
          inverted: false,
        });
      }

      for (const fvg of pool.values()) {
        if (fvg.inverted || bar.time < fvg.confirmTime) continue;

        const inverted =
          fvg.direction === "bear"
            ? bar.close > fvg.top
            : fvg.direction === "bull"
              ? bar.close < fvg.bottom
              : false;
        if (!inverted) continue;

        if (
          maxFormationCandles != null &&
          formationCandlesBetween(fvg.middleTime, bar.time) > maxFormationCandles
        ) {
          continue;
        }

        fvg.inverted = true;
        events.push({
          id: fvg.id,
          time: bar.time,
          direction: fvg.direction,
          top: fvg.top,
          bottom: fvg.bottom,
          middleTime: fvg.middleTime,
          confirmTime: fvg.confirmTime,
          close: bar.close,
          label: ifvgLabel(fvg.direction, bar.time, fvg.middleTime),
          color: IFVG_COLOR,
        });
      }
    }

    return events.sort((a, b) => a.time - b.time);
  }

  /**
   * Bar times where Setup #1 may first complete — IFVG inversions and their close-through candles.
   * @param {{ time: number; open: number; high: number; low: number; close: number }[]} bars1m
   * @param {number} scanEnd
   * @param {number} regimeStart
   * @param {string} bias
   * @param {import("./fvgTapContext.js").FvgTapEvent[]} fvgTaps
   * @param {{ time: number; high: number; low: number }[]} [compBars1m]
   * @returns {number[]}
   */
  static collectSetup1EntryCandidateTimes(bars1m, scanEnd, regimeStart, bias, fvgTaps, compBars1m) {
    if (bias !== "Bullish" && bias !== "Bearish") return [];
    const dir = bias === "Bullish" ? "bull" : "bear";
    const qualifyingTaps = (fvgTaps ?? []).filter((t) => t.direction === dir);
    if (!qualifyingTaps.length) return [];

    const slice = sliceBarsThroughAnchor(bars1m, scanEnd);
    if (!slice.length) return [];

    const ifvgEvents = buildIfvgEvents(bars1m, scanEnd, regimeStart, bias, 1, compBars1m);
    /** @type {number[]} */
    const times = [];
    const seen = new Set();
    const add = (t) => {
      if (Number.isFinite(t) && !seen.has(t)) {
        seen.add(t);
        times.push(t);
      }
    };

    for (const tap of qualifyingTaps) {
      for (const e of ifvgEvents) {
        if (e.time <= tap.time) continue;
        add(e.time);
        const check = closedThroughTapFvg(slice, e.time, bias, tap);
        if (check.time) add(check.time);
      }
    }

    return times.sort((a, b) => a - b);
  }


  /** @param {Array<[string, boolean]>} checklist */
  static computeSetupGrade(checklist) {
    const n = checklist.filter(([, ok]) => ok).length;
    if (n === checklist.length && checklist.length > 0) return "A+";
    if (n >= 4) return "A";
    if (n >= 3) return "B+";
    if (n >= 2) return "B";
    return "—";
  }

  /** @param {string} grade */
  static gradeCssSuffix(grade) {
    if (grade === "A+") return "aplus";
    if (grade === "A") return "a";
    if (grade === "B+" || grade === "B") return "bplus";
    return "";
  }

  /**
   * @param {object} ctx — after enrichWithFvgTaps + enrichWithInternalSweeps
   * @param {{ time: number; open: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} regimeStart
   * @param {import("../setups/setupIfvg.js").ResolvedIfvgQualifyRules | null} [qualifyRules]
   * @param {number | string | null | undefined} [setupId]
   * @param {{ time: number; open?: number; high: number; low: number; close?: number }[]} [compBars1m]
   */
  static enrichWithIfvg(ctx, bars1m, anchorUnix, regimeStart, qualifyRules = null, setupId, compBars1m) {
    const ifvgEvents = buildIfvgEvents(bars1m, anchorUnix, regimeStart, ctx.bias, setupId, compBars1m);
    const slice = anchorUnix != null ? sliceBarsThroughAnchor(bars1m, anchorUnix) : [];
    const internalSweeps = ctx.internalSweeps ?? [];

    const qualifyingTap = ctx.anchorTap ?? latestQualifyingFvgTap(ctx.fvgTaps, ctx.bias);
    const tapTime = qualifyingTap?.time ?? latestQualifyingFvgTapTime(ctx.fvgTaps, ctx.bias);
    const oppositeTouchTime = qualifyRules?.floorAfterOppositeTap
      ? latestOppositeFvgTouchTime(bars1m, anchorUnix, regimeStart, ctx.bias, tapTime, "15m", setupId)
      : -Infinity;
    const ifvgFloorTime = Math.max(tapTime, oppositeTouchTime);
    const cycleInternals = internalSweeps.filter((s) => s.time >= tapTime);

    const ifvgAfterTap = ifvgEvents.filter((e) => e.time > ifvgFloorTime);
    const regimeIfvgs = qualifyRules
      ? ifvgAfterTap.filter((e) =>
          ifvgQualifiesForRegime(
            e.time,
            e.middleTime,
            ifvgFloorTime,
            cycleInternals,
            bars1m,
            anchorUnix,
            regimeStart,
            ctx.bias,
            qualifyRules,
          ),
        )
      : ifvgAfterTap;

    // Entry locks to the first IFVG that closes through the 15m FVG — not a later IFVG in the same cycle.
    let completingIfvg = null;
    let closeCheck = { done: false, time: null };
    for (const ifvg of regimeIfvgs) {
      const check = closedThroughTapFvg(slice, ifvg.time, ctx.bias, qualifyingTap);
      if (check.done) {
        completingIfvg = ifvg;
        closeCheck = check;
        break;
      }
    }

    const recentIfvg =
      completingIfvg ?? (regimeIfvgs.length ? regimeIfvgs[regimeIfvgs.length - 1] : null);
    const ifvgDone = cycleInternals.length > 0 && regimeIfvgs.length > 0;
    const closeLabel =
      ctx.bias === "Bullish"
        ? "Closed above 15m FVG"
        : ctx.bias === "Bearish"
          ? "Closed below 15m FVG"
          : "Closed through 15m FVG";

    return {
      ...ctx,
      ifvgEvents,
      recentIfvg,
      ifvgDone,
      closedAbove15m: closeCheck.done,
      closedAbove15mTime: closeCheck.time,
      closeLabel,
    };
  }

}

export const ifvgSourceSide = (...a) => IfvgContext.ifvgSourceSide(...a);
export const ifvgTooltipLines = (...a) => IfvgContext.ifvgTooltipLines(...a);
export const buildIfvgEvents = (...a) => IfvgContext.buildIfvgEvents(...a);
export const collectSetup1EntryCandidateTimes = (...a) => IfvgContext.collectSetup1EntryCandidateTimes(...a);
export const computeSetupGrade = (...a) => IfvgContext.computeSetupGrade(...a);
export const gradeCssSuffix = (...a) => IfvgContext.gradeCssSuffix(...a);
export const enrichWithIfvg = (...a) => IfvgContext.enrichWithIfvg(...a);
