import {
  barSweepsLevel,
  levelBornTime,
  markSwept,
} from "/js/indicators/script/liquidityMatrix.js";
import { barContainsReleaseHm, inSession } from "./sweep.js";

/** @typedef {import("/js/indicators/script/liquidityMatrix.js").LiqLine} LiqLine */

/**
 * @param {object} bar
 * @param {number} chartTime
 * @param {{ label: string; color: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }} cfg
 * @param {Record<string, { active: boolean; hi?: LiqLine; lo?: LiqLine; born?: number }>} sessState
 * @param {Record<string, number[]>} sessBornTimes
 * @param {LiqLine[]} sessionLines
 * @param {number} maxSessions
 * @param {boolean} showLabels
 */
export function walkSessionBar(bar, chartTime, cfg, sessState, sessBornTimes, sessionLines, maxSessions, showLabels) {
  const st = sessState[cfg.label];
  const nowIn = inSession(bar.time, cfg);
  if (nowIn && !st.active) {
    const born = bar.time;
    const bornList = sessBornTimes[cfg.label];
    bornList.push(born);
    while (bornList.length > maxSessions) {
      const dropBorn = bornList.shift();
      for (let k = sessionLines.length - 1; k >= 0; k--) {
        if (sessionLines[k].sessionBorn === dropBorn && sessionLines[k].label.startsWith(cfg.label)) {
          sessionLines.splice(k, 1);
        }
      }
    }
    st.active = true;
    st.born = born;
    st.hi = {
      price: bar.high,
      startTime: bar.time,
      startChartTime: chartTime,
      bornTime: bar.time,
      endTime: bar.time,
      endChartTime: chartTime,
      label: `${cfg.label} High`,
      color: cfg.color,
      lineWidth: 2,
      kind: "high",
      swept: false,
      sessionBorn: born,
      showLabel: showLabels,
    };
    st.lo = {
      price: bar.low,
      startTime: bar.time,
      startChartTime: chartTime,
      bornTime: bar.time,
      endTime: bar.time,
      endChartTime: chartTime,
      label: `${cfg.label} Low`,
      color: cfg.color,
      lineWidth: 2,
      kind: "low",
      swept: false,
      sessionBorn: born,
      showLabel: showLabels,
    };
    sessionLines.push(st.hi, st.lo);
  } else if (nowIn && st.active && st.hi && st.lo) {
    if (bar.high >= st.hi.price) {
      st.hi.price = bar.high;
      st.hi.startTime = bar.time;
      st.hi.startChartTime = chartTime;
    }
    if (bar.low <= st.lo.price) {
      st.lo.price = bar.low;
      st.lo.startTime = bar.time;
      st.lo.startChartTime = chartTime;
    }
  } else if (!nowIn && st.active) {
    st.active = false;
  }
}

/** @param {object} bar @param {number} chartTime @param {LiqLine[]} sessionLines @param {{ label: string }[]} sessions @param {Set<string>} takenLiquidity */
export function sweepSessionLines(bar, chartTime, sessionLines, sessions, takenLiquidity) {
  for (const sl of sessionLines) {
    if (sl.swept) continue;
    const cfg = sessions.find((c) => sl.label.startsWith(c.label));
    const inOwnSession = cfg ? inSession(bar.time, cfg) : false;
    if (!inOwnSession && bar.time > levelBornTime(sl) && barSweepsLevel(bar, sl.kind, sl.price)) {
      markSwept(sl, bar.time, chartTime, takenLiquidity);
      continue;
    }
    sl.endTime = bar.time;
    sl.endChartTime = chartTime;
  }
}

/**
 * @param {object} bar
 * @param {number} chartTime
 * @param {number} chartSec
 * @param {Map<string, { prefix: string; color: string; hm: string }>} releasePlan
 * @param {Set<string>} releaseBornDays
 * @param {LiqLine[]} releaseLines
 * @param {boolean} showLabels
 */
export function walkReleaseBar(bar, chartTime, chartSec, releasePlan, releaseBornDays, releaseLines, showLabels) {
  for (const [releaseDay, rel] of releasePlan) {
    if (releaseBornDays.has(releaseDay)) continue;
    if (!barContainsReleaseHm(bar, releaseDay, rel.hm, chartSec)) continue;
    releaseBornDays.add(releaseDay);
    releaseLines.push(
      {
        price: bar.high,
        startTime: bar.time,
        startChartTime: chartTime,
        bornTime: bar.time,
        endTime: bar.time,
        endChartTime: chartTime,
        label: `${rel.prefix} High`,
        color: rel.color,
        lineWidth: 2,
        kind: "high",
        swept: false,
        showLabel: showLabels,
      },
      {
        price: bar.low,
        startTime: bar.time,
        startChartTime: chartTime,
        bornTime: bar.time,
        endTime: bar.time,
        endChartTime: chartTime,
        label: `${rel.prefix} Low`,
        color: rel.color,
        lineWidth: 2,
        kind: "low",
        swept: false,
        showLabel: showLabels,
      },
    );
  }
}

/** @param {object} bar @param {number} chartTime @param {LiqLine[]} releaseLines @param {Set<string>} takenLiquidity */
export function sweepReleaseLines(bar, chartTime, releaseLines, takenLiquidity) {
  for (const rl of releaseLines) {
    if (rl.swept) continue;
    if (bar.time > levelBornTime(rl) && barSweepsLevel(bar, rl.kind, rl.price)) {
      markSwept(rl, bar.time, chartTime, takenLiquidity);
      continue;
    }
    rl.endTime = bar.time;
    rl.endChartTime = chartTime;
  }
}
