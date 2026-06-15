import { isBarUp } from "./barStyle.js";

/**
 * @param {object[]} bars
 * @param {object} sym
 */
export function buildCandleSeriesData(bars, sym) {
  const bodyUp = sym.bodyUpColor ?? "#089981";
  const bodyDown = sym.bodyDownColor ?? "#f23645";
  const borderUp = sym.bordersUpColor ?? bodyUp;
  const borderDown = sym.bordersDownColor ?? bodyDown;
  const wickUp = sym.wickUpColor ?? bodyUp;
  const wickDown = sym.wickDownColor ?? bodyDown;

  if (!sym.colorBarsOnPrevClose) {
    return bars.map(({ time, open, high, low, close, volume }) => ({
      time,
      open,
      high,
      low,
      close,
      volume,
    }));
  }

  return bars.map((bar, i) => {
    const prev = bars[i - 1];
    const up = isBarUp(bar, prev, true);
    const entry = {
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    };
    entry.color = sym.bodyVisible ? (up ? bodyUp : bodyDown) : "transparent";
    entry.borderColor = sym.bordersVisible ? (up ? borderUp : borderDown) : "transparent";
    entry.wickColor = sym.wickVisible ? (up ? wickUp : wickDown) : "transparent";
    return entry;
  });
}
