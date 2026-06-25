import { LineStyle } from "lightweight-charts";
import {
  formatOrderLinePrice,
  resolveOrderLineFontFamily,
  resolveOrderLineFontSize,
  resolveOrderLineFontWeight,
} from "./rowLayout.js";

/** @param {number} lineStyle */
function mapOrderLineStyle(lineStyle) {
  if (lineStyle === 2) return LineStyle.Dotted;
  if (lineStyle === 1) return LineStyle.Dashed;
  return LineStyle.Solid;
}

/** @param {import("./types.js").OrderLineState} state */
export function stateToOrderLineOptions(state) {
  const color = state.lineColor || state.bodyBackgroundColor || "#089981";
  const qtyText = state.quantity?.trim() ?? "";

  return {
    id: state.id,
    price: state.price,
    color,
    lineVisible: true,
    axisLabelVisible: true,
    axisLabelColor: color,
    axisLabelTextColor: "#ffffff",
    axisLabelText: formatOrderLinePrice(state.price),
    lineWidth: 1,
    lineStyle: mapOrderLineStyle(state.lineStyle),
    pills: {
      visible: true,
      side: state.pillSide === "left" ? "left" : "right",
      offset: Math.max(0, Number(state.pillOffset) || 20),
      moving: Boolean(state.isMoving),
      body: {
        text: state.text ?? "",
        backgroundColor: state.bodyBackgroundColor || color,
        textColor: state.bodyTextColor || "#ffffff",
        borderColor: state.bodyBorderColor || "transparent",
        tooltip: state.bodyTooltip ?? "",
        fontSize: resolveOrderLineFontSize(state.bodyFontSize),
        fontWeight: resolveOrderLineFontWeight(state.bodyFontWeight),
        fontFamily: resolveOrderLineFontFamily(state.bodyFontFamily),
        visible: true,
      },
      quantity: {
        text: qtyText,
        backgroundColor: state.quantityBackgroundColor || color,
        textColor: state.quantityTextColor || "#ffffff",
        borderColor: state.quantityBorderColor || "#000000",
        tooltip: state.quantityTooltip ?? "",
        fontSize: resolveOrderLineFontSize(state.quantityFontSize),
        fontWeight: resolveOrderLineFontWeight(state.quantityFontWeight),
        fontFamily: resolveOrderLineFontFamily(state.quantityFontFamily),
        visible: Boolean(qtyText),
      },
      cancel: {
        visible: true,
        backgroundColor: state.cancelButtonBackgroundColor ?? "rgba(255, 255, 255, 0.96)",
        borderColor: state.cancelButtonBorderColor ?? "#000000",
        iconColor: state.cancelButtonIconColor ?? "#000000",
        tooltip: state.cancelTooltip ?? "",
      },
    },
  };
}

/**
 * Sync TradingView order lines to native series.createOrderLine().
 * @param {() => object | null | undefined} getActivePane
 */
export function createOrderLinePriceLineSync(getActivePane) {
  /** @type {import("lightweight-charts").ISeriesApi | null} */
  let seriesRef = null;
  /** @type {Map<string, import("lightweight-charts").IOrderLine>} */
  const lines = new Map();

  /**
   * @param {import("./types.js").OrderLineState[]} states
   * @param {Map<string, ReturnType<import("./createOrderLineAdapter.js").createOrderLineAdapter>>} [adapters]
   */
  function sync(states, adapters) {
    const pane = getActivePane();
    if (!pane?.series) {
      destroy();
      return;
    }

    if (seriesRef !== pane.series) {
      destroy();
      seriesRef = pane.series;
    }

    if (!pane.series.createOrderLine) {
      console.warn("[BWC:order-line] series.createOrderLine missing — run npm run vendor and hard refresh");
      return;
    }

    /** @type {Set<string>} */
    const activeIds = new Set();

    for (const state of states) {
      if (state.removed || !Number.isFinite(state.price)) continue;
      activeIds.add(state.id);

      const options = stateToOrderLineOptions(state);
      const existing = lines.get(state.id);
      let handle = existing;
      if (handle) {
        handle.applyOptions(options);
      } else {
        handle = pane.series.createOrderLine(options);
        lines.set(state.id, handle);
      }

      const adapter = adapters?.get(state.id);
      if (adapter?._state) {
        adapter._state._nativeLine = handle;
      }
    }

    for (const [id, line] of lines) {
      if (activeIds.has(id)) continue;
      try {
        pane.series.removeOrderLine(line);
      } catch {
        /* ignore */
      }
      lines.delete(id);
      const adapter = adapters?.get(id);
      if (adapter?._state) adapter._state._nativeLine = null;
    }
  }

  function destroy() {
    if (seriesRef) {
      for (const line of lines.values()) {
        try {
          seriesRef.removeOrderLine(line);
        } catch {
          /* ignore */
        }
      }
    }
    lines.clear();
    seriesRef = null;
  }

  return { sync, destroy };
}

/** @param {import("./types.js").OrderLineState} state */
export function orderLineOverlayState(state) {
  return state;
}

/** @param {import("./types.js").OrderLineState} state */
export function applyNativeOrderLinePatch(state, patch) {
  const native = state._nativeLine;
  if (!native?.applyOptions) return false;
  native.applyOptions(patch);
  return true;
}
