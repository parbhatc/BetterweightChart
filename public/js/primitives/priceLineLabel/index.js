import { formatBarCloseCountdown, secondsUntilBarClose } from "../../chart/bar/countdown.js";
import { SYMBOL_PRICE_LINE_STYLE } from "../../chart/line/style.js";
import {
  SCALE_LABEL_H,
  SCALE_LABEL_TITLE_FONT_SIZE,
  STACKED_LABEL_LINE_GAP,
  STACKED_LABEL_BOTTOM_PAD,
} from "../priceLine/axisLabelRenderer.js";

/** @param {boolean} [showCountdown] */
export function symbolPriceLabelHeight(showCountdown = false) {
  if (!showCountdown) return SCALE_LABEL_H;
  return (
    SCALE_LABEL_H +
    STACKED_LABEL_LINE_GAP +
    SCALE_LABEL_TITLE_FONT_SIZE +
    STACKED_LABEL_BOTTOM_PAD
  );
}

/**
 * Symbol close price line + axis label via native lightweight-charts createPriceLine.
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getState
 */
export function attachPriceLineLabelPrimitive(opts) {
  /** @type {import("lightweight-charts").IPriceLine | null} */
  let symbolLine = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let tickTimer = null;

  function sync() {
    const state = opts.getState();
    const showCountdown = Boolean(state.countdownToBarClose && state.marketOpen);
    const active = Boolean(
      state.symbolLabelActive ||
        state.lineVisible ||
        state.axisLabelVisible ||
        state.title ||
        showCountdown,
    );

    if (!active || state.scaleVisible === false) {
      if (symbolLine) {
        opts.series.removePriceLine(symbolLine);
        symbolLine = null;
      }
      return;
    }

    const price = state.price;
    if (price == null || !Number.isFinite(price)) {
      if (symbolLine) {
        opts.series.removePriceLine(symbolLine);
        symbolLine = null;
      }
      return;
    }

    const axisLabelVisible =
      state.axisLabelVisible !== false && Boolean(state.priceText);
    const lineVisible = Boolean(state.lineVisible);
    const title = state.title ?? "";
    const axisSubtitleText =
      showCountdown && state.barSec
        ? formatBarCloseCountdown(secondsUntilBarClose(state.barSec))
        : "";

    if (!lineVisible && !axisLabelVisible && !title) {
      if (symbolLine) {
        opts.series.removePriceLine(symbolLine);
        symbolLine = null;
      }
      return;
    }

    const lineOptions = {
      id: "symbol",
      price,
      color: state.color,
      lineVisible,
      axisLabelVisible,
      axisLabelColor: state.color,
      axisLabelTextColor: "#ffffff",
      axisLabelText: state.priceText ?? "",
      axisSubtitleText,
      title,
      lineWidth: Math.max(1, Number(state.lineWidth) || 1),
      lineStyle: state.lineStyle ?? SYMBOL_PRICE_LINE_STYLE,
    };

    if (symbolLine) {
      symbolLine.applyOptions(lineOptions);
    } else {
      symbolLine = opts.series.createPriceLine(lineOptions);
    }
  }

  sync();
  queueMicrotask(sync);
  requestAnimationFrame(sync);
  tickTimer = window.setInterval(sync, 1000);

  return {
    requestRefresh: () => sync(),
    destroy: () => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      if (symbolLine) {
        try {
          opts.series.removePriceLine(symbolLine);
        } catch {
          /* ignore */
        }
        symbolLine = null;
      }
    },
  };
}
