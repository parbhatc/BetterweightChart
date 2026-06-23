import { priceLineBarForPane } from "../../app/symbol/lineStyle.js";
import { customPriceLineLabelHeight } from "../../primitives/priceLine/customPriceLine.js";
import { stackedLabelCenterOffset } from "../../primitives/priceLine/axisLabelRenderer.js";
import { symbolPriceLabelHeight } from "../../primitives/priceLineLabel/index.js";

/**
 * Price-axis slots reserved by the symbol price line (study + order line stacking).
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null | undefined} symbolInfo
 */
export function symbolLabelAnchorsForPane(pane, settingsStore, symbolInfo) {
  const sc = settingsStore.get().scales ?? {};
  const useCustomLabel = Boolean(sc.countdownToBarClose);
  if (!useCustomLabel && !sc.symbolLabelValue) return [];
  const { close } = priceLineBarForPane(pane, settingsStore, pane.symbolInfo ?? symbolInfo);
  if (close == null || !Number.isFinite(close)) return [];
  const labelHeight = pane.chart
    ? customPriceLineLabelHeight(pane.chart, useCustomLabel)
    : symbolPriceLabelHeight(useCustomLabel);
  return [
    {
      price: close,
      labelHeight,
      labelCenterOffset: useCustomLabel ? stackedLabelCenterOffset() : 0,
    },
  ];
}
