import { Aggregate } from "../utils/aggregate.js";
import { aggregateBarsThroughAnchor } from "../session/sessionBarCache.js";
import { sliceBarsThroughAnchor } from "../levels/levelsCalc.js";
import { ET_ZONE, TF_MAP } from "../core/constants.js";
import { PineColors } from "../utils/pineColors.js";
import { isFvgProvisional } from "./fvg.js";
import { profileAdd, profileInc, profileOn } from "../core/setup1Profile.js";
import { gapPassesSizeFilter } from "../setups/setupFilters.js";
import { fvgTapGapSizeFilterForSetup } from "../setups/setupGlobal.js";

/** @typedef {{ id: string; direction: "bull"|"bear"; top: number; bottom: number; confirmTime: number; middleTime: number; time: number; label: string; color: string; pierced?: boolean }} FvgTapEvent */

const FVG_TAP_COLORS = {
  bull: `rgb(${PineColors.tv.teal.join(", ")})`,
  bear: `rgb(${PineColors.tv.maroon.join(", ")})`,
  pierce: `rgb(${PineColors.tv.orange.join(", ")})`,
};

const TF_15M_SEC = TF_MAP["15m"] ?? 900;

/** @param {string} [tfKey] */
function tfSeconds(tfKey = "15m") {
  return TF_MAP[tfKey] ?? TF_15M_SEC;
}

/** @param {number} middleTime — middle candle of the 3-bar FVG (display time) */
function formatFvgFormedEt(middleTime) {
  const DT = globalThis.luxon?.DateTime;
  if (DT) {
    const d = DT.fromSeconds(middleTime, { zone: ET_ZONE });
    if (d.isValid) return d.toFormat("M/d/yy h:mma").toLowerCase();
  }
  return "";
}

/** @param {"bull"|"bear"} direction @param {number} middleTime */
function fvgEventLabel(direction, middleTime) {
  const side = direction === "bull" ? "Bullish" : "Bearish";
  const formed = formatFvgFormedEt(middleTime);
  return formed ? `${side} FVG · ${formed}` : `${side} FVG`;
}

/** @param {{ time: number; high: number; low: number }[]} agg @param {number} idx */
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

/** @param {{ time: number }[]} bars @param {number} anchorUnix @param {string} [tfKey] */
function aggregateHtfBars(bars, anchorUnix, tfKey = "15m") {
  return aggregateBarsThroughAnchor(bars, anchorUnix, tfKey);
}

/** HTF bucket fully closed at this base-bar instant. */
function isBucketCompleteAt(barTime, atUnix, tfSec) {
  return barTime + tfSec <= atUnix;
}

/**
 * Third HTF candle fully printed at `atUnix` (same rule as chart FVG overlay / isFvgProvisional).
 * @param {{ confirmTime: number }} zone
 * @param {number} atUnix — 1m bar open at replay tip or tap bar
 * @param {number} tfSec
 */
function isZoneConfirmedAt(zone, atUnix, tfSec) {
  if (!Number.isFinite(atUnix)) return false;
  return !isFvgProvisional({ confirmTime: zone.confirmTime }, tfSec, atUnix);
}

/**
 * Zone still active at `atUnix` — mitigated only by completed HTF closes (not partial bucket agg).
 * @param {{ direction: "bull"|"bear"; top: number; bottom: number; confirmTime: number }} zone
 * @param {ReturnType<typeof aggregateCandles>} aggregateHtfBars
 * @param {number} atUnix — 1m bar time being evaluated
 * @param {number} tfSec
 */
function zoneActiveAt(zone, aggregateHtfBars, atUnix, tfSec) {
  const t0 = profileOn() ? performance.now() : 0;
  if (profileOn()) profileInc("fvgZoneActiveAtCalls");
  if (atUnix <= zone.confirmTime) {
    if (profileOn()) profileAdd("fvgZoneActiveAtMs", performance.now() - t0);
    return false;
  }
  if (!isZoneConfirmedAt(zone, atUnix, tfSec)) {
    if (profileOn()) profileAdd("fvgZoneActiveAtMs", performance.now() - t0);
    return false;
  }

  for (const bar of aggregateHtfBars) {
    if (bar.time <= zone.confirmTime) continue;
    if (bar.time > atUnix) break;
    if (!isBucketCompleteAt(bar.time, atUnix, tfSec)) continue;

    const closeFilled =
      zone.direction === "bull" ? bar.close < zone.bottom : bar.close > zone.top;
    if (closeFilled) {
      if (profileOn()) profileAdd("fvgZoneActiveAtMs", performance.now() - t0);
      return false;
    }
  }

  if (profileOn()) profileAdd("fvgZoneActiveAtMs", performance.now() - t0);
  return true;
}

/**
 * Wick pierced through zone but no completed HTF close-fill yet at `atUnix`.
 * @param {{ direction: "bull"|"bear"; top: number; bottom: number; confirmTime: number }} zone
 * @param {ReturnType<typeof aggregateCandles>} aggregateHtfBars
 * @param {number} atUnix
 * @param {number} tfSec
 */
function zonePiercedAt(zone, aggregateHtfBars, atUnix, tfSec) {
  const t0 = profileOn() ? performance.now() : 0;
  if (profileOn()) profileInc("fvgZonePiercedAtCalls");
  if (!zoneActiveAt(zone, aggregateHtfBars, atUnix, tfSec)) {
    if (profileOn()) profileAdd("fvgZonePiercedAtMs", performance.now() - t0);
    return false;
  }

  let pierced = false;
  for (const bar of aggregateHtfBars) {
    if (bar.time <= zone.confirmTime) continue;
    if (bar.time > atUnix) break;

    const bucketComplete = isBucketCompleteAt(bar.time, atUnix, tfSec);
    const closePierced =
      zone.direction === "bull" ? bar.close < zone.bottom : bar.close > zone.top;
    const closeInside =
      zone.direction === "bull"
        ? bar.close >= zone.bottom && bar.close <= zone.top
        : bar.close >= zone.bottom && bar.close <= zone.top;
    const wickPierced =
      zone.direction === "bull" ? bar.low < zone.bottom : bar.high > zone.top;

    if (!bucketComplete) {
      pierced = closePierced;
    } else if (closePierced) {
      pierced = true;
    } else if (closeInside) {
      pierced = false;
    } else if (wickPierced) {
      pierced = true;
    } else {
      pierced = false;
    }
  }
  if (profileOn()) profileAdd("fvgZonePiercedAtMs", performance.now() - t0);
  return pierced;
}

/**
 * @param {ReturnType<typeof aggregateCandles>} aggregateHtfBars
 * @param {number} anchorTime
 * @param {number | string | null | undefined} [setupId]
 */
function buildFvgZones(htfBars, anchorTime, setupId) {
  const gapFilter = fvgTapGapSizeFilterForSetup(setupId);
  /** @type {{ id: string; direction: "bull"|"bear"; top: number; bottom: number; confirmTime: number; middleTime: number }[]} */
  const zones = [];
  for (let i = 2; i < htfBars.length; i++) {
    if (htfBars[i].time > anchorTime) break;
    const born = fvgAt(htfBars, i);
    if (!born) continue;
    if (!gapPassesSizeFilter(gapFilter, born.top, born.bottom)) continue;

    zones.push({
      id: `${born.startTime}:${born.confirmTime}`,
      direction: born.direction,
      top: born.top,
      bottom: born.bottom,
      confirmTime: born.confirmTime,
      middleTime: born.middleTime,
    });
  }
  return zones;
}

/** @param {{ low: number }} bar @param {{ top: number }} zone */
function touchesBullishFVG(bar, zone) {
  return bar.low <= zone.top;
}

/** @param {{ high: number }} bar @param {{ bottom: number }} zone */
function touchesBearishFVG(bar, zone) {
  return bar.high >= zone.bottom;
}

/**
 * Close through supporting FVG tap zone after `afterTime`.
 * @param {{ time: number; close: number }[]} slice
 * @param {number} afterTime
 * @param {string} bias
 * @param {{ top: number; bottom: number } | null | undefined} tap
 */


function tapEventFromZone(z, barTime, aggregateHtfBars, anchorUnix, tfSec) {
  const pierced = zonePiercedAt(z, aggregateHtfBars, anchorUnix, tfSec);
  return {
    id: z.id,
    direction: z.direction,
    top: z.top,
    bottom: z.bottom,
    confirmTime: z.confirmTime,
    middleTime: z.middleTime,
    time: barTime,
    label: fvgEventLabel(z.direction, z.middleTime),
    color: pierced ? FVG_TAP_COLORS.pierce : FVG_TAP_COLORS[z.direction],
    pierced,
  };
}


function appendCycleTap(taps, touch) {
  if (taps.some((t) => t.id === touch.id)) return;
  taps.push(touch);
}

export class FvgTapContext {
  static closedThroughTapFvg(slice, afterTime, bias, tap) {
    if (!tap || !Number.isFinite(afterTime)) return { done: false, time: null };
    for (const bar of slice) {
      if (bar.time < afterTime) continue;
      if (bias === "Bullish" && bar.close > tap.top) return { done: true, time: bar.time };
      if (bias === "Bearish" && bar.close < tap.bottom) return { done: true, time: bar.time };
    }
    return { done: false, time: null };
  }


  /**
   * First base-bar tap per active HTF FVG in the current bias regime through replay anchor.
   * @param {{ time: number; high: number; low: number; close: number }[]} bars
   * @param {number | null | undefined} anchorUnix
   * @param {number} [regimeStart] — only count taps on/after this unix (first HTF sweep in regime)
   * @param {string} [tfKey]
   * @param {number | string | null | undefined} [setupId]
   * @returns {FvgTapEvent[]}
   */
  static buildHtfFvgTapEvents(bars, anchorUnix, regimeStart = Infinity, tfKey = "15m", setupId) {
    if (!bars?.length || anchorUnix == null || Number.isNaN(regimeStart)) return [];

    const tfSec = tfSeconds(tfKey);
    const tSlice0 = profileOn() ? performance.now() : 0;
    const slice = sliceBarsThroughAnchor(bars, anchorUnix);
    if (profileOn()) profileAdd("fvgSliceMs", performance.now() - tSlice0);
    if (slice.length < 20) return [];

    const tAgg0 = profileOn() ? performance.now() : 0;
    const htfBars = aggregateHtfBars(bars, anchorUnix, tfKey);
    if (profileOn()) profileAdd("fvgAggHtfMs", performance.now() - tAgg0);

    const tZones0 = profileOn() ? performance.now() : 0;
    const zones = buildFvgZones(htfBars, anchorUnix, setupId);
    if (profileOn()) {
      profileAdd("fvgBuildZonesMs", performance.now() - tZones0);
      profileInc("fvgZoneCount", zones.length);
      profileInc("fvgHtfBarCount", htfBars.length);
      profileInc("fvgSliceBarCount", slice.length);
    }
    if (!zones.length) return [];

    /** @type {Set<string>} */
    const tappedIds = new Set();
    /** @type {FvgTapEvent[]} */
    const events = [];

    const tWalk0 = profileOn() ? performance.now() : 0;
    for (const bar of slice) {
      if (bar.time < regimeStart) continue;
      if (profileOn()) profileInc("fvgTapWalkBarChecks");

      for (const z of zones) {
        if (profileOn()) profileInc("fvgTapWalkZoneChecks");
        if (tappedIds.has(z.id)) continue;
        if (!zoneActiveAt(z, htfBars, bar.time, tfSec)) continue;

        const hit = z.direction === "bull" ? touchesBullishFVG(bar, z) : touchesBearishFVG(bar, z);
        if (!hit) continue;

        tappedIds.add(z.id);
        events.push({
          id: z.id,
          direction: z.direction,
          top: z.top,
          bottom: z.bottom,
          confirmTime: z.confirmTime,
          middleTime: z.middleTime,
          time: bar.time,
          label: fvgEventLabel(z.direction, z.middleTime),
          color: FVG_TAP_COLORS[z.direction],
        });
      }
    }
    if (profileOn()) profileAdd("fvgTapWalkMs", performance.now() - tWalk0);

    const tPierce0 = profileOn() ? performance.now() : 0;
    for (const ev of events) {
      const z = zones.find((x) => x.id === ev.id);
      if (!z) continue;
      ev.pierced = zonePiercedAt(z, htfBars, anchorUnix, tfSec);
      if (ev.pierced) ev.color = FVG_TAP_COLORS.pierce;
    }

    const active = events.filter((ev) => {
      const z = zones.find((x) => x.id === ev.id);
      return z && zoneActiveAt(z, htfBars, anchorUnix, tfSec);
    });
    if (profileOn()) profileAdd("fvgPierceFilterMs", performance.now() - tPierce0);

    return active.sort((a, b) => a.time - b.time);
  }

  /**
   * @param {{ id: string; direction: "bull"|"bear"; top: number; bottom: number; confirmTime: number; middleTime: number }} z
   * @param {number} barTime
   * @param {ReturnType<typeof aggregateCandles>} aggregateHtfBars
   * @param {number} anchorUnix
   * @returns {FvgTapEvent}
   */

  /**
   * Latest wick touch of an active same-side 15m FVG on or before `beforeTime` (Setup #1 IFVG recency).
   * @param {{ time: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} regimeStart
   * @param {string} bias
   * @param {number} beforeTime — inclusive (IFVG bar time)
   * @returns {number}
   */
  static latestSameSideFvgTouchBefore(bars, anchorUnix, regimeStart, bias, beforeTime, tfKey = "15m", setupId) {
    if (!bars?.length || anchorUnix == null || !Number.isFinite(beforeTime)) return -Infinity;

    const side = bias === "Bullish" ? "bull" : bias === "Bearish" ? "bear" : null;
    if (!side) return -Infinity;

    const tfSec = tfSeconds(tfKey);
    const slice = sliceBarsThroughAnchor(bars, anchorUnix);
    if (slice.length < 20) return -Infinity;

    const htfBars = aggregateHtfBars(bars, anchorUnix, tfKey);
    const zones = buildFvgZones(htfBars, anchorUnix, setupId).filter((z) => z.direction === side);
    if (!zones.length) return -Infinity;

    let latest = -Infinity;
    for (const bar of slice) {
      if (bar.time < regimeStart || bar.time > beforeTime) continue;
      for (const z of zones) {
        if (!zoneActiveAt(z, htfBars, bar.time, tfSec)) continue;
        const hit = side === "bull" ? touchesBullishFVG(bar, z) : touchesBearishFVG(bar, z);
        if (hit) latest = Math.max(latest, bar.time);
      }
    }
    return latest;
  }

  /**
   * Latest wick touch of an active opposite-direction 15m FVG after `afterTime` (Setup #1 IFVG gate).
   * @param {{ time: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} regimeStart
   * @param {string} bias
   * @param {number} afterTime — qualifying same-side tap time
   * @returns {number} unix of latest opposite touch, or -Infinity
   */
  static latestOppositeFvgTouchTime(bars, anchorUnix, regimeStart, bias, afterTime, tfKey = "15m", setupId) {
    if (!bars?.length || anchorUnix == null || !Number.isFinite(afterTime)) return -Infinity;

    const opposite = bias === "Bullish" ? "bear" : bias === "Bearish" ? "bull" : null;
    if (!opposite) return -Infinity;

    const tfSec = tfSeconds(tfKey);
    const slice = sliceBarsThroughAnchor(bars, anchorUnix);
    if (slice.length < 20) return -Infinity;

    const htfBars = aggregateHtfBars(bars, anchorUnix, tfKey);
    const zones = buildFvgZones(htfBars, anchorUnix, setupId).filter((z) => z.direction === opposite);
    if (!zones.length) return -Infinity;

    let latest = -Infinity;
    for (const bar of slice) {
      if (bar.time < regimeStart || bar.time <= afterTime) continue;
      for (const z of zones) {
        if (!zoneActiveAt(z, htfBars, bar.time, tfSec)) continue;
        const hit = opposite === "bull" ? touchesBullishFVG(bar, z) : touchesBearishFVG(bar, z);
        if (hit) latest = Math.max(latest, bar.time);
      }
    }
    return latest;
  }

  /** @typedef {{ taps: FvgTapEvent[]; anchorTap: FvgTapEvent | null }} Setup2Cycle */

  /**
   * One row per 15m FVG zone per cycle (first touch only — no repeat each bar).
   * @param {FvgTapEvent[]} taps
   * @param {FvgTapEvent} touch
   */

  /**
   * Setup #2 cycle — accumulate same-direction 15m FVG touches; opposite direction resets.
   * @param {{ time: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} [regimeStart]
   * @returns {Setup2Cycle}
   */
  static resolveSetup2Cycle(bars1m, anchorUnix, regimeStart = 0, tfKey = "15m", setupId = 2) {
    const empty = /** @type {Setup2Cycle} */ ({ taps: [], anchorTap: null });
    if (!bars1m?.length || anchorUnix == null || Number.isNaN(regimeStart)) return empty;

    const tfSec = tfSeconds(tfKey);
    const slice = sliceBarsThroughAnchor(bars1m, anchorUnix);
    if (slice.length < 20) return empty;

    const htfBars = aggregateHtfBars(bars1m, anchorUnix, tfKey);
    const zones = buildFvgZones(htfBars, anchorUnix, setupId);
    if (!zones.length) return empty;

    /** @type {"bull"|"bear"|null} */
    let cycleDir = null;
    /** @type {FvgTapEvent[]} */
    const cycleTaps = [];

    for (const bar of slice) {
      if (bar.time < regimeStart) continue;

      /** @type {FvgTapEvent[]} */
      const barTouches = [];
      for (const z of zones) {
        if (!zoneActiveAt(z, htfBars, bar.time, tfSec)) continue;
        const hit = z.direction === "bull" ? touchesBullishFVG(bar, z) : touchesBearishFVG(bar, z);
        if (!hit) continue;
        barTouches.push(tapEventFromZone(z, bar.time, htfBars, anchorUnix, tfSec));
      }
      if (!barTouches.length) continue;

      const opposite = cycleDir
        ? barTouches.filter((t) => t.direction !== cycleDir)
        : [];
      const same = cycleDir ? barTouches.filter((t) => t.direction === cycleDir) : barTouches;

      if (opposite.length) {
        cycleDir = opposite[opposite.length - 1].direction;
        cycleTaps.length = 0;
        for (const touch of opposite) {
          if (touch.direction === cycleDir) appendCycleTap(cycleTaps, touch);
        }
        continue;
      }

      if (!cycleDir) {
        cycleDir = barTouches[barTouches.length - 1].direction;
        cycleTaps.length = 0;
        for (const touch of barTouches) {
          if (touch.direction === cycleDir) appendCycleTap(cycleTaps, touch);
        }
        continue;
      }

      for (const touch of same) appendCycleTap(cycleTaps, touch);
    }

    const activeTaps = cycleTaps.filter((tap) => {
      const zone = zones.find((x) => x.id === tap.id);
      return zone && zoneActiveAt(zone, htfBars, anchorUnix, tfSec);
    });

    return {
      taps: activeTaps,
      anchorTap: activeTaps[0] ?? null,
    };
  }

  /**
   * Setup #2 bias cycles — each starts at the first same-side 15m tap; opposite touch opens the next.
   * @param {{ time: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} [sessionStart]
   * @returns {{ start: number; end: number }[]}
   */
  static splitSetup2Cycles(bars1m, anchorUnix, sessionStart = 0, tfKey = "15m", setupId = 2) {
    /** @type {{ start: number; end: number }[]} */
    const cycles = [];
    if (!bars1m?.length || anchorUnix == null || Number.isNaN(sessionStart)) return cycles;

    const tfSec = tfSeconds(tfKey);
    const slice = sliceBarsThroughAnchor(bars1m, anchorUnix);
    if (slice.length < 20) return cycles;

    const htfBars = aggregateHtfBars(bars1m, anchorUnix, tfKey);
    const zones = buildFvgZones(htfBars, anchorUnix, setupId);
    if (!zones.length) return cycles;

    /** @type {"bull"|"bear"|null} */
    let cycleDir = null;
    /** @type {FvgTapEvent[]} */
    const cycleTaps = [];
    /** @type {number | null} */
    let cycleStart = null;

    for (const bar of slice) {
      if (bar.time < sessionStart) continue;

      /** @type {FvgTapEvent[]} */
      const barTouches = [];
      for (const z of zones) {
        if (!zoneActiveAt(z, htfBars, bar.time, tfSec)) continue;
        const hit = z.direction === "bull" ? touchesBullishFVG(bar, z) : touchesBearishFVG(bar, z);
        if (!hit) continue;
        barTouches.push(tapEventFromZone(z, bar.time, htfBars, anchorUnix, tfSec));
      }
      if (!barTouches.length) continue;

      const opposite = cycleDir ? barTouches.filter((t) => t.direction !== cycleDir) : [];
      const same = cycleDir ? barTouches.filter((t) => t.direction === cycleDir) : barTouches;

      if (opposite.length) {
        cycleDir = opposite[opposite.length - 1].direction;
        cycleTaps.length = 0;
        for (const touch of opposite) {
          if (touch.direction === cycleDir) appendCycleTap(cycleTaps, touch);
        }
        const newStart = cycleTaps[0]?.time;
        if (cycleStart != null && newStart != null) {
          cycles.push({ start: cycleStart, end: newStart });
        }
        cycleStart = newStart ?? cycleStart;
        continue;
      }

      if (!cycleDir) {
        cycleDir = barTouches[barTouches.length - 1].direction;
        cycleTaps.length = 0;
        for (const touch of barTouches) {
          if (touch.direction === cycleDir) appendCycleTap(cycleTaps, touch);
        }
        cycleStart = cycleTaps[0]?.time ?? null;
        continue;
      }

      for (const touch of same) appendCycleTap(cycleTaps, touch);
    }

    if (cycleStart != null) {
      cycles.push({ start: cycleStart, end: Infinity });
    }
    return cycles;
  }

  /**
   * @param {{ time: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {number} [regimeStart]
   * @returns {FvgTapEvent | null}
   */
  static resolveSetup2CycleTap(bars1m, anchorUnix, regimeStart = 0) {
    return resolveSetup2Cycle(bars1m, anchorUnix, regimeStart).anchorTap;
  }

  /**
   * @param {{
   *   bias: string;
   *   biasHint: string;
   *   recentSweep: unknown;
   *   htfSweeps: import("./levelsCalc.js").HtfSweepEvent[];
   *   htfSweepDone: boolean;
   * }} sweepCtx
   * @param {FvgTapEvent[]} fvgTapEvents
   */
  static enrichWithFvgTaps(sweepCtx, fvgTapEvents) {
    const fvgTaps = fvgTapEvents || [];

    const bullTap = fvgTaps.some((t) => t.direction === "bull");
    const bearTap = fvgTaps.some((t) => t.direction === "bear");
    const fvgTapped =
      sweepCtx.bias === "Bullish" ? bullTap : sweepCtx.bias === "Bearish" ? bearTap : false;

    return { ...sweepCtx, fvgTaps, fvgTapped };
  }

  /**
   * First bias-matching 15m FVG tap time in the current regime (internal sweeps gate).
   * @param {FvgTapEvent[]} fvgTapEvents
   * @param {string} bias
   */
  static firstQualifyingFvgTapTime(fvgTapEvents, bias) {
    const tap = firstQualifyingFvgTap(fvgTapEvents, bias);
    return tap?.time ?? Infinity;
  }

  /**
   * First bias-matching 15m FVG tap in the current regime (used for close-through check).
   * @param {FvgTapEvent[]} fvgTapEvents
   * @param {string} bias
   */
  static firstQualifyingFvgTap(fvgTapEvents, bias) {
    if (!fvgTapEvents?.length || bias === "—") return null;
    const dir = bias === "Bullish" ? "bull" : bias === "Bearish" ? "bear" : null;
    if (!dir) return null;
    return fvgTapEvents.find((t) => t.direction === dir) ?? null;
  }

  /**
   * Latest bias-matching 15m FVG tap — re-anchors internal / IFVG / close-through when a new zone is touched.
   * @param {FvgTapEvent[]} fvgTapEvents
   * @param {string} bias
   */
  static latestQualifyingFvgTap(fvgTapEvents, bias) {
    if (!fvgTapEvents?.length || bias === "—") return null;
    const dir = bias === "Bullish" ? "bull" : bias === "Bearish" ? "bear" : null;
    if (!dir) return null;
    for (let i = fvgTapEvents.length - 1; i >= 0; i--) {
      if (fvgTapEvents[i].direction === dir) return fvgTapEvents[i];
    }
    return null;
  }

  /** @param {FvgTapEvent[]} fvgTapEvents @param {string} bias */
  static latestQualifyingFvgTapTime(fvgTapEvents, bias) {
    const tap = latestQualifyingFvgTap(fvgTapEvents, bias);
    return tap?.time ?? Infinity;
  }

  /** Setup #1 feed — only same-side taps (bearish setup ignores opposite bull touches). */
  static fvgTapsForBias(fvgTapEvents, bias) {
    if (!fvgTapEvents?.length || bias === "—") return fvgTapEvents ?? [];
    const dir = bias === "Bullish" ? "bull" : bias === "Bearish" ? "bear" : null;
    if (!dir) return fvgTapEvents;
    return fvgTapEvents.filter((t) => t.direction === dir);
  }


}

export const closedThroughTapFvg = (...a) => FvgTapContext.closedThroughTapFvg(...a);
export const buildHtfFvgTapEvents = (...a) => FvgTapContext.buildHtfFvgTapEvents(...a);
export const latestSameSideFvgTouchBefore = (...a) => FvgTapContext.latestSameSideFvgTouchBefore(...a);
export const latestOppositeFvgTouchTime = (...a) => FvgTapContext.latestOppositeFvgTouchTime(...a);
export const resolveSetup2Cycle = (...a) => FvgTapContext.resolveSetup2Cycle(...a);
export const splitSetup2Cycles = (...a) => FvgTapContext.splitSetup2Cycles(...a);
export const resolveSetup2CycleTap = (...a) => FvgTapContext.resolveSetup2CycleTap(...a);
export const enrichWithFvgTaps = (...a) => FvgTapContext.enrichWithFvgTaps(...a);
export const firstQualifyingFvgTapTime = (...a) => FvgTapContext.firstQualifyingFvgTapTime(...a);
export const firstQualifyingFvgTap = (...a) => FvgTapContext.firstQualifyingFvgTap(...a);
export const latestQualifyingFvgTap = (...a) => FvgTapContext.latestQualifyingFvgTap(...a);
export const latestQualifyingFvgTapTime = (...a) => FvgTapContext.latestQualifyingFvgTapTime(...a);
export const fvgTapsForBias = (...a) => FvgTapContext.fvgTapsForBias(...a);

/** @deprecated */ export const closedThrough15mFvg = closedThroughTapFvg;
/** @deprecated */ export const build15mFvgTapEvents = buildHtfFvgTapEvents;
/** @deprecated */ export const latestSameSide15mFvgTouchBefore = latestSameSideFvgTouchBefore;
/** @deprecated */ export const latestOpposite15mFvgTouchTime = latestOppositeFvgTouchTime;
