import { LineSeries, AreaSeries, HistogramSeries, LineStyle } from "lightweight-charts";
import { createIndicatorInstance, getIndicatorClass } from "./catalog.js";
import { isIndicatorVisibleOnResolution } from "./visibility.js";
import { indicatorPriceFormatFromSetting, indicatorDisplayPrecision } from "../chart/timezone/list.js";
import { plotStyleKeys } from "./schema.js";
import { barIndexForHover } from "../chart/pane/hoverBar.js";
import { attachIndicatorBandFillPrimitive } from "./primitives/bandFill.js";
import { rafThrottle } from "../chart/pan/perf.js";
import {
  seriesKindForPlotType,
  lineOptionsForPlotType,
  areaOptionsForPlotType,
  buildNumericPlotPoints,
} from "./plotTypes.js";
import {
  isStudyPaneIndicator,
  assignStudyLwcPanes,
  syncAllStudyPanes,
  activeStudyOrdersOnPane,
} from "./studyPane.js";

/** @typedef {import("./types.js").IndicatorInstance} IndicatorInstance */

const LINE_STYLES = [LineStyle.Solid, LineStyle.Dotted, LineStyle.Dashed, LineStyle.LargeDashed];

const MAIN_SCALE_BOTTOM_DEFAULT = 0.12;
const MAIN_SCALE_BOTTOM_WITH_VOLUME = 0.26;
const VOLUME_OVERLAY_TOP_MARGIN = 0.78;

/** @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef */
function overlayVolumeScaleId(Indicator, plotDef) {
  return plotDef.priceScaleId ?? Indicator.volumeScaleId ?? "volume-overlay";
}

/** @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef */
function isVolumeOverlayPlot(Indicator, plotDef) {
  return Boolean(plotDef.overlay || (plotDef.type === "histogram" && Indicator.volumeScaleId));
}

/** @param {IndicatorInstance} instance @param {string} plotKey @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef */
function resolvePlotType(instance, plotKey, Indicator, plotDef) {
  const keys = plotStyleKeys(plotKey);
  const stored = instance.style[keys.plotTypeKey];
  if (stored) return String(stored);
  if (plotDef.type === "histogram" && Indicator.volumeScaleId) return "columns";
  if (plotDef.type === "histogram") return "histogram";
  return "line";
}

  /** @param {object} pane @param {(pane: object) => { utcBars: object[], chartBars: object[] }} getPaneBars */
function createBarIndexForLegend(getPaneBars) {
  /** @param {object} pane @param {object | null | undefined} hoverBar */
  return (pane, hoverBar) => {
    const { utcBars } = getPaneBars(pane);
    const barsForPane = (p) => p.bars ?? utcBars;
    return barIndexForHover(pane, hoverBar, utcBars, barsForPane);
  };
}

/** @param {Record<string, Array<number | null>>} plots */
function numericPlotKeys(plots) {
  return Object.keys(plots).filter((key) => {
    const arr = plots[key];
    if (!Array.isArray(arr) || !arr.length) return false;
    return arr.some((v) => v == null || typeof v === "number");
  });
}

/** @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator @param {string[]} plotKeys */
function plotRenderOrder(Indicator, plotKeys) {
  /** @type {string[]} */
  const bands = [];
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const other = [];
  for (const key of plotKeys) {
    const def = plotDefFor(Indicator, key);
    if (def.band) bands.push(key);
    else if (def.type === "histogram") other.push(key);
    else lines.push(key);
  }
  return [...bands, ...lines, ...other];
}

/** @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator @param {string} key */
function plotDefFor(Indicator, key) {
  return Indicator.getPlotDef?.(key) ?? Indicator.plots?.find((p) => p.id === key) ?? { type: "line" };
}

const STUDY_PANE_SCALE_MARGINS = { top: 0.02, bottom: 0.02 };
const OSCILLATOR_PANE_SCALE_MARGINS = { top: 0.04, bottom: 0.08 };

/** @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef @param {IndicatorInstance} instance */
function seriesPaneIndex(Indicator, plotDef, instance) {
  if (plotDef.paneIndex != null) return plotDef.paneIndex;
  if (instance._lwcStudyPane != null) return instance._lwcStudyPane;
  return 0;
}

/**
 * @param {object} opts
 * @param {() => object[]} opts.getAllChartPanes
 * @param {(pane: object) => { utcBars: object[], chartBars: object[] }} opts.getPaneBars
 * @param {() => void} opts.onChange
 * @param {() => boolean} [opts.useStackedScaleLabels]
 */
export function createIndicatorController(opts) {
  const { getAllChartPanes, getPaneBars, onChange, useStackedScaleLabels = () => true } = opts;
  const barIndexForLegend = createBarIndexForLegend(getPaneBars);

  /** @type {Map<string, IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }>} */
  const instances = new Map();
  /** @type {string | null} */
  let selectedId = null;

  function emit() {
    onChange?.();
  }

  /** @param {number} paneIndex */
  function paneByIndex(paneIndex) {
    return getAllChartPanes().find((p) => p.index === paneIndex);
  }

  /** @param {IndicatorInstance & { series?: Map<string, import("lightweight-charts").ISeriesApi> }} instance */
  function destroySeries(instance) {
    const pane = paneByIndex(instance.paneIndex);
    instance._studyBandFill?.destroy?.();
    instance._studyBandFill = null;
    instance._studyPaneLegend?.destroy?.();
    instance._studyPaneLegend = null;
    if (!pane || !instance.series) return;
    for (const s of instance.series.values()) {
      try {
        pane.chart.removeSeries(s);
      } catch {
        /* already removed */
      }
    }
    instance.series.clear();
    if (instance.seriesRender) instance.seriesRender.clear();
  }

  /** @param {IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi>, _studyBandFill?: { destroy: () => void, requestRefresh: () => void } | null }} instance @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator */
  function syncStudyBandFill(instance, Indicator) {
    if (!isStudyPaneIndicator(Indicator) || !Indicator.fills?.length) return;
    const anchor = instance.series.get(Indicator.primaryPlotKey);
    if (!anchor) return;
    const getFills = () => {
      const pane = paneByIndex(instance.paneIndex);
      if (!pane) return [];
      const { chartBars } = getPaneBars(pane);
      return Indicator.getBandFills(instance, chartBars);
    };
    if (!instance._studyBandFill) {
      instance._studyBandFill = attachIndicatorBandFillPrimitive({
        series: anchor,
        getConfig: () => ({ getFills }),
      });
    } else {
      instance._studyBandFill.requestRefresh();
    }
  }

  /** @param {IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} instance @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator */
  function syncStudyPaneScale(instance, Indicator) {
    const scaleRange = Indicator.studyPaneScale;
    const lwcPane = instance._lwcStudyPane;
    if (!scaleRange || lwcPane == null) return;
    const pane = paneByIndex(instance.paneIndex);
    if (!pane) return;
    if (!pane.studyScaleLocks) pane.studyScaleLocks = new Map();
    pane.studyScaleLocks.set(lwcPane, scaleRange);

    const autoscaleProvider = () => ({
      priceRange: {
        minValue: scaleRange.min,
        maxValue: scaleRange.max,
      },
    });

    for (const series of instance.series.values()) {
      series.applyOptions({ autoscaleInfoProvider: autoscaleProvider });
    }

    const anchor = instance.series.get(Indicator.primaryPlotKey);
    anchor?.priceScale().applyOptions({
      autoScale: true,
      scaleMargins: STUDY_PANE_SCALE_MARGINS,
      borderVisible: false,
    });
  }

  /** @param {IndicatorInstance} instance @param {object | null | undefined} symbolInfo @param {string} plotKey @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator */
  function seriesPriceFormat(instance, symbolInfo, plotKey, Indicator) {
    const plotDef = plotDefFor(Indicator, plotKey);
    if (plotDef.type === "histogram" && Indicator.volumeScaleId) {
      return { type: "volume" };
    }
    const pref = instance.style.precision;
    const setting = pref && pref !== "default" ? String(pref) : undefined;
    return indicatorPriceFormatFromSetting(setting, symbolInfo ?? undefined);
  }

  /** @param {import("lightweight-charts").IChartApi} chart @param {number} chartPaneIndex */
  function collapseEmptyStudyPanes(chart, chartPaneIndex) {
    const orders = activeStudyOrdersOnPane(indicatorsForPane, chartPaneIndex);
    const panes = chart.panes?.();
    if (!panes?.length) return;
    if (!orders.length) {
      for (let i = 1; i < panes.length; i += 1) panes[i]?.setHeight(1);
      return;
    }
    syncAllStudyPanes(chart, indicatorsForPane, chartPaneIndex);
  }

  /** @param {object} pane */
  function syncPaneVolumeMargins(pane) {
    const hasVolume = [...instances.values()].some((inst) => {
      if (inst.hidden || inst.paneIndex !== pane.index) return false;
      const Indicator = getIndicatorClass(inst.defId);
      if (!Indicator?.volumeScaleId) return false;
      return inst.style.volVisible !== false;
    });
    try {
      pane.series?.priceScale()?.applyOptions({
        scaleMargins: {
          top: 0.08,
          bottom: hasVolume ? MAIN_SCALE_BOTTOM_WITH_VOLUME : MAIN_SCALE_BOTTOM_DEFAULT,
        },
      });
    } catch {
      /* ignore */
    }
  }

  /** @param {IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} instance */
  function ensureSeries(instance) {
    const Indicator = getIndicatorClass(instance.defId);
    const pane = paneByIndex(instance.paneIndex);
    if (!Indicator || !pane) return;
    assignStudyLwcPanes(indicatorsForPane, instance.paneIndex);
    const symbolInfo = pane.symbolInfo ?? null;
    const showScaleLabels = instance.style.labelsOnScale !== false;

    const { utcBars, chartBars } = getPaneBars(pane);
    if (!utcBars.length || utcBars.length !== chartBars.length) return;

    if (!instance.series) instance.series = new Map();
    if (!instance.seriesRender) instance.seriesRender = new Map();

    const plots = Indicator.compute(utcBars, instance);
    instance.lastPlots = plots;
    const plotKeys = numericPlotKeys(plots);
    const histogramColors = plots.histColors ?? plots.volColors;
    const activePlotIds = new Set(
      Indicator.activePlots?.(instance.inputs, instance.style).map((p) => p.id) ?? plotKeys,
    );

    for (const key of [...instance.series.keys()]) {
      if (!plotKeys.includes(key) || !activePlotIds.has(key)) {
        try {
          pane.chart.removeSeries(instance.series.get(key));
        } catch {
          /* ignore */
        }
        instance.series.delete(key);
        instance.seriesRender?.delete(key);
      }
    }

    for (const key of plotRenderOrder(Indicator, plotKeys)) {
      if (!activePlotIds.has(key)) continue;
      const plotDef = plotDefFor(Indicator, key);
      const priceFormat = seriesPriceFormat(instance, symbolInfo, key, Indicator);
      const overlayVol = isVolumeOverlayPlot(Indicator, plotDef);
      const paneIdx = overlayVol ? 0 : seriesPaneIndex(Indicator, plotDef, instance);
      const volScaleId = overlayVol ? overlayVolumeScaleId(Indicator, plotDef) : undefined;
      const plotType = resolvePlotType(instance, key, Indicator, plotDef);
      const fallbackKind = plotDef.type === "histogram" ? "histogram" : "line";
      const seriesKind = seriesKindForPlotType(plotType, fallbackKind);
      const renderKey = `${seriesKind}|${plotType}`;
      let series = instance.series.get(key);

      if (series && instance.seriesRender.get(key) !== renderKey) {
        try {
          pane.chart.removeSeries(series);
        } catch {
          /* ignore */
        }
        instance.series.delete(key);
        series = undefined;
      }

      const style = Indicator.plotStyle(instance, key);
      const stackedLabels = useStackedScaleLabels();
      const isBandPlot = plotDef.band === true;
      const showThisAxisLabel = showScaleLabels && style.visible && !instance.hidden;
      const onStudyPane = instance._lwcStudyPane != null && paneIdx === instance._lwcStudyPane;
      const useNativeAxisLabel =
        overlayVol || onStudyPane ? showThisAxisLabel : showThisAxisLabel && !stackedLabels;
      const showHorizPriceLine =
        !isBandPlot && style.priceLine && style.visible && !instance.hidden;

      const commonOpts = {
        priceFormat,
        priceLineVisible: showHorizPriceLine,
        lastValueVisible: useNativeAxisLabel,
        crosshairMarkerVisible: false,
        visible: !instance.hidden && style.visible,
        ...(volScaleId ? { priceScaleId: volScaleId } : {}),
      };

      if (seriesKind === "histogram") {
        if (!series) {
          series = pane.chart.addSeries(
            HistogramSeries,
            { ...commonOpts, priceLineVisible: showHorizPriceLine, lastValueVisible: useNativeAxisLabel },
            paneIdx,
          );
          instance.series.set(key, series);
          instance.seriesRender.set(key, renderKey);
        } else {
          series.applyOptions(commonOpts);
        }

        if (overlayVol) {
          series.priceScale().applyOptions({
            scaleMargins: { top: VOLUME_OVERLAY_TOP_MARGIN, bottom: 0 },
            visible: showThisAxisLabel,
            borderVisible: false,
            entireTextOnly: true,
          });
          syncPaneVolumeMargins(pane);
        } else if (onStudyPane) {
          series.priceScale().applyOptions({
            scaleMargins: OSCILLATOR_PANE_SCALE_MARGINS,
            borderVisible: false,
          });
        } else {
          series.priceScale().applyOptions({
            scaleMargins: { top: 0.05, bottom: 0 },
          });
        }

        /** @type {{ time: import("lightweight-charts").Time, value: number, color?: string }[]} */
        const data = [];
        for (let i = 0; i < utcBars.length; i++) {
          const val = plots[key]?.[i];
          if (val == null || !Number.isFinite(val)) continue;
          const point = { time: chartBars[i].time, value: val };
          const barColor = histogramColors?.[i];
          if (barColor) point.color = barColor;
          else if (style.color) point.color = style.color;
          data.push(point);
        }
        series.setData(data);
        continue;
      }

      if (seriesKind === "area") {
        if (!series) {
          series = pane.chart.addSeries(
            AreaSeries,
            {
              ...commonOpts,
              ...areaOptionsForPlotType(plotType, style.color, style.width, style.lineStyle, LINE_STYLES),
            },
            paneIdx,
          );
          instance.series.set(key, series);
          instance.seriesRender.set(key, renderKey);
        } else {
          series.applyOptions({
            ...commonOpts,
            ...areaOptionsForPlotType(plotType, style.color, style.width, style.lineStyle, LINE_STYLES),
          });
        }
        if (volScaleId) {
          series.priceScale().applyOptions({
            scaleMargins: { top: VOLUME_OVERLAY_TOP_MARGIN, bottom: 0 },
            visible: showThisAxisLabel,
            borderVisible: false,
            entireTextOnly: true,
          });
        }
        series.setData(buildNumericPlotPoints(plots[key] ?? [], chartBars, plotType));
        continue;
      }

      if (!series) {
        series = pane.chart.addSeries(
          LineSeries,
          {
            ...commonOpts,
            ...lineOptionsForPlotType(plotType, style.color, style.width, style.lineStyle, LINE_STYLES),
            title: "",
          },
          paneIdx,
        );
        instance.series.set(key, series);
        instance.seriesRender.set(key, renderKey);
      } else {
        series.applyOptions({
          ...commonOpts,
          ...lineOptionsForPlotType(plotType, style.color, style.width, style.lineStyle, LINE_STYLES),
          title: "",
        });
      }
      if (volScaleId) {
        series.priceScale().applyOptions({
          scaleMargins: { top: VOLUME_OVERLAY_TOP_MARGIN, bottom: 0 },
          visible: showThisAxisLabel,
          borderVisible: false,
          entireTextOnly: true,
        });
      } else if (onStudyPane) {
        series.priceScale().applyOptions({
          scaleMargins: OSCILLATOR_PANE_SCALE_MARGINS,
          borderVisible: false,
        });
      }
      series.setData(buildNumericPlotPoints(plots[key] ?? [], chartBars, plotType));
    }

    syncStudyPaneScale(instance, Indicator);
    syncStudyBandFill(instance, Indicator);
    collapseEmptyStudyPanes(pane.chart, pane.index);
  }

  /** @param {IndicatorInstance} instance */
  function refreshInstance(instance) {
    const pane = paneByIndex(instance.paneIndex);
    if (!pane) return;
    const visible =
      isIndicatorVisibleOnResolution(pane.resolution, instance.visibility) &&
      (instance.inputs.timeframe == null ||
        instance.inputs.timeframe === "chart" ||
        instance.inputs.timeframe === pane.resolution);
    if (!visible) {
      destroySeries(instance);
      return;
    }
    ensureSeries(instance);
  }

  function refreshAll() {
    for (const instance of instances.values()) refreshInstance(instance);
    for (const pane of getAllChartPanes()) syncPaneVolumeMargins(pane);
    emit();
  }

  /** @param {object} pane */
  function rebuildStudyScaleLocks(pane) {
    if (!pane.studyScaleLocks) pane.studyScaleLocks = new Map();
    pane.studyScaleLocks.clear();
    for (const inst of indicatorsForPane(pane.index)) {
      const Indicator = getIndicatorClass(inst.defId);
      const lwcPane = inst._lwcStudyPane;
      if (lwcPane != null && Indicator?.studyPaneScale) {
        pane.studyScaleLocks.set(lwcPane, Indicator.studyPaneScale);
      }
    }
  }

  /** @param {number} [paneIndex] */
  function refreshPaneNow(paneIndex) {
    const paneIndexes =
      paneIndex == null ? getAllChartPanes().map((p) => p.index) : [paneIndex];
    for (const idx of paneIndexes) assignStudyLwcPanes(indicatorsForPane, idx);

    for (const instance of instances.values()) {
      if (paneIndex == null || instance.paneIndex === paneIndex) refreshInstance(instance);
    }

    for (const idx of paneIndexes) {
      const pane = paneByIndex(idx);
      if (pane) syncAllStudyPanes(pane.chart, indicatorsForPane, idx);
    }

    if (paneIndex != null) {
      const pane = paneByIndex(paneIndex);
      if (pane) {
        syncPaneVolumeMargins(pane);
        rebuildStudyScaleLocks(pane);
      }
    } else {
      for (const pane of getAllChartPanes()) {
        syncPaneVolumeMargins(pane);
        rebuildStudyScaleLocks(pane);
      }
    }
    emit();
  }

  const refreshPane = rafThrottle(refreshPaneNow);

  /** @param {number} [paneIndex] */
  function refreshPaneImmediate(paneIndex) {
    refreshPaneNow(paneIndex);
  }

  /** @param {string} defId @param {number} [paneIndex] */
  function addIndicator(defId, paneIndex = 0) {
    const inst = createIndicatorInstance(defId, paneIndex);
    if (!inst) return null;
    /** @type {IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} */
    const entry = { ...inst, series: new Map() };
    instances.set(entry.instanceId, entry);
    selectedId = entry.instanceId;
    refreshInstance(entry);
    refreshPaneImmediate(paneIndex);
    emit();
    return entry.instanceId;
  }

  /** @param {string} instanceId */
  function removeIndicator(instanceId) {
    const inst = instances.get(instanceId);
    if (!inst) return;
    const paneIndex = inst.paneIndex;
    destroySeries(inst);
    instances.delete(instanceId);
    if (selectedId === instanceId) selectedId = null;
    const pane = paneByIndex(paneIndex);
    if (pane) {
      syncPaneVolumeMargins(pane);
      rebuildStudyScaleLocks(pane);
      collapseEmptyStudyPanes(pane.chart, paneIndex);
    }
    emit();
  }

  /** @param {string} instanceId @param {boolean} hidden */
  function setHidden(instanceId, hidden) {
    const inst = instances.get(instanceId);
    if (!inst) return;
    inst.hidden = hidden;
    refreshPaneImmediate(inst.paneIndex);
    emit();
  }

  /** @param {string | null} instanceId */
  function setSelected(instanceId) {
    selectedId = instanceId;
    emit();
  }

  /** @param {string} instanceId @param {object} patch */
  function patchIndicator(instanceId, patch) {
    const inst = instances.get(instanceId);
    if (!inst) return;
    if (patch.inputs) inst.inputs = { ...inst.inputs, ...patch.inputs };
    if (patch.style) inst.style = { ...inst.style, ...patch.style };
    if (patch.visibility) inst.visibility = { ...inst.visibility, ...patch.visibility };
    refreshInstance(inst);
    refreshPaneImmediate(inst.paneIndex);
    emit();
  }

  function clearAll() {
    for (const id of [...instances.keys()]) removeIndicator(id);
  }

  /** @returns {Record<string, IndicatorInstance[]>} */
  function getIndicatorsByPane() {
    /** @type {Record<string, IndicatorInstance[]>} */
    const byPane = {};
    for (const inst of instances.values()) {
      const key = String(inst.paneIndex);
      if (!byPane[key]) byPane[key] = [];
      byPane[key].push({
        instanceId: inst.instanceId,
        defId: inst.defId,
        type: inst.type,
        paneIndex: inst.paneIndex,
        inputs: structuredClone(inst.inputs),
        style: structuredClone(inst.style),
        visibility: structuredClone(inst.visibility),
        hidden: inst.hidden,
      });
    }
    return byPane;
  }

  /** @param {Record<string, IndicatorInstance[]> | null | undefined} byPane */
  function setIndicatorsByPane(byPane) {
    for (const id of [...instances.keys()]) {
      const inst = instances.get(id);
      if (inst) destroySeries(inst);
    }
    instances.clear();
    selectedId = null;

    if (!byPane || typeof byPane !== "object") {
      emit();
      return;
    }

    for (const list of Object.values(byPane)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        if (!raw?.defId || !getIndicatorClass(raw.defId)) continue;
        /** @type {IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} */
        const entry = {
          instanceId: raw.instanceId ?? `${raw.type}_${Math.random().toString(36).slice(2, 9)}`,
          defId: raw.defId,
          type: raw.type,
          paneIndex: Number(raw.paneIndex) || 0,
          inputs: { ...raw.inputs },
          style: { ...raw.style },
          visibility: { ...raw.visibility },
          hidden: Boolean(raw.hidden),
          series: new Map(),
        };
        instances.set(entry.instanceId, entry);
        refreshInstance(entry);
      }
    }
    emit();
  }

  /** @param {number} paneIndex */
  function indicatorsForPane(paneIndex) {
    return [...instances.values()].filter((i) => i.paneIndex === paneIndex);
  }

  function getCount() {
    return instances.size;
  }

  /** @param {number} paneIndex */
  function getCountForPane(paneIndex) {
    return indicatorsForPane(paneIndex).length;
  }

  /** @param {number} paneIndex */
  function clearForPane(paneIndex) {
    for (const id of [...instances.keys()]) {
      const inst = instances.get(id);
      if (inst?.paneIndex === paneIndex) removeIndicator(id);
    }
  }

  /** @param {object} pane @param {object | null} hoverBar @param {number} [precision] */
  function legendStateForPane(pane, hoverBar, precision = 2) {
    const idx = barIndexForLegend(pane, hoverBar);

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
      const values = [];
      if (inst.style.valuesInStatusLine !== false && inst.lastPlots) {
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
      }
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
    }).filter(Boolean);
  }

  /** @param {object} pane @param {number} lwcPaneIndex @param {object | null} hoverBar @param {number} [precision] */
  function studyLegendStateForLwcPane(pane, lwcPaneIndex, hoverBar, precision = 2) {
    const idx = barIndexForLegend(pane, hoverBar);
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
        const values = [];
        if (inst.style.valuesInStatusLine !== false && inst.lastPlots) {
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
                key === "histogram" && inst.lastPlots.histColors?.[idx]
                  ? inst.lastPlots.histColors[idx]
                  : style.color,
              hidden: !style.visible || inst.hidden,
            });
          }
        }
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

  /** @param {object} pane */
  function resyncStudyPaneScales(pane) {
    if (!pane) return;
    for (const inst of indicatorsForPane(pane.index)) {
      const Indicator = getIndicatorClass(inst.defId);
      if (Indicator?.studyPaneScale) syncStudyPaneScale(inst, Indicator);
    }
  }

  /** @param {object} pane */
  function resyncStudyPaneHeights(pane) {
    if (!pane) return;
    syncAllStudyPanes(pane.chart, indicatorsForPane, pane.index);
  }

  /** @param {object} pane */
  function refreshStudyPaneLegends(pane) {
    pane._studyLegendOverlay?.render?.();
  }

  /** @param {object} pane @param {object} overlay */
  function attachStudyLegendOverlay(pane, overlay) {
    pane._studyLegendOverlay = overlay;
  }

  return {
    addIndicator,
    removeIndicator,
    setHidden,
    setSelected,
    patchIndicator,
    refreshAll,
    refreshPane,
    refreshPaneImmediate,
    clearAll,
    getIndicatorsByPane,
    setIndicatorsByPane,
    indicatorsForPane,
    getCount,
    getCountForPane,
    clearForPane,
    legendStateForPane,
    studyLegendStateForLwcPane,
    bandFillsForPane,
    scaleLabelsForPane,
    refreshStudyPaneLegends,
    resyncStudyPaneHeights,
    resyncStudyPaneScales,
    attachStudyLegendOverlay,
    getInstance: (id) => instances.get(id) ?? null,
    getSelectedId: () => selectedId,
  };
}
