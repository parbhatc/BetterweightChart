import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
} from "lightweight-charts";
import { dateTime12h, toDate } from "../format.js";
import { lwcPaneIndexAtY } from "../pane/studyScale.js";
import { patchChartPrimitiveLogging } from "../primitiveLogging.js";

const DEFAULT_VISIBLE_BARS = 96;
/** Right offset (bars) so the chart can scroll into empty future time. */
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
      panes: {
        enableResize: false,
        separatorColor: c.bg,
        separatorHoverColor: c.bg,
      },
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

  const chartContext = el.id || "chart";
  patchChartPrimitiveLogging(chart, chartContext);

  const series = chart.addSeries(CandlestickSeries, {
    upColor: c.up,
    downColor: c.down,
    wickUpColor: c.up,
    wickDownColor: c.down,
    borderVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
    priceFormat: { type: "price", precision: 2, minMove: 0.25 },
  });

  // Scale margins only here; autoScale comes from settings. After the first bar
  // load we fit once then lock autoScale off for free chart-body dragging.
  series.priceScale().applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.12 },
  });

  el.addEventListener(
    "wheel",
    (ev) => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const rw = chart.priceScale("right").width();
      const lw = chart.priceScale("left").width();
      const onRight = rw > 0 && x >= rect.width - rw;
      const onLeft = lw > 0 && x <= lw;
      if (!onRight && !onLeft) return;

      // Only zoom the main (price) pane — study panes keep their own fixed scales.
      if (lwcPaneIndexAtY(chart, y) !== 0) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      const h = rect.height || 400;
      let dy = ev.deltaY;
      if (ev.deltaMode === 1) dy *= 16;
      else if (ev.deltaMode === 2) dy *= h;

      const step = Math.min(0.012, Math.max(0.0008, (Math.abs(dy) / h) * 0.055));
      const zoomIn = dy < 0;
      // Use the main candle series scale so study-pane scales stay independent.
      const ps = series.priceScale();
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
      try {
        chart.priceScale("right").applyOptions({ autoScale: false, scaleMargins: { top, bottom } });
        chart.priceScale("left").applyOptions({ autoScale: false, scaleMargins: { top, bottom } });
      } catch {
        /* ignore */
      }
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
          panes: {
            enableResize: false,
            separatorColor: colors.bg,
            separatorHoverColor: colors.bg,
          },
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
    scrollToLatest(barCount) {
      const count = barCount ?? DEFAULT_VISIBLE_BARS;
      if (!count) return;
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      const width = range ? range.to - range.from : DEFAULT_VISIBLE_BARS;
      const offset = ts.options().rightOffset ?? FUTURE_RIGHT_OFFSET;
      const lastIdx = count - 1;
      ts.setVisibleLogicalRange({
        from: lastIdx - width + offset * 0.35,
        to: lastIdx + offset,
      });
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
