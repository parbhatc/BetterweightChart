import { TF_MAP } from "../core/constants.js";
import { Aggregate } from "./aggregate.js";

export class BarsIndex {
  /** @param {{ time: number }[]} raw1m @param {number | null} tipUnix @returns {number | null} */
  static normalizeTip(raw1m, tipUnix) {
    if (!raw1m.length || tipUnix == null || !Number.isFinite(tipUnix)) return null;
    let best = null;
    for (const c of raw1m) {
      if (c.time <= tipUnix && (best === null || c.time > best)) best = c.time;
    }
    return best;
  }

  static sessionOpen(bars, openTimeUnix) {
    if (!bars.length) return 0;
    if (openTimeUnix == null) return bars.length - 1;
    const idx = bars.findIndex((b) => b.time >= openTimeUnix);
    return idx === -1 ? bars.length - 1 : idx;
  }

  static aggThroughTip(bars, tipOpenTime) {
    if (!bars.length || tipOpenTime == null) return 0;
    let lo = 0;
    let hi = bars.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time <= tipOpenTime) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  static aggForReplayTip(bars, tipOpenTime, tfKey) {
    if (!bars.length || tipOpenTime == null) return 0;
    if (tfKey === "1m") {
      const idx = bars.findIndex((b) => b.time === tipOpenTime);
      return idx !== -1 ? idx : BarsIndex.aggThroughTip(bars, tipOpenTime);
    }
    const tfSec = TF_MAP[tfKey] ?? 60;
    const bucketOpen = Aggregate.bucketTime(tipOpenTime, tfSec);
    const exact = bars.findIndex((b) => b.time === bucketOpen);
    if (exact !== -1) return exact;
    return BarsIndex.aggThroughTip(bars, tipOpenTime);
  }

  static current1mOpen(raw1m, windowed, visibleEndIdx, tfKey) {
    if (!raw1m.length || !windowed.length || visibleEndIdx < 0 || visibleEndIdx >= windowed.length) return null;
    const tfSec = TF_MAP[tfKey] ?? 60;
    const included = new Set();
    for (let i = 0; i <= visibleEndIdx; i++) {
      included.add(windowed[i].time);
    }
    let maxT = null;
    for (const c of raw1m) {
      const b = Aggregate.bucketTime(c.time, tfSec);
      if (included.has(b)) {
        if (maxT === null || c.time > maxT) maxT = c.time;
      }
    }
    return maxT;
  }
}
