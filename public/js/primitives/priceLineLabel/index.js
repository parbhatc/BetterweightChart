import { formatBarCloseCountdown, secondsUntilBarClose } from "../../chart/bar/countdown.js";
import { SYMBOL_PRICE_LINE_STYLE } from "../../chart/line/style.js";
import {
  attachCustomPriceLineHost,
  customPriceLineLabelHeight,
} from "../priceLine/customPriceLine.js";
import {
  SCALE_LABEL_H,
  SCALE_LABEL_FONT_SIZE,
  SCALE_LABEL_TITLE_FONT_SIZE,
  STACKED_LABEL_TOP_PAD,
  STACKED_LABEL_LINE_GAP,
  STACKED_LABEL_BOTTOM_PAD,
} from "../priceLine/axisLabelRenderer.js";

/** @param {boolean} [showCountdown] @param {import("lightweight-charts").IChartApi} [chart] */
export function symbolPriceLabelHeight(showCountdown = false, chart = null) {
  if (chart) return customPriceLineLabelHeight(chart, showCountdown);
  if (!showCountdown) return SCALE_LABEL_H;
  return (
    STACKED_LABEL_TOP_PAD +
    SCALE_LABEL_FONT_SIZE +
    STACKED_LABEL_LINE_GAP +
    SCALE_LABEL_TITLE_FONT_SIZE +
    STACKED_LABEL_BOTTOM_PAD
  );
}

/**
 * Symbol close price line + axis label (LWC-style custom price line).
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getState
 */
export function attachPriceLineLabelPrimitive(opts) {
  const host = attachCustomPriceLineHost({
    series: opts.series,
    getContext: () => {
      const state = opts.getState();
      return {
        scaleId: state.scaleId ?? "right",
        scaleVisible: state.scaleVisible !== false,
      };
    },
  });

  /** @type {import("../priceLine/customPriceLine.js").CustomPriceLineHandle | null} */
  let symbolLine = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let tickTimer = null;

  function sync() {
    const state = opts.getState();
    const showCountdown = Boolean(state.marketOpen);

    if (!state.enabled || state.scaleVisible === false) {
      symbolLine?.remove();
      symbolLine = null;
      host.requestRefresh();
      return;
    }

    const price = state.price;
    if (price == null || !Number.isFinite(price)) {
      symbolLine?.remove();
      symbolLine = null;
      host.requestRefresh();
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
      symbolLine?.remove();
      symbolLine = null;
      host.requestRefresh();
      return;
    }

    const options = {
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
      symbolLine.applyOptions(options);
    } else {
      symbolLine = host.createCustomPriceLine(options);
    }
    host.requestRefresh();
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
      symbolLine?.remove();
      host.destroy();
    },
  };
}
