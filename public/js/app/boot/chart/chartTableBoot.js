import { getIndicatorClass } from "../../../indicators/catalog.js";
import { chartTableMountEl, createChartTableOverlay } from "../../../chart/table/overlay.js";

/**
 * @typedef {object} ChartTableProvider
 * @property {(inst: import("../../../indicators/types.js").IndicatorInstance) => boolean} [isActive]
 * @property {(inst: import("../../../indicators/types.js").IndicatorInstance) => import("../../../chart/table/types.js").ChartTable[]} getTables
 */

/**
 * On-chart TradingView-style tables. Indicators opt in via `setUseChartTable(true)` and
 * either implement `chartTables(instance, ctx)` or `ctx.registerChartTableProvider(defId, provider)`.
 *
 * @param {import("./state.js").BootContext} ctx
 */
export function attachChartTableBoot(ctx) {
  /** @type {Map<string, ChartTableProvider>} */
  const providers = new Map();
  /** @type {Map<number, ReturnType<createChartTableOverlay>>} */
  const overlays = new Map();

  /** @param {string} defId @param {ChartTableProvider} provider */
  function registerChartTableProvider(defId, provider) {
    providers.set(defId, provider);
  }

  /** @param {object} pane */
  function ensureOverlay(pane) {
    const idx = pane.index;
    let overlay = overlays.get(idx);
    if (overlay) return overlay;

    const mountEl =
      chartTableMountEl(pane) ??
      (pane.index === 0 && ctx.chartWrap instanceof HTMLElement
        ? ctx.chartWrap.querySelector(".tv-chart-wrap__stage")
        : null);
    if (!(mountEl instanceof HTMLElement)) return null;

    overlay = createChartTableOverlay({ mountEl });
    overlays.set(idx, overlay);
    return overlay;
  }

  /** @param {object} pane @param {import("../../../indicators/types.js").IndicatorInstance} inst */
  function tablesForInstance(pane, inst) {
    if (inst.hidden) return [];

    const Indicator = getIndicatorClass(inst.defId);
    if (!Indicator?.useChartTable) return [];

    const provider = providers.get(inst.defId);
    if (provider) {
      if (provider.isActive && !provider.isActive(inst)) return [];
      return provider.getTables(inst) ?? [];
    }

    if (typeof Indicator.chartTables === "function") {
      return (
        Indicator.chartTables(inst, {
          pane,
          symbol: pane.symbol,
          resolution: pane.resolution,
          bars: pane.bars ?? [],
          symbolInfo: pane.symbolInfo ?? ctx.symbolInfo,
        }) ?? []
      );
    }

    return [];
  }

  /** @param {number} paneIndex */
  function collectTablesForPane(paneIndex) {
    const controller = ctx.indicatorController;
    const pane = ctx.getAllChartPanes?.().find((p) => p.index === paneIndex);
    if (!controller || !pane) return [];

    /** @type {import("../../../chart/table/types.js").ChartTable[]} */
    const out = [];
    for (const inst of controller.indicatorsForPane(paneIndex)) {
      out.push(...tablesForInstance(pane, inst));
    }
    return out;
  }

  /** @param {number} [paneIndex] */
  function syncChartTables(paneIndex) {
    const panes =
      paneIndex != null
        ? ctx.getAllChartPanes?.().filter((p) => p.index === paneIndex) ?? []
        : ctx.getAllChartPanes?.() ?? [];

    /** @type {Set<number>} */
    const seen = new Set();
    for (const pane of panes) {
      seen.add(pane.index);
      const overlay = ensureOverlay(pane);
      if (!overlay) continue;
      overlay.sync(collectTablesForPane(pane.index));
    }

    for (const [idx, overlay] of overlays) {
      if (!seen.has(idx)) {
        overlay.clear();
        overlays.delete(idx);
      }
    }
  }

  function clearChartTables() {
    for (const overlay of overlays.values()) overlay.clear();
    overlays.clear();
  }

  ctx.registerChartTableProvider = registerChartTableProvider;
  ctx.syncChartTables = syncChartTables;
  ctx.clearChartTables = clearChartTables;
}
