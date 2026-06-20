import { FVG_EXTEND_BARS } from "../core/constants.js";

export class Fvg {
  /** Stable id for one FVG instance (same gap on a given timeframe). */
  static instanceKey(f, tfSec) {
    return `${tfSec}:${f.startTime}:${f.confirmTime}:${f.direction}`;
  }

  /**
   * ICT-style 3-candle FVG on aggregated series.
   * @param {{ time: number; high: number; low: number }[]} bars ascending
   * @param {number} tfSec
   */
  static detect(bars, tfSec, extendBars = FVG_EXTEND_BARS) {
    const fvgs = [];
    for (let i = 2; i < bars.length; i++) {
      const first = bars[i - 2];
      const last = bars[i];
      let direction;
      let top;
      let bottom;
      if (last.low > first.high) {
        direction = "long";
        top = first.high;
        bottom = last.low;
      } else if (last.high < first.low) {
        direction = "short";
        top = last.high;
        bottom = first.low;
      } else {
        continue;
      }
      const endTime = last.time + extendBars * tfSec;
      fvgs.push({ direction, startTime: first.time, endTime, top, bottom, confirmTime: last.time });
    }
    return fvgs;
  }

  /**
   * True until the confirming (3rd) candle’s period has fully printed vs 1m replay tip
   * (e.g. 15m FVG confirmed at 9:15 only after 1m data through 9:29 exists).
   * @param {{ confirmTime: number }} fvg
   * @param {number} fvgTfSec timeframe seconds of the series used to detect the FVG
   * @param {number | null} tip1mOpenUpper last 1m bar open unix included at replay tip (see main.js)
   */
  static isProvisional(fvg, fvgTfSec, tip1mOpenUpper) {
    if (tip1mOpenUpper == null || !Number.isFinite(fvgTfSec) || fvgTfSec < 1) return false;
    const lastMinuteOpenOfConfirmingBar = fvg.confirmTime + fvgTfSec - 60;
    return tip1mOpenUpper < lastMinuteOpenOfConfirmingBar;
  }

  /** Bull: filled when a later candle closes below the FVG lower bound. Bear: closes above upper bound. */
  static isFilled(fvg, bars) {
    const t0 = fvg.confirmTime;
    let i = 0;
    while (i < bars.length && bars[i].time <= t0) i++;
    for (; i < bars.length; i++) {
      const c = bars[i];
      if (fvg.direction === "long" && c.close < fvg.bottom) return true;
      if (fvg.direction === "short" && c.close > fvg.top) return true;
    }
    return false;
  }
}

export const fvgInstanceKey = (...a) => Fvg.instanceKey(...a);
export const detectFvgs = (...a) => Fvg.detect(...a);
export const isFvgProvisional = (...a) => Fvg.isProvisional(...a);
export const isFvgFilled = (...a) => Fvg.isFilled(...a);
