import { isBarUp } from "./style.js";

/**
 * One candle series point with optional per-bar colors (prev-close mode).
 * @param {object} bar
 * @param {object | undefined} prevBar
 * @param {object} sym
 */
export function buildCandleBarEntry(bar, prevBar, sym) {
  const bodyUp = sym.bodyUpColor ?? "#089981";
  const bodyDown = sym.bodyDownColor ?? "#f23645";
  const borderUp = sym.bordersUpColor ?? bodyUp;
  const borderDown = sym.bordersDownColor ?? bodyDown;
  const wickUp = sym.wickUpColor ?? bodyUp;
  const wickDown = sym.wickDownColor ?? bodyDown;

  const entry = {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };

  if (!sym.colorBarsOnPrevClose) return entry;

  const up = isBarUp(bar, prevBar, true);
  entry.color = sym.bodyVisible ? (up ? bodyUp : bodyDown) : "transparent";
  entry.borderColor = sym.bordersVisible ? (up ? borderUp : borderDown) : "transparent";
  entry.wickColor = sym.wickVisible ? (up ? wickUp : wickDown) : "transparent";
  return entry;
}

/**
 * @param {object[]} bars
 * @param {object} sym
 */
export function buildCandleSeriesData(bars, sym) {
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

  return bars.map((bar, i) => buildCandleBarEntry(bar, bars[i - 1], sym));
}
