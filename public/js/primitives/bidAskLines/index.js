import { LineStyle } from "lightweight-charts";
import { attachCustomPriceLineHost } from "../priceLine/customPriceLine.js";

/** @typedef {"bid" | "ask"} QuoteSide */

/**
 * Bid/ask via custom price line (stacks against symbol anchor when noOverlappingLabels is on).
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getState
 */
export function attachBidAskLinesPrimitive(opts) {
  const host = attachCustomPriceLineHost({
    series: opts.series,
    getContext: () => {
      const state = opts.getState();
      return {
        scaleId: state.scaleId ?? "right",
        scaleVisible: state.scaleVisible !== false,
        reservedAnchors: state.reservedAnchors ?? [],
        noOverlappingLabels: state.noOverlappingLabels !== false,
      };
    },
  });

  /** @type {Map<QuoteSide, import("../priceLine/customPriceLine.js").CustomPriceLineHandle>} */
  const lines = new Map();

  function sync() {
    const state = opts.getState();
    if (!state?.enabled) {
      for (const side of /** @type {QuoteSide[]} */ (["bid", "ask"])) {
        lines.get(side)?.remove();
        lines.delete(side);
      }
      host.requestRefresh();
      return;
    }

    const lineWidth = Math.max(1, Number(state.lineWidth) || 1);
    const lineStyle = state.lineStyle ?? LineStyle.Dotted;

    for (const side of /** @type {QuoteSide[]} */ (["bid", "ask"])) {
      const cfg = state[side];
      if (!cfg || cfg.price == null || !Number.isFinite(cfg.price)) {
        lines.get(side)?.remove();
        lines.delete(side);
        continue;
      }

      const lineVisible = Boolean(cfg.lineVisible);
      const axisLabelVisible = Boolean(cfg.valueVisible);
      if (!lineVisible && !axisLabelVisible) {
        lines.get(side)?.remove();
        lines.delete(side);
        continue;
      }

      const color = cfg.color ?? (side === "bid" ? "#2962FF" : "#F23645");
      const title = axisLabelVisible ? (side === "ask" ? "Ask" : "Bid") : "";
      const options = {
        id: side,
        price: cfg.price,
        color,
        lineVisible,
        axisLabelVisible,
        axisLabelColor: color,
        axisLabelTextColor: "#ffffff",
        axisLabelText: axisLabelVisible ? (cfg.text ?? String(cfg.price)) : "",
        lineWidth,
        lineStyle,
        title,
      };

      const existing = lines.get(side);
      if (existing) {
        existing.applyOptions(options);
      } else {
        lines.set(side, host.createCustomPriceLine(options));
      }
    }

    host.requestRefresh();
  }

  sync();
  queueMicrotask(sync);
  requestAnimationFrame(sync);

  return {
    requestRefresh: () => sync(),
    destroy: () => {
      for (const side of /** @type {QuoteSide[]} */ (["bid", "ask"])) {
        lines.get(side)?.remove();
        lines.delete(side);
      }
      host.destroy();
    },
  };
}
