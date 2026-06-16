import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
} from "lightweight-charts";
import { dateTime12h, toDate } from "../format.js";

const DEFAULT_VISIBLE_BARS = 96;
/** Empty bars of whitespace on the right for future time (TradingView-style). */
export const FUTURE_RIGHT_OFFSET = 48;

/**
 * @param {HTMLElement} el
 * @param {object} themeColors
 */
export function createTvChart(el, themeColors) {
  const c = themeColors;

  const chart = createChart(el, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: c.bg },
      textColor: c.text,
      fontSize: 12,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
    },
    grid: {
      vertLines: { color: c.grid },
      horzLines: { color: c.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: c.crosshair,
        width: 1,
        style: LineStyle.LargeDashed,
        labelBackgroundColor: c.labelBg,
      },
      horzLine: {
        color: c.crosshair,
        width: 1,
        style: LineStyle.LargeDashed,
        labelBackgroundColor: c.labelBg,
      },
    },
    rightPriceScale: {
      visible: true,
      borderColor: c.border,
      scaleMargins: { top: 0.08, bottom: 0.12 },
    },
    timeScale: {
      visible: true,
      borderColor: c.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: FUTURE_RIGHT_OFFSET,
      barSpacing: 8,
      minBarSpacing: 3,
      tickMarkFormatter: (time, tickMarkType) => {
        const d = toDate(time);
        switch (tickMarkType) {
          case TickMarkType.Year:
            return String(d.getFullYear());
          case TickMarkType.Month:
            return d.toLocaleDateString(undefined, { month: "short" });
          case TickMarkType.DayOfMonth:
            return String(d.getDate());
          case TickMarkType.Time:
            return d.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
          default:
            return "";
        }
      },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    kineticScroll: {
      mouse: true,
      touch: true,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true },
    },
    localization: {
      locale: navigator.language,
      timeFormatter: (t) => dateTime12h(toDate(t)),
    },
  });

  const series = chart.addSeries(CandlestickSeries, {
    upColor: c.up,
    downColor: c.down,
    wickUpColor: c.up,
    wickDownColor: c.down,
    borderVisible: false,
    lastValueVisible: true,
    priceLineVisible: true,
    priceFormat: { type: "price", precision: 2, minMove: 0.25 },
  });

  el.addEventListener(
    "wheel",
    (ev) => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const rw = chart.priceScale("right").width();
      const lw = chart.priceScale("left").width();
      const onRight = rw > 0 && x >= rect.width - rw;
      const onLeft = lw > 0 && x <= lw;
      if (!onRight && !onLeft) return;
      ev.preventDefault();
      ev.stopPropagation();

      const h = rect.height || 400;
      let dy = ev.deltaY;
      if (ev.deltaMode === 1) dy *= 16;
      else if (ev.deltaMode === 2) dy *= h;

      const step = Math.min(0.012, Math.max(0.0008, (Math.abs(dy) / h) * 0.055));
      const zoomIn = dy < 0;
      const ps = chart.priceScale(onLeft ? "left" : "right");
      const { scaleMargins } = ps.options();
      let top = scaleMargins?.top ?? 0.08;
      let bottom = scaleMargins?.bottom ?? 0.12;
      if (zoomIn) {
        top = Math.max(0.02, top - step);
        bottom = Math.max(0.02, bottom - step);
      } else {
        top = Math.min(0.48, top + step);
        bottom = Math.min(0.48, bottom + step);
      }
      ps.applyOptions({ autoScale: false, scaleMargins: { top, bottom } });
    },
    { passive: false, capture: true },
  );

  return {
    chart,
    series,
    applyTheme(colors) {
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: colors.bg },
          textColor: colors.text,
        },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        crosshair: {
          vertLine: { color: colors.crosshair, labelBackgroundColor: colors.labelBg },
          horzLine: { color: colors.crosshair, labelBackgroundColor: colors.labelBg },
        },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border },
      });
      series.applyOptions({
        upColor: colors.up,
        downColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      });
    },
    scrollToLatest(count = DEFAULT_VISIBLE_BARS) {
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const width = range.to - range.from;
      const offset = ts.options().rightOffset ?? FUTURE_RIGHT_OFFSET;
      ts.setVisibleLogicalRange({ from: count - width + offset * 0.35, to: count + offset });
    },
  };
}

/** @param {HTMLElement} el @param {object} bar @param {object | undefined} prev */
export function renderOhlc(el, bar, prev) {
  if (!bar) {
    el.innerHTML = `<span class="tv-ohlc__pair tv-ohlc__lbl">—</span>`;
    return;
  }
  const fmt = (n) => Number(n).toFixed(2);
  const pair = (lbl, val) =>
    `<span class="tv-ohlc__pair"><span class="tv-ohlc__lbl">${lbl}</span>${val}</span>`;
  let delta = "";
  if (prev) {
    const diff = bar.close - prev.close;
    const pct = (diff / prev.close) * 100;
    const sign = diff >= 0 ? "+" : "";
    const dir = diff >= 0 ? "up" : "down";
    delta = `<span class="tv-ohlc__delta tv-ohlc__delta--${dir}">${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)</span>`;
  }
  el.innerHTML = `${pair("O", fmt(bar.open))}${pair("H", fmt(bar.high))}${pair("L", fmt(bar.low))}${pair("C", fmt(bar.close))}${delta}`;
}

/** @param {object[]} bars */
export function barIndex(bars) {
  const map = new Map();
  bars.forEach((b, i) => map.set(b.time, i));
  return map;
}
