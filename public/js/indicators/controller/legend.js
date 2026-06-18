import { getIndicatorClass } from "../catalog.js";
import { isIndicatorVisibleOnResolution } from "../visibility.js";
import { indicatorDisplayPrecision } from "../../chart/timezone/list.js";
import { barIndexForHover } from "../../chart/pane/hoverBar.js";
import { isStudyPaneIndicator } from "../studyPane.js";
import { isVolumeOverlayPlot, plotDefFor } from "./plotHelpers.js";

/**
 * @param {object} deps
 * @param {(pane: object) => { utcBars: object[], chartBars: object[] }} deps.getPaneBars
 * @param {(paneIndex: number) => import("../types.js").IndicatorInstance[]} deps.indicatorsForPane
 * @param {() => string | null} deps.getSelectedId
 */
export function createLegendHelpers(deps) {
  const { getPaneBars, indicatorsForPane, getSelectedId } = deps;

  /** @param {object} pane @param {object | null | undefined} hoverBar */
  function barIndexForLegend(pane, hoverBar) {
    const { utcBars } = getPaneBars(pane);
    const barsForPane = (p) => p.bars ?? utcBars;
    return barIndexForHover(pane, hoverBar, utcBars, barsForPane);
  }

  /** @param {import("../types.js").IndicatorInstance} inst @param {number} idx @param {number} precision */
  function plotValuesForLegend(inst, idx, precision) {
    const Indicator = getIndicatorClass(inst.defId);
    if (!Indicator || inst.style.valuesInStatusLine === false || !inst.lastPlots) return [];
    /** @type {object[]} */
    const values = [];
    for (const { key, title } of Indicator.valueLabels(inst)) {
      const style = Indicator.plotStyle(inst, key);
      const raw = inst.lastPlots[key]?.[idx];
      const formatted =
        typeof Indicator.formatPlotValue === "function"
          ? Indicator.formatPlotValue(key, raw)
          : null;
      values.push({
        key,
        title,
        value:
          raw == null || !Number.isFinite(raw)
            ? null
            : (formatted ??
              Number(raw).toLocaleString(undefined, {
                minimumFractionDigits: precision,
                maximumFractionDigits: precision,
              })),
        color:
          (key === "vol" && inst.lastPlots.volColors?.[idx]
            ? inst.lastPlots.volColors[idx]
            : key === "histogram" && inst.lastPlots.histColors?.[idx]
              ? inst.lastPlots.histColors[idx]
              : style.color),
        hidden: !style.visible || inst.hidden,
      });
    }
    return values;
  }

  /** @param {object} pane @param {object | null} hoverBar @param {number} [precision] */
  function legendStateForPane(pane, hoverBar, precision = 2) {
    const idx = barIndexForLegend(pane, hoverBar);
    const selectedId = getSelectedId();

    return indicatorsForPane(pane.index)
      .filter((inst) => {
        const Indicator = getIndicatorClass(inst.defId);
        const onStudyPane = isStudyPaneIndicator(Indicator) || inst._lwcStudyPane != null;
        return !onStudyPane || inst.hidden;
      })
      .map((inst) => {
        const Indicator = getIndicatorClass(inst.defId);
        if (!Indicator) return null;
        const meta = Indicator.legendMeta(inst);
        return {
          instanceId: inst.instanceId,
          shortTitle: meta.shortTitle,
          title: meta.title,
          params: meta.params,
          values: plotValuesForLegend(inst, idx, precision),
          hidden: inst.hidden,
          selected: selectedId === inst.instanceId,
          color: Indicator.plotStyle(inst, Indicator.primaryPlotKey).color,
        };
      })
      .filter(Boolean);
  }

  /** @param {object} pane @param {number} lwcPaneIndex @param {object | null} hoverBar @param {number} [precision] */
  function studyLegendStateForLwcPane(pane, lwcPaneIndex, hoverBar, precision = 2) {
    const idx = barIndexForLegend(pane, hoverBar);
    const selectedId = getSelectedId();

    return indicatorsForPane(pane.index)
      .filter((inst) => {
        if (inst.hidden) return false;
        if (inst._lwcStudyPane !== lwcPaneIndex) return false;
        const Indicator = getIndicatorClass(inst.defId);
        return isStudyPaneIndicator(Indicator);
      })
      .map((inst) => {
        const Indicator = getIndicatorClass(inst.defId);
        if (!Indicator) return null;
        const meta = Indicator.legendMeta(inst);
        const values = plotValuesForLegend(inst, idx, precision).map((v) =>
          v.key === "histogram" && inst.lastPlots?.histColors?.[idx]
            ? { ...v, color: inst.lastPlots.histColors[idx] }
            : v,
        );
        return {
          instanceId: inst.instanceId,
          shortTitle: meta.shortTitle,
          title: meta.title,
          params: meta.params,
          values,
          hidden: inst.hidden,
          selected: selectedId === inst.instanceId,
          color: Indicator.plotStyle(inst, Indicator.primaryPlotKey).color,
        };
      })
      .filter(Boolean);
  }

  /** @param {object} pane */
  function bandFillsForPane(pane) {
    const { chartBars } = getPaneBars(pane);
    /** @type {{ color: string, segments: { time: number, upper: number, lower: number }[][] }[]} */
    const fills = [];

    for (const inst of indicatorsForPane(pane.index)) {
      const Indicator = getIndicatorClass(inst.defId);
      if (!Indicator || typeof Indicator.getBandFills !== "function") continue;
      if (isStudyPaneIndicator(Indicator)) continue;
      fills.push(...Indicator.getBandFills(inst, chartBars));
    }

    return fills;
  }

  /** @param {object} pane */
  function scaleLabelsForPane(pane) {
    const symbolInfo = pane.symbolInfo ?? null;
    /** @type {{ price: number, color: string, text: string }[]} */
    const labels = [];
    for (const inst of indicatorsForPane(pane.index)) {
      if (inst.hidden || inst.style.labelsOnScale === false || !inst.lastPlots) continue;
      const Indicator = getIndicatorClass(inst.defId);
      if (!Indicator || isStudyPaneIndicator(Indicator)) continue;
      const pref = inst.style.precision;
      const setting = pref && pref !== "default" ? String(pref) : undefined;
      const precision = indicatorDisplayPrecision(setting, symbolInfo ?? undefined);
      for (const { key } of Indicator.valueLabels(inst)) {
        const plotDef = plotDefFor(Indicator, key);
        if (isVolumeOverlayPlot(Indicator, plotDef)) continue;
        const style = Indicator.plotStyle(inst, key);
        if (!style.visible) continue;
        const series = inst.lastPlots[key];
        if (!series?.length) continue;
        const raw = series[series.length - 1];
        if (raw == null || !Number.isFinite(raw)) continue;
        labels.push({
          price: Number(raw),
          color: style.color,
          text: Number(raw).toLocaleString(undefined, {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision,
          }),
        });
      }
    }
    return labels;
  }

  return {
    legendStateForPane,
    studyLegendStateForLwcPane,
    bandFillsForPane,
    scaleLabelsForPane,
  };
}

/** @param {import("../types.js").IndicatorInstance} instance @param {number} paneIndex @param {() => object[]} getAllChartPanes */
export function isInstanceVisibleOnPane(instance, paneIndex, getAllChartPanes) {
  const pane = getAllChartPanes().find((p) => p.index === paneIndex);
  if (!pane) return false;
  return (
    isIndicatorVisibleOnResolution(pane.resolution, instance.visibility) &&
    (instance.inputs.timeframe == null ||
      instance.inputs.timeframe === "chart" ||
      instance.inputs.timeframe === pane.resolution)
  );
}
