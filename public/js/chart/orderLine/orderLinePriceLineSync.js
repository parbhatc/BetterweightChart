import { LineStyle } from "lightweight-charts";
import {
  attachCustomPriceLineHost,
  customPriceLineLabelHeight,
} from "../../primitives/priceLine/customPriceLine.js";
import { symbolLabelAnchorsForPane } from "../scale/symbolLabelAnchors.js";
import { formatOrderLinePrice } from "./rowLayout.js";

/** @param {number} lineStyle */
function mapOrderLineStyle(lineStyle) {
  if (lineStyle === 2) return LineStyle.Dotted;
  if (lineStyle === 1) return LineStyle.Dashed;
  return LineStyle.Solid;
}

/**
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null | undefined} symbolInfo
 */
function reservedAnchorsForOrderLines(pane, settingsStore, symbolInfo) {
  const anchors = [...symbolLabelAnchorsForPane(pane, settingsStore, symbolInfo)];
  if (!pane?.chart) return anchors;

  const quote = pane.quote ?? null;
  const sc = settingsStore?.get?.().scales ?? {};
  const labelHeight = customPriceLineLabelHeight(pane.chart, false);

  if (quote?.bid != null && Number.isFinite(quote.bid) && (sc.bidLabelLine || sc.bidLabelValue)) {
    anchors.push({ price: quote.bid, labelHeight });
  }
  if (quote?.ask != null && Number.isFinite(quote.ask) && (sc.askLabelLine || sc.askLabelValue)) {
    anchors.push({ price: quote.ask, labelHeight });
  }
  return anchors;
}

/**
 * Sync TradingView order lines to custom price lines (same renderer as symbol / bid / ask).
 * @param {() => object | null | undefined} getActivePane
 * @param {() => { useStacked?: boolean, getReservedAnchors?: () => object[] }} getAxisLabelConfig
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings> | null} settingsStore
 * @param {() => object | null | undefined} symbolInfo
 */
export function createOrderLinePriceLineSync(
  getActivePane,
  getAxisLabelConfig,
  settingsStore,
  symbolInfo,
) {
  /** @type {ReturnType<typeof attachCustomPriceLineHost> | null} */
  let host = null;
  /** @type {import("lightweight-charts").ISeriesApi | null} */
  let seriesRef = null;
  /** @type {Map<string, { applyOptions: Function, remove: Function }>} */
  const handleIds = new Map();

  function ensureHost(pane) {
    if (host && seriesRef === pane.series) return host;
    destroy();
    seriesRef = pane.series;
    host = attachCustomPriceLineHost({
      series: pane.series,
      getContext: () => {
        const cfg = getAxisLabelConfig();
        const placement = settingsStore?.get?.().scales?.scalesPlacement ?? "right";
        const scaleId = placement === "left" ? "left" : "right";
        const paneChart = pane.chart;
        const info = typeof symbolInfo === "function" ? symbolInfo() : symbolInfo;
        return {
          scaleId,
          scaleVisible: paneChart?.priceScale?.(scaleId)?.width?.() > 0,
          reservedAnchors:
            cfg.getReservedAnchors?.() ?? reservedAnchorsForOrderLines(pane, settingsStore, info),
          noOverlappingLabels: cfg.useStacked !== false,
        };
      },
    });
    return host;
  }

  /** @param {import("./types.js").OrderLineState[]} states */
  function sync(states) {
    const pane = getActivePane();
    if (!pane?.series) {
      destroy();
      return;
    }
    const h = ensureHost(pane);
    /** @type {Set<string>} */
    const activeIds = new Set();

    for (const state of states) {
      if (state.removed || !Number.isFinite(state.price)) continue;
      activeIds.add(state.id);

      const color = state.lineColor || state.bodyBackgroundColor || "#089981";
      const options = {
        id: state.id,
        price: state.price,
        color,
        lineVisible: true,
        axisLabelVisible: true,
        axisLabelColor: color,
        axisLabelTextColor: "#ffffff",
        axisLabelText: formatOrderLinePrice(state.price),
        axisSubtitleText: "",
        title: "",
        lineWidth: 1,
        lineStyle: mapOrderLineStyle(state.lineStyle),
      };

      const existing = handleIds.get(state.id);
      if (existing) existing.applyOptions(options);
      else handleIds.set(state.id, h.createCustomPriceLine(options));
    }

    for (const [id, handle] of handleIds) {
      if (!activeIds.has(id)) {
        handle.remove();
        handleIds.delete(id);
      }
    }

    h.requestRefresh();
  }

  function destroy() {
    for (const handle of handleIds.values()) handle.remove();
    handleIds.clear();
    host?.destroy();
    host = null;
    seriesRef = null;
  }

  return { sync, destroy };
}

/** Overlay pills: PnL + qty + cancel on the line; axis chip is price only. */
export function orderLineOverlayState(state) {
  return state;
}
