import { LineStyle } from "lightweight-charts";

/** @typedef {"bid" | "ask"} QuoteSide */

/**
 * Bid/ask via native lightweight-charts createPriceLine.
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getState
 */
export function attachBidAskLinesPrimitive(opts) {
  /** @type {Map<QuoteSide, import("lightweight-charts").IPriceLine>} */
  const lines = new Map();

  /** @param {QuoteSide} side */
  function removeSide(side) {
    const line = lines.get(side);
    if (!line) return;
    try {
      opts.series.removePriceLine(line);
    } catch {
      /* ignore */
    }
    lines.delete(side);
  }

  function sync() {
    const state = opts.getState();
    if (!state?.enabled) {
      for (const side of /** @type {QuoteSide[]} */ (["bid", "ask"])) {
        removeSide(side);
      }
      return;
    }

    const lineWidth = Math.max(1, Number(state.lineWidth) || 1);
    const lineStyle = state.lineStyle ?? LineStyle.Dotted;

    for (const side of /** @type {QuoteSide[]} */ (["bid", "ask"])) {
      const cfg = state[side];
      if (!cfg || cfg.price == null || !Number.isFinite(cfg.price)) {
        removeSide(side);
        continue;
      }

      const lineVisible = Boolean(cfg.lineVisible);
      const axisLabelVisible = Boolean(cfg.valueVisible);
      if (!lineVisible && !axisLabelVisible) {
        removeSide(side);
        continue;
      }

      const color = cfg.color ?? (side === "bid" ? "#2962FF" : "#F23645");
      const title = axisLabelVisible ? (side === "ask" ? "Ask" : "Bid") : "";
      const lineOptions = {
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
        existing.applyOptions(lineOptions);
      } else {
        lines.set(side, opts.series.createPriceLine(lineOptions));
      }
    }
  }

  sync();
  queueMicrotask(sync);
  requestAnimationFrame(sync);

  return {
    requestRefresh: () => sync(),
    destroy: () => {
      for (const side of /** @type {QuoteSide[]} */ (["bid", "ask"])) {
        removeSide(side);
      }
    },
  };
}
