import { LineSeries, AreaSeries, HistogramSeries } from "lightweight-charts";
import { getIndicatorClass } from "../catalog.js";
import { indicatorPriceFormatFromSetting } from "../../chart/timezone/list.js";
import { attachIndicatorBandFillPrimitive } from "../primitives/bandFill.js";
import {
  seriesKindForPlotType,
  lineOptionsForPlotType,
  areaOptionsForPlotType,
  buildNumericPlotPoints,
} from "../plotTypes.js";
import {
  isStudyPaneIndicator,
  assignStudyLwcPanes,
  syncAllStudyPanes,
  activeStudyOrdersOnPane,
} from "../studyPane.js";
import {
  LINE_STYLES,
  MAIN_SCALE_BOTTOM_DEFAULT,
  MAIN_SCALE_BOTTOM_WITH_VOLUME,
  VOLUME_OVERLAY_TOP_MARGIN,
  STUDY_PANE_SCALE_MARGINS,
  OSCILLATOR_PANE_SCALE_MARGINS,
  overlayVolumeScaleId,
  isVolumeOverlayPlot,
  resolvePlotType,
  numericPlotKeys,
  plotRenderOrder,
  plotDefFor,
  seriesPaneIndex,
} from "./plotHelpers.js";

/**
 * @param {object} deps
 * @param {() => object[]} deps.getAllChartPanes
 * @param {(pane: object) => { utcBars: object[], chartBars: object[] }} deps.getPaneBars
 * @param {() => Map<string, import("../types.js").IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }>} deps.getInstances
 * @param {(paneIndex: number) => import("../types.js").IndicatorInstance[]} deps.indicatorsForPane
 * @param {(instance: import("../types.js").IndicatorInstance, Indicator: typeof import("../BaseIndicator.js").BaseIndicator) => void} deps.syncOverlayPrimitive
 * @param {() => boolean} deps.useStackedScaleLabels
 */
export function createSeriesSync(deps) {
  const { getPaneBars, getInstances, indicatorsForPane, syncOverlayPrimitive, useStackedScaleLabels } =
    deps;

  /** @param {number} paneIndex */
  function paneByIndex(paneIndex) {
    return deps.getAllChartPanes().find((p) => p.index === paneIndex);
  }

  /** @param {import("../types.js").IndicatorInstance & { series?: Map<string, import("lightweight-charts").ISeriesApi> }} instance */
  function destroySeries(instance) {
    const pane = paneByIndex(instance.paneIndex);
    instance._studyBandFill?.destroy?.();
    instance._studyBandFill = null;
    instance._studyPaneLegend?.destroy?.();
    instance._studyPaneLegend = null;
    instance._overlayPrimitive?.destroy?.();
    instance._overlayPrimitive = null;
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

  /** @param {import("../types.js").IndicatorInstance} instance @param {object | null | undefined} symbolInfo @param {string} plotKey @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator */
  function seriesPriceFormat(instance, symbolInfo, plotKey, Indicator) {
    const plotDef = plotDefFor(Indicator, plotKey);
    if (plotDef.type === "histogram" && Indicator.volumeScaleId) {
      return { type: "volume" };
    }
    const pref = instance.style.precision;
    const setting = pref && pref !== "default" ? String(pref) : undefined;
    return indicatorPriceFormatFromSetting(setting, symbolInfo ?? undefined);
  }

  /** @param {import("../types.js").IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi>, _studyBandFill?: { destroy: () => void, requestRefresh: () => void } | null }} instance @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator */
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

  /** @param {import("../types.js").IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} instance @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator */
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
    const instances = getInstances();
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

  /** @param {import("../types.js").IndicatorInstance & { series: Map<string, import("lightweight-charts").ISeriesApi> }} instance */
  function ensureSeries(instance) {
    const Indicator = getIndicatorClass(instance.defId);
    const pane = paneByIndex(instance.paneIndex);
    if (!Indicator || !pane) return;

    if (Indicator.overlayPrimitive) {
      syncOverlayPrimitive(instance, Indicator);
      return;
    }
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

    const stackedLabels = useStackedScaleLabels();

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

  return {
    destroySeries,
    ensureSeries,
    syncStudyPaneScale,
    syncPaneVolumeMargins,
    rebuildStudyScaleLocks,
    collapseEmptyStudyPanes,
  };
}
